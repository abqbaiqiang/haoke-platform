"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { CRMEntry } from "./crm-navigation";
import CustomerAnalyticsPanel from "./customer-analytics";
import { compact, currentMonth, dateTime, money, signedMoney as signed } from "./lib/format";
import { api as request, useData } from "./lib/api";
import type { AttentionPage, BiPerson as Person, Metric, OrderRow, Page, Role } from "./lib/types";
import { crmActivityLabels } from "./lib/labels";

type Workbench = { user_id: string; name: string; month: string; through: string; metrics: Metric[]; warnings: string[]; today_tasks: number; week_tasks: number; overdue_tasks: number; open_opportunities: number };
type Target = { amount: string | null; remark: string | null };
type Dimension = { id: string; name: string; current: string; previous: string | null; change: string | null; orders: number; customers: number; quantity: string | null; unit: string | null; average_price: string | null };
type Analysis = { month: string; through: string; previous_month: string; basis: string; verified: boolean; warnings: string[]; updated_at: string | null; metrics: Metric[]; trend: { date: string; value: string }[]; rows: Dimension[]; total_rows: number; total_change: string | null; other_change: string | null; line_difference: string | null };
type ProductMargins = { month: string; through: string; basis: string; warnings: string[]; metrics: Metric[]; total_sales: string; total_cost: string | null; total_profit: string | null; margin_rate: string | null; cost_coverage: string | null; rows: { product_id: string; name: string; quantity: string; sales: string; cost: string | null; profit: string | null; rate: string | null }[]; total: number };
type Settings = { rfm_recent_days: number; rfm_freq_orders: number; work_week: number[]; calendar: Record<string, boolean>; personal_calendar: Record<string, Record<string, boolean>>; dormant_days: number; lost_warning_days: number; followup_days: Record<string, number>; effective_activity_types: string[]; cancelled_tasks: "include" | "exclude" | null };
type Review = { coverage_from: string; coverage_to: string; valid_statuses: string[]; excluded_statuses: string[]; return_statuses: string[]; staff_mapping_complete: boolean; full_history: boolean; reason: string; acknowledge_export_scope: boolean };
type OrderPage = Page<OrderRow>;
type Detail = { order_no: string; amount: string; customer: string; lines: { line_no: number; quantity: string; amount: string }[] };

const value = (v: string | null | undefined) => v == null ? "—" : v;
/** 有效业务动作候选（沿用设置页键序，文案与 CRM 操作时间线一致）。 */
const actionNames: Record<string, string> = Object.fromEntries(["followup_create", "followup_update", "task_complete", "opportunity_create", "opportunity_update", "customer_update", "contact_create", "contact_update"].map(k => [k, crmActivityLabels[k]]));

function Feedback({ state }: { state: { loading: boolean; error?: string; retry: () => void } }) {
  return <>{state.loading && <p role="status">正在加载分析…</p>}{state.error && <p className="error" role="alert">{state.error} <button onClick={state.retry}>重试</button></p>}</>;
}
function Notes({ notes }: { notes: string[] }) { return <div className="bi-notes">{notes.map(n => <p key={n}>{n}</p>)}</div>; }
function Metrics({ rows }: { rows: Metric[] }) {
  return <div className="bi-metrics">{rows.map((m, i) => <section className="card" key={`${m.code}-${i}`}><span>{m.label}</span><strong>{value(m.value)}{m.value !== null && <small> {m.unit}</small>}</strong><details><summary>口径说明</summary><p>{m.definition || m.label} · {m.code}</p><p>来源：{m.source || "标准化业务数据"}</p></details>{m.reason && <p className="muted">{m.reason}</p>}</section>)}</div>;
}
function Pages({ offset, total, size, onChange }: { offset: number; total: number; size: number; onChange: (n: number) => void }) {
  return <div className="bi-pages"><button disabled={!offset} onClick={() => onChange(Math.max(0, offset - size))}>上一页</button><span>第 {Math.floor(offset / size) + 1} 页 · 共 {total} 项</span><button disabled={offset + size >= total} onClick={() => onChange(offset + size)}>下一页</button></div>;
}

/** 百分比指标直接作为条长（0–100），不额外推导任何比例。 */
function rate(value: string | null) {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}
/** 源口径下后端把所有指标代码统一为 DQ_SALES_RECON，故按指标名回退识别，避免界面错位。 */
const METRIC_LABELS: Record<string, string[]> = {
  EXEC_SALES_AMT: ["经营销售额", "源销售核对金额"],
  SALE_ORDER_COUNT: ["销售订单数", "源订单数"],
  SALE_CUSTOMER_COUNT: ["成交客户数", "源订单客户数"],
  SALE_MOM: ["销售额环比"],
  SALE_YOY: ["销售额同比"],
  SALE_MOM_BASE: ["上月完整月金额"],
  SALE_YOY_BASE: ["去年同期金额"],
};
function pick(metrics: Metric[], code: string) {
  return metrics.find(m => m.code === code) || metrics.find(m => (METRIC_LABELS[code] || []).includes(m.label));
}

/** 日销售趋势：本月每日金额柱，最新一天高亮，峰值与最新一天直接标注数值。 */
function DailyTrend({ points, month, through }: { points: Analysis["trend"]; month: string; through: string }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let chart: import("echarts").ECharts | undefined;
    const observer = new ResizeObserver(() => chart?.resize());
    if (element.current) observer.observe(element.current);
    import("echarts").then(echarts => {
      if (disposed || !element.current) return;
      const values = points.map(p => Number(p.value));
      const peak = values.reduce((best, v, i) => v > values[best] ? i : best, 0);
      const last = values.length - 1;
      chart = echarts.init(element.current, undefined, { renderer: "svg" });
      chart.setOption({ animation: false,
        grid: { left: 74, right: 18, top: 34, bottom: 30 },
        tooltip: { trigger: "axis", renderMode: "richText" },
        xAxis: { type: "category", data: points.map(p => String(Number(p.date.slice(8, 10)))), axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: "#71717a", fontSize: 11, interval: points.length > 20 ? 4 : points.length > 12 ? 2 : 0 } },
        yAxis: { type: "value", name: "元", nameTextStyle: { color: "#a1a1aa", fontSize: 11 }, splitLine: { lineStyle: { color: "#f1f1f3" } },
          axisLabel: { color: "#a1a1aa", fontSize: 11, formatter: (v: number) => compact(v) } },
        series: [{ type: "bar", barMaxWidth: 22,
          label: { show: true, position: "top", fontSize: 11, color: "#1d4ed8", fontWeight: 600,
            formatter: (params: { value: number; dataIndex: number }) => (params.dataIndex === peak || params.dataIndex === last) ? compact(params.value) : "" },
          data: values.map((v, i) => ({ value: v, itemStyle: { color: i === last ? "#2563eb" : "#93c5fd", borderRadius: [3, 3, 0, 0] } })) }],
      });
    });
    return () => { disposed = true; observer.disconnect(); chart?.dispose(); };
  }, [points]);
  const incomplete = Number(through.slice(8)) < new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return <section className="card sa-trend">
    <div className="sa-panel-head"><div>
      <h2>日销售趋势</h2>
      <p className="muted">{month.slice(0, 7)} 每日金额 · 统计截至 {through}{incomplete ? " · 本月为未完月" : ""}</p>
    </div></div>
    <div ref={element} className="bi-chart" role="img" aria-label={`${month.slice(0, 7)} 每日销售金额趋势，峰值与最新一天已标注，下方可展开精确金额`} />
    <details><summary>查看每日精确金额</summary><div className="bi-table-wrap"><table><thead><tr><th>日期</th><th>金额（元）</th></tr></thead><tbody>{points.map(p => <tr key={p.date}><td>{p.date}</td><td>{money(p.value)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

/** 环比 / 同比：数值与方向直接取后端指标，不做二次换算。 */
function Delta({ label, metric }: { label: string; metric?: Metric }) {
  if (!metric) return null;
  if (metric.value === null) return <span className="sa-delta sa-delta-missing">{label} 暂缺<small>（{metric.reason || "基期不可比"}）</small></span>;
  const negative = metric.value.startsWith("-");
  return <span className="sa-delta">{label} <b className={negative ? "sa-down" : "sa-up"}>{negative ? "▼" : "▲"} {negative ? metric.value.slice(1) : metric.value}%</b></span>;
}

/** 本期与基期的比例对照：条长按本组最大金额缩放，显示数值为后端原值。 */
function Comparison({ rows }: { rows: { label: string; metric?: Metric }[] }) {
  const values = rows.map(r => r.metric?.value == null ? null : Math.abs(Number(r.metric.value)));
  const max = Math.max(0, ...values.map(v => v === null || !Number.isFinite(v) ? 0 : v));
  return <div className="sa-compare">
    {rows.map((r, i) => <div className={`sa-cmp${i === 0 ? " is-current" : ""}`} key={r.label}>
      <span className="sa-cmp-label">{r.label}</span>
      <span className="sa-cmp-track" role="img" aria-label={r.metric?.value == null ? `${r.label} 暂不可用` : `${r.label} ${money(r.metric.value)} 元`}>
        <i style={{ width: `${values[i] === null || max === 0 ? 0 : Math.max(1, values[i]! / max * 100)}%` }} />
      </span>
      <span className="sa-cmp-value">{r.metric?.value == null ? "—" : <>{money(r.metric.value)}<small>元</small></>}</span>
      {r.metric?.value == null && r.metric?.reason && <small className="sa-cmp-reason">{r.metric.reason}</small>}
    </div>)}
  </div>;
}

/** 本期英雄区：一位主角数字 + 基期对照 + 常用计数指标列。 */
function SalesHero({ data }: { data: Analysis }) {
  const hero = data.metrics[0];
  const mom = pick(data.metrics, "SALE_MOM"), yoy = pick(data.metrics, "SALE_YOY");
  const prev = pick(data.metrics, "SALE_MOM_BASE"), year = pick(data.metrics, "SALE_YOY_BASE");
  const order = pick(data.metrics, "SALE_ORDER_COUNT"), customer = pick(data.metrics, "SALE_CUSTOMER_COUNT"), aov = pick(data.metrics, "SALE_AOV");
  const yearLabel = `${Number(data.month.slice(0, 4)) - 1}-${data.month.slice(5, 7)}`;
  return <section className="card sa-hero" aria-label={hero.label}>
    <div className="sa-hero-main">
      <span>{hero.label}</span>
      <strong className="sa-value">{hero.value === null ? "—" : <>{money(hero.value)}<small>元</small></>}</strong>
      <div className="sa-deltas">
        <Delta label="环比" metric={mom} />
        <Delta label="同比" metric={yoy} />
        <span className="sa-cmp-caption">对比 {data.previous_month.slice(0, 7)} 完整月</span>
      </div>
      <Comparison rows={[
        { label: `本期 ${data.month.slice(0, 7)}`, metric: hero },
        { label: `上月 ${data.previous_month.slice(0, 7)}`, metric: prev },
        { label: `去年 ${yearLabel}`, metric: year },
      ]} />
      <details className="sa-caliber"><summary>指标口径</summary>
        {[hero, mom, yoy, prev, year].map((m, i) => m && <p key={`${m.code}-${i}`}>{m.label}：{m.definition || m.label} · {m.source || "标准化业务数据"} · {m.code}</p>)}
      </details>
    </div>
    <dl className="sa-kpis">
      {order && <div><dt>销售订单数</dt><dd>{order.value === null ? "—" : <>{order.value}<small>单</small></>}</dd></div>}
      {customer && <div><dt>成交客户数</dt><dd>{customer.value === null ? "—" : <>{customer.value}<small>个</small></>}</dd></div>}
      {aov && <div><dt>平均客单价</dt><dd>{aov.value === null ? "—" : <>{money(aov.value)}<small>元</small></>}</dd></div>}
    </dl>
  </section>;
}

/** 销售分析：口径状态 → 英雄区 + 指标带 → 日趋势 → 变化贡献。 */
function SalesAnalysis({ data, dimension, offset, onPage, onDrill }: { data: Analysis; dimension: string; offset: number; onPage: (n: number) => void; onDrill: (row: Dimension) => void }) {
  const hero = data.metrics[0];
  const used = new Set<Metric>([hero, ...["SALE_MOM", "SALE_YOY", "SALE_MOM_BASE", "SALE_YOY_BASE"].map(c => pick(data.metrics, c)).filter((m): m is Metric => !!m)]);
  const strip = data.metrics.filter(m => !used.has(m));
  const max = Math.max(0, ...data.rows.map(r => r.change === null ? 0 : Math.abs(Number(r.change))));
  return <>
    <div className="sa-status">
      <h2 className="sa-basis">{data.basis} · {data.month.slice(0, 7)}</h2>
      <span className={data.verified ? "status-ready" : "status-pending"}>{data.verified ? "口径已核实" : "待业务核实"}</span>
      <span className="sa-meta">统计截至 {data.through} · 对比 {data.previous_month.slice(0, 7)} 完整月 · 最近事实更新 {data.updated_at ? dateTime(data.updated_at) : "暂无"}</span>
    </div>
    <Notes notes={data.warnings} />
    <div className="bi-metrics sa-metrics">
      <SalesHero data={data} />
      {strip.map((m, i) => <section className="card sa-stat" key={`${m.code}-${i}`}>
        <span>{m.label}</span>
        <strong>{m.value === null ? "—" : m.unit === "元" ? money(m.value) : m.value}{m.value !== null && <small> {m.unit}</small>}</strong>
        {rate(m.value) !== null && <span className="sa-bar" role="img" aria-label={`${m.label} ${m.value}%`}><i style={{ width: `${rate(m.value)}%` }} /></span>}
        {m.reason && <p className="muted">{m.reason}</p>}
        <details><summary>口径说明</summary><p>{m.definition || m.label} · {m.code}</p><p>来源：{m.source || "标准化业务数据"}</p></details>
      </section>)}
    </div>
    {!!data.trend.length && <DailyTrend points={data.trend} month={data.month} through={data.through} />}
    <section className="card sa-change">
      <div className="sa-panel-head"><div>
        <h2>销售变化贡献</h2>
        <p className="muted">按增减金额的绝对影响排序 · 双向条以中点为增长零点，条长按本页最大绝对变化缩放，金额为后端原值</p>
      </div></div>
      {data.rows.length ? <div className="bi-table-wrap"><table className="sa-change-table"><thead><tr>
        <th>名称</th><th>本期金额</th><th>上期金额</th><th>变化贡献</th>
        {dimension === "product" && <><th>数量/单位</th><th>均价</th></>}<th>下钻</th>
      </tr></thead><tbody>{data.rows.map(r => {
        const negative = r.change !== null && r.change.startsWith("-");
        const width = r.change === null || max === 0 ? 0 : Math.abs(Number(r.change)) / max * 100;
        return <tr key={r.id}>
          <td>{r.name}</td>
          <td className="sa-num">{money(r.current)}</td>
          <td className="sa-num">{r.previous === null ? "—" : money(r.previous)}</td>
          <td className="sa-change-cell">
            <span className={negative ? "sa-change-value sa-down" : "sa-change-value sa-up"}>{r.change === null ? "不可比" : signed(r.change)}<small>元</small></span>
            {r.change !== null && <span className="sa-diverge" role="img" aria-label={`${r.name} 变化贡献 ${money(r.change)} 元`}>
              <span className="sa-diverge-neg"><i style={{ width: `${negative ? width : 0}%` }} /></span>
              <span className="sa-diverge-pos"><i style={{ width: `${negative ? 0 : width}%` }} /></span>
            </span>}
          </td>
          {dimension === "product" && <><td>{r.quantity !== null ? `${r.quantity} ${r.unit || "单位待核实"}` : "不可跨单位汇总"}</td><td className="sa-num">{r.average_price === null ? "—" : money(r.average_price)}</td></>}
          <td><button onClick={() => onDrill(r)}>查看源订单</button></td>
        </tr>;
      })}</tbody></table></div> : <p>本口径暂无可用记录。</p>}
      <div className="sa-change-foot">
        <span>维度变化合计<b>{data.total_change === null ? "—" : `${money(data.total_change)} 元`}</b></span>
        <span>本页之外<b>{data.other_change === null ? "—" : `${money(data.other_change)} 元`}</b></span>
        {data.line_difference !== null && <span>订单头与明细差额<b>{money(data.line_difference)} 元</b></span>}
      </div>
      <Pages offset={offset} total={data.total_rows} size={20} onChange={onPage} />
    </section>
  </>;
}

function Orders({ source, month, dimension, item, close }: { source: string; month: string; dimension: string; item: { id: string; name: string }; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [offset, setOffset] = useState(0);
  const [orderId, setOrderId] = useState("");
  const [orderMonth, setOrderMonth] = useState(month);
  const list = useData<OrderPage>(`/api/bi/orders?source_id=${source}&month=${orderMonth}-01&dimension=${dimension}&key=${encodeURIComponent(item.id)}&offset=${offset}`);
  const detail = useData<Detail>(orderId ? `/api/data/sales/orders/${orderId}` : null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="bi-dialog" aria-labelledby="bi-orders-title" onCancel={close} onClose={close}><div className="bi-dialog-head"><h2 id="bi-orders-title">{item.name} · 源订单</h2><button onClick={close}>关闭订单</button></div><p className="muted">订单原始金额，按来源状态调整前；可切换月份查看历史。</p><label>订单月份<input type="month" value={orderMonth} onChange={e => { setOrderMonth(e.target.value || currentMonth()); setOffset(0); setOrderId(""); }} /></label>{orderId ? <><button onClick={() => setOrderId("")}>返回订单列表</button><Feedback state={detail} />{detail.data && <><h3>{detail.data.order_no}</h3><p>{detail.data.customer} · {detail.data.amount} 元</p><div className="bi-table-wrap"><table><thead><tr><th>行</th><th>数量</th><th>金额</th></tr></thead><tbody>{detail.data.lines.map(l => <tr key={l.line_no}><td>{l.line_no}</td><td>{l.quantity}</td><td>{l.amount}</td></tr>)}</tbody></table></div></>}</> : <><Feedback state={list} />{list.data && <><div className="bi-table-wrap"><table><thead><tr><th>单号</th><th>日期</th><th>源金额</th><th>来源状态</th><th>操作</th></tr></thead><tbody>{list.data.rows.map(o => <tr key={o.id}><td>{o.number}</td><td>{o.date}</td><td>{o.amount}</td><td>{o.status}</td><td><button onClick={() => setOrderId(o.id)}>查看明细</button></td></tr>)}</tbody></table></div>{!list.data.total && <p>该月没有可见订单。</p>}<Pages offset={offset} total={list.data.total} size={30} onChange={setOffset} /></>}</>}</dialog>;
}

function TargetForm({ person, month, changed }: { person: string; month: string; changed: () => void }) {
  const [kind, setKind] = useState<"monthly" | "quarterly">("monthly");
  const monthNum = Number(month.slice(5, 7));
  const quarterStartMonth = kind === "quarterly" ? (Math.floor((monthNum - 1) / 3) * 3 + 1) : monthNum;
  const periodMonth = `${month.slice(0, 4)}-${String(quarterStartMonth).padStart(2, "0")}`;
  const state = useData<Target>(`/api/bi/targets/${person}?month=${periodMonth}-01&type=${kind}`);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setMessage(""); setError("");
    try { await request(`/api/bi/targets/${person}?month=${periodMonth}-01&type=${kind}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: form.get("amount"), remark: form.get("remark") || null }) }); setMessage(kind === "quarterly" ? "季度目标已保存，修改历史已留痕" : "目标已保存，修改历史已留痕"); changed(); state.retry(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const quarterLabel = `Q${Math.floor((monthNum - 1) / 3) + 1}`;
  return <section className="card"><h2>销售目标</h2><div className="bi-form-grid"><label>目标类型<select value={kind} onChange={e => setKind(e.target.value as "monthly" | "quarterly")}><option value="monthly">月度目标</option><option value="quarterly">季度目标（{quarterLabel}）</option></select></label></div><Feedback state={state} />{state.data && <form aria-label="设置销售目标" onSubmit={save} key={`${person}-${periodMonth}-${kind}-${state.data.amount}`}><div className="bi-form-grid"><label>{kind === "quarterly" ? `季度目标金额（元，${month.slice(0, 4)} 年第 ${Math.floor((monthNum - 1) / 3) + 1} 季度）` : "月目标金额（元）"}<input name="amount" type="number" step="0.01" min="0" required defaultValue={state.data.amount || ""} /></label><label>调整说明<input name="remark" maxLength={255} defaultValue={state.data.remark || ""} /></label></div><button className="primary" disabled={busy}>保存{kind === "quarterly" ? "季度" : "月"}目标</button></form>}{message && <p role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}</section>;
}

function Configuration({ persons, source }: { persons: Person[]; source: string }) {
  const loaded = useData<Settings>("/api/bi/settings");
  const reviewState = useData<Review | null>(source ? `/api/bi/reviews/${source}` : null);
  const [config, setConfig] = useState<Settings>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [calendarDate, setCalendarDate] = useState("");
  const [calendarPerson, setCalendarPerson] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => { if (loaded.data) setConfig(loaded.data); }, [loaded.data]);
  async function save(url: string, body: unknown) {
    setBusy(true); setError(""); setMessage("");
    try { await request(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setMessage("设置已保存，修改已记录审计"); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function calendarAdd() {
    if (!calendarDate || !config) return;
    setConfig(calendarPerson ? { ...config, personal_calendar: { ...config.personal_calendar, [calendarPerson]: { ...config.personal_calendar[calendarPerson], [calendarDate]: working } } } : { ...config, calendar: { ...config.calendar, [calendarDate]: working } });
  }
  function calendarRemove(uid: string, day: string) {
    if (!config) return;
    const draft = structuredClone(config);
    if (uid) delete draft.personal_calendar[uid][day]; else delete draft.calendar[day];
    setConfig(draft);
  }
  return <><Feedback state={loaded} />{error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}{config && <section className="card"><h2>工作日历与指标参数</h2><p className="muted">节假日、调休、请假及入离职日期通过日历例外维护，不自动推测。</p><form aria-label="工作日历与指标参数" onSubmit={e => { e.preventDefault(); save("/api/bi/settings", config); }}><fieldset><legend>每周工作日</legend><div className="bi-checks">{["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((n, i) => <label key={n}><input type="checkbox" checked={config.work_week.includes(i)} onChange={e => setConfig({ ...config, work_week: e.target.checked ? [...config.work_week, i] : config.work_week.filter(v => v !== i) })} />{n}</label>)}</div></fieldset><div className="bi-form-grid"><label>RFM 近期成交阈值（天）<input type="number" min="1" max="3650" required value={config.rfm_recent_days} onChange={e => setConfig({...config, rfm_recent_days: Number(e.target.value)})} /></label><label>RFM 高频成交阈值（单）<input type="number" min="1" max="1000" required value={config.rfm_freq_orders} onChange={e => setConfig({...config, rfm_freq_orders: Number(e.target.value)})} /></label><label>沉睡阈值（天）<input type="number" min="1" required value={config.dormant_days} onChange={e => setConfig({ ...config, dormant_days: Number(e.target.value) })} /></label><label>疑似流失阈值（天）<input type="number" min="2" required value={config.lost_warning_days} onChange={e => setConfig({ ...config, lost_warning_days: Number(e.target.value) })} /></label><label>取消任务计入到期分母<select value={config.cancelled_tasks || ""} onChange={e => setConfig({ ...config, cancelled_tasks: e.target.value as Settings["cancelled_tasks"] || null })}><option value="">待业务确认</option><option value="exclude">排除取消任务</option><option value="include">包含取消任务</option></select></label>{["A", "B", "C"].map(level => <label key={level}>{level} 级跟进阈值（天，可空）<input type="number" min="1" value={config.followup_days[level] || ""} onChange={e => { const days = { ...config.followup_days }; if (e.target.value) days[level] = Number(e.target.value); else delete days[level]; setConfig({ ...config, followup_days: days }); }} /></label>)}</div><fieldset><legend>有效业务动作（登录、浏览不计）</legend><div className="bi-checks">{Object.entries(actionNames).map(([k, label]) => <label key={k}><input type="checkbox" checked={config.effective_activity_types.includes(k)} onChange={e => setConfig({ ...config, effective_activity_types: e.target.checked ? [...config.effective_activity_types, k] : config.effective_activity_types.filter(v => v !== k) })} />{label}</label>)}</div></fieldset><h3>日期例外</h3><div className="bi-form-grid"><label>例外日期<input type="date" value={calendarDate} onChange={e => setCalendarDate(e.target.value)} /></label><label>适用人员<select value={calendarPerson} onChange={e => setCalendarPerson(e.target.value)}><option value="">全体人员</option>{persons.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>该日安排<select value={working ? "work" : "off"} onChange={e => setWorking(e.target.value === "work")}><option value="off">非工作日</option><option value="work">工作日</option></select></label></div><button type="button" onClick={calendarAdd} disabled={!calendarDate}>加入日历例外</button><ul className="bi-calendar-list">{Object.entries({ "": config.calendar, ...config.personal_calendar }).flatMap(([uid, days]) => Object.entries(days).sort().map(([day, work]) => <li key={`${uid}-${day}`}>{day} · {uid ? persons.find(p => p.id === uid)?.name || "历史人员" : "全体"} · {work ? "工作日" : "非工作日"}<button type="button" onClick={() => calendarRemove(uid, day)}>移除例外</button></li>))}</ul><button className="primary" disabled={busy}>保存日历与参数</button></form></section>}
    {source && <section className="card"><h2>销售数据核实（可选）</h2><p>已默认“导入即认可”：所有导入订单按有效销售计入业绩，无需人工核实。仅在需要按单据状态区分有效／退货／作废（例如导出中含退货或作废单）时才保存核实结论；保存后以本结论为准，且不会改写订单原始金额或状态，后续销售事实更新将要求重新核实。</p><Feedback state={reviewState} />{!reviewState.loading && !reviewState.error && <form aria-label="销售数据核实" key={source + JSON.stringify(reviewState.data)} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const statuses = (key: string) => String(f.get(key) || "").split(",").map(s => s.trim()).filter(Boolean); save(`/api/bi/reviews/${source}`, { coverage_from: f.get("from"), coverage_to: f.get("to"), valid_statuses: statuses("valid"), excluded_statuses: statuses("excluded"), return_statuses: statuses("returns"), staff_mapping_complete: f.has("staff"), full_history: f.has("history"), acknowledge_export_scope: f.has("ack"), reason: f.get("reason") }); }}><div className="bi-form-grid"><label>完整覆盖起日<input type="date" name="from" required defaultValue={reviewState.data?.coverage_from} /></label><label>完整覆盖止日<input type="date" name="to" required defaultValue={reviewState.data?.coverage_to} /></label><label>有效单据状态值（逗号分隔）<input name="valid" required defaultValue={reviewState.data?.valid_statuses.join(",") || ""} /></label><label>作废/取消状态值<input name="excluded" defaultValue={reviewState.data?.excluded_statuses.join(",") || "void,cancelled"} /></label><label>退货状态值（金额按负数计）<input name="returns" defaultValue={reviewState.data?.return_statuses.join(",") || "return"} /></label><label>核实依据<textarea name="reason" required minLength={5} maxLength={1000} defaultValue={reviewState.data?.reason} /></label></div><div className="bi-checks"><label><input type="checkbox" name="staff" />销售人员映射已完整核实</label><label><input type="checkbox" name="history" />覆盖起日前不存在遗漏的历史成交</label><label><input type="checkbox" name="ack" required />已人工核实有效单据、退货/作废和导出期间</label></div><button className="primary" disabled={busy}>保存人工核实结论</button></form>}</section>}</>;
}

export default function BI({ role, userId, openCRM, entryTab, onTabChange }: { role: Role; userId: string; entryTab?: string; onTabChange: (tab: string) => void; openCRM: (entry?: CRMEntry) => void }) {
  const allowedTabs = role === "admin" ? ["settings"] : role === "finance" ? ["sales","attention","customers"] : ["workbench","sales","attention","customers", ...(role !== "sales" ? ["team"] : []), ...(role === "owner" ? ["settings"] : [])];
  const initialTab = entryTab && allowedTabs.includes(entryTab) ? entryTab : allowedTabs[0];
  const [tab, updateTab] = useState(initialTab);
  useEffect(() => { updateTab(initialTab); }, [initialTab]);
  function setTab(next: string) { updateTab(next); onTabChange(next); }
  const [month, setMonth] = useState(currentMonth());
  const [person, setPerson] = useState(role === "sales" || role === "manager" ? userId : "");
  const [selectedSource, setSource] = useState("");
  const [dimension, setDimension] = useState("customer");
  const [basis, setBasis] = useState("verified");
  const [offset, setOffset] = useState(0);
  const [teamOffset, setTeamOffset] = useState(0);
  const [attentionOffset, setAttentionOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [drill, setDrill] = useState<{ id: string; name: string; dimension: string }>();
  const persons = useData<Person[]>(role !== "finance" ? "/api/bi/people" : null);
  const sources = useData<Person[]>("/api/bi/sources");
  const source = selectedSource || sources.data?.[0]?.id || "";
  useEffect(() => { if (!person && persons.data?.length) setPerson(persons.data[0].id); }, [person, persons.data]);
  const work = useData<Workbench>(tab === "workbench" && person ? `/api/bi/workbench/${person}?month=${month}-01` : null, revision);
  const team = useData<{ rows: Workbench[]; total: number }>(tab === "team" ? `/api/bi/team?month=${month}-01&offset=${teamOffset}` : null, revision);
  const report = useData<Analysis>(tab === "sales" && source ? `/api/bi/sales?source_id=${source}&month=${month}-01&dimension=${dimension}&basis=${basis}&offset=${offset}` : null, revision);
  const [marginsOffset, setMarginsOffset] = useState(0);
  const margins = useData<ProductMargins>(tab === "sales" && source ? `/api/bi/product-margins?source_id=${source}&month=${month}-01&offset=${marginsOffset}&limit=50` : null, revision);
  const attention = useData<AttentionPage>(tab === "attention" && source ? `/api/bi/attention?source_id=${source}&offset=${attentionOffset}` : null);
  const tabs = role === "admin" ? [["settings", "日历与分析设置"]] : role === "finance" ? [["sales", "销售分析"], ["attention", "客户关注"], ["customers", "客户分析"]] : [["workbench", "个人工作台"], ...(role !== "sales" ? [["team", "团队执行"]] : []), ["sales", "销售分析"], ["attention", "客户关注"], ["customers", "客户分析"], ...(role === "owner" ? [["settings", "日历与分析设置"]] : [])];
  return <div className="bi"><div className="bi-head"><div><h1>{tabs.find(([key]) => key === tab)?.[1] || "分析"}</h1><p className="muted">以精斗云交易为实际业绩依据，让目标、客户动作和未来商机清楚可见。</p></div></div><nav className="bi-tabs" aria-label="分析导航">{tabs.map(([key, label]) => <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setDrill(undefined); }}>{label}</button>)}<button onClick={() => openCRM()}>进入客户与待办</button></nav><div className="bi-toolbar">{tab !== "settings" && tab !== "attention" && tab !== "customers" && <label>统计月份<input type="month" value={month} onChange={e => { setMonth(e.target.value || currentMonth()); setOffset(0); }} /></label>}{tab === "workbench" && <label>查看人员<select value={person} onChange={e => setPerson(e.target.value)}>{persons.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}{["sales", "attention", "customers", "settings"].includes(tab) && <label>分析数据源<select value={source} onChange={e => { setSource(e.target.value); setOffset(0); setAttentionOffset(0); }}><option value="">请选择数据源</option>{sources.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}{tab === "sales" && <><label>数据口径<select value={basis} onChange={e => { setBasis(e.target.value); setOffset(0); }}><option value="verified">已确认经营销售（导入即认可）</option><option value="source">源单据原始金额</option></select></label><label>分析维度<select value={dimension} onChange={e => { setDimension(e.target.value); setOffset(0); }}><option value="customer">客户</option><option value="product">商品</option><option value="person">业务员</option></select></label></>}</div><Feedback state={sources} /><Feedback state={persons} />
    {tab === "customers" && <CustomerAnalyticsPanel role={role} source={source} openCustomer={id => openCRM({tab:"customers",customerId:id})} />}
    {tab === "workbench" && <><Feedback state={work} />{!person && !persons.loading && <p>尚无可查看的销售人员，请先配置业务账号。</p>}{work.data && <><p className="muted">{work.data.name} · {work.data.month.slice(0, 7)} · 统计截至 {work.data.through}</p><Notes notes={work.data.warnings} /><div className="bi-summary"><button onClick={() => openCRM({tab:"tasks",taskView:"today",personId:work.data!.user_id})}>今日待办 <strong>{work.data.today_tasks}</strong></button><button onClick={() => openCRM({tab:"tasks",taskView:"week",personId:work.data!.user_id})}>本周待办 <strong>{work.data.week_tasks}</strong></button><button onClick={() => openCRM({tab:"tasks",taskView:"overdue",personId:work.data!.user_id})}>逾期待办 <strong>{work.data.overdue_tasks}</strong></button><button onClick={() => openCRM({tab:"opportunities",openOnly:true,personId:work.data!.user_id})}>开放商机 <strong>{work.data.open_opportunities}</strong></button></div><Metrics rows={work.data.metrics} /></>}{person && ["owner", "manager"].includes(role) && <TargetForm person={person} month={month} changed={() => setRevision(v => v + 1)} />}</>}
    {tab === "team" && <><Feedback state={team} />{team.data && <><p>并列查看目标、业务动作和商机；不生成个人综合评分。点击人员查看完整指标。</p><div className="bi-table-wrap"><table><thead><tr><th>人员</th><th>月目标</th><th>已确认销售</th><th>完成率</th><th>季度目标</th><th>季度完成率</th><th>登录工作日</th><th>有效活跃日</th><th>有效跟进</th><th>逾期任务</th><th>加权商机</th></tr></thead><tbody>{team.data.rows.map(w => { const m = (code: string) => value(w.metrics.find(m => m.code === code)?.value); return <tr key={w.user_id}><td><button onClick={() => { setPerson(w.user_id); setTab("workbench"); }}>{w.name}</button></td><td>{m("TGT_MONTH_AMT")}</td><td>{m("EXEC_SALES_AMT")}</td><td>{m("TGT_COMPLETION")}</td><td>{m("TGT_QUARTER_AMT")}</td><td>{m("TGT_QUARTER_COMPLETION")}</td><td>{m("CRM_LOGIN_DAY")}</td><td>{m("CRM_EFFECTIVE_DAY")}</td><td>{m("CRM_FOLLOWUP_COUNT")}</td><td>{w.overdue_tasks}</td><td>{m("OPP_WEIGHTED_AMT")}</td></tr>; })}</tbody></table></div><Pages offset={teamOffset} total={team.data.total} size={20} onChange={setTeamOffset} /></>}</>}
    {tab === "sales" && <><Feedback state={report} />{!source && !sources.loading && <p>暂无可见的销售数据源。未映射订单不会自动分配给当前账号。</p>}{report.data && <SalesAnalysis data={report.data} dimension={dimension} offset={offset} onPage={setOffset} onDrill={r => setDrill({ id: r.id, name: r.name, dimension })} />}{margins.data && <section className="card"><h2>商品毛利</h2><Notes notes={margins.data.warnings} /><p className="muted">成本口径：最近一次采购价 × 数量（参考成本，非实际出库成本）。统计截至 {margins.data.through}；成本覆盖率 {margins.data.cost_coverage ?? "—"}%（有成本行销售额占比）。</p><div className="bi-summary"><button>销售额 <strong>{money(margins.data.total_sales)}</strong></button><button>成本 <strong>{margins.data.total_cost ?? "—"}</strong></button><button>毛利 <strong>{margins.data.total_profit ?? "—"}</strong></button><button>毛利率 <strong>{margins.data.margin_rate ?? "—"}%</strong></button></div><div className="bi-table-wrap"><table><thead><tr><th>商品</th><th>数量</th><th>销售额</th><th>成本</th><th>毛利</th><th>毛利率</th></tr></thead><tbody>{margins.data.rows.map(r => <tr key={r.product_id}><td>{r.name}</td><td>{r.quantity}</td><td>{money(r.sales)}</td><td>{r.cost ?? "—"}</td><td>{r.profit ?? "—"}</td><td>{r.rate ?? "—"}</td></tr>)}</tbody></table></div>{!margins.data.rows.length && <p className="muted">该期间暂无销售行。</p>}<Pages offset={marginsOffset} total={margins.data.total} size={50} onChange={setMarginsOffset} /></section>}</>}
    {tab === "attention" && <><Feedback state={attention} />{!source && !sources.loading && <p>暂无可见销售数据源。</p>}{attention.data && <><Notes notes={attention.data.warnings} /><p>客户关注按今天判断，标签不自动修改客户状态。</p><div className="bi-attention">{attention.data.rows.map((r, i) => <article className="card" key={`${r.id}-${i}`}><h3>{r.name}</h3><p>{r.kind}{r.days !== null ? ` · ${r.days} 天` : ""}</p><button onClick={() => setDrill({ id: r.id, name: r.name, dimension: "customer" })}>查看源订单</button></article>)}</div>{!attention.data.total && <p>当前没有可判定的关注项，请同时查看上方数据条件。</p>}<Pages offset={attentionOffset} total={attention.data.total} size={30} onChange={setAttentionOffset} /></>}</>}
    {tab === "settings" && <Configuration persons={persons.data || []} source={source} />}
    {drill && <Orders source={source} month={month} dimension={drill.dimension} item={drill} close={() => setDrill(undefined)} />}
  </div>;
}
