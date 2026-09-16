"use client";
import { useEffect, useRef, useState } from "react";
import type { CRMEntry } from "./crm-navigation";
import { compact, dateTime, money } from "./lib/format";
type Metric = { definition: string; source: string; code: string; label: string; value: string | null; unit: string; reason: string | null };
type Point = { date: string; value: string };
type Ranking = { user_id: string; name: string; amount: string; target: string | null; completion: string | null };
type Contribution = { customer_id: string; name: string; owner_name: string | null; level: string | null; amount: string; orders: number };
type Attention = { customer_id: string; name: string; kind: string; days: number | null };
type OverviewData = {
  month: string; through: string; verified: boolean; warnings: string[]; finance_warnings: string[];
  sales_metrics: Metric[]; finance_metrics: Metric[]; trend: Point[]; customer_trend: Point[]; updated_at: string | null;
  person_ranking: Ranking[]; customer_contributions: Contribution[];
  attention_items: Attention[]; attention_total: number;
};
type Source = { id: string; name: string };
/** 完成率低于该值时以琥珀色提示，仅为阅读帮助，不参与任何指标计算，也不改写口径。 */
const BEHIND_RATE = 75;
function MetricCard({ metric }: { metric: Metric }) {
  return <section className="cockpit-stat" aria-label={metric.label}>
    <span>{metric.label.replace("（本月）", "")}</span>
    <strong>{metric.unit === "元" ? money(metric.value) : metric.value ?? "—"}{metric.value !== null && <small>{metric.unit}</small>}</strong>
    {metric.reason && <p>{metric.reason}</p>}
    <details><summary>指标口径</summary><p>{metric.definition}</p><p>{metric.source} · {metric.code}</p></details>
  </section>;
}

/** 月度柱状图：完整月实心、本月未完月以描边 + 斜纹区分，柱顶直读数值。 */
function Trend({ points, customers, incomplete }: { points: Point[]; customers: boolean; incomplete: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let chart: import("echarts").ECharts | undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!disposed && chart && element.current) chart.resize({ width: element.current.clientWidth || undefined, height: element.current.clientHeight || undefined });
      });
    });
    if (element.current) observer.observe(element.current);
    import("echarts").then(echarts => {
      if (disposed || !element.current) return;
      const last = points.length - 1;
      chart = echarts.init(element.current, undefined, { renderer: "svg" });
      chart.setOption({ animation: false,
        grid: { left: customers ? 46 : 78, right: 18, top: 36, bottom: 30 },
        tooltip: { trigger: "axis", renderMode: "richText" },
        xAxis: { type: "category", data: points.map(p => p.date.slice(5, 7) + "月"), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#71717a", fontSize: 12 } },
        yAxis: { type: "value", name: customers ? "家" : "元", nameTextStyle: { color: "#a1a1aa", fontSize: 11 }, minInterval: customers ? 1 : undefined,
          splitLine: { lineStyle: { color: "#f1f1f3" } },
          axisLabel: { color: "#a1a1aa", fontSize: 11, formatter: (value: number) => customers ? String(value) : compact(value) } },
        series: [{ type: "bar", barMaxWidth: 46,
          label: { show: true, position: "top", fontSize: 12, color: "#52525b", formatter: (params: { value: number }) => customers ? String(params.value) : compact(params.value) },
          data: points.map((p, i) => {
            const pending = i === last && incomplete;
            return { value: Number(p.value),
              itemStyle: pending
                ? { color: "#dbeafe", borderColor: "#2563eb", borderWidth: 1.5, borderRadius: [4, 4, 0, 0],
                    decal: { symbol: "rect", dashArrayX: [1, 0], dashArrayY: [4, 3], rotation: -0.6, color: "#2563eb", opacity: 0.55 } }
                : { color: i === last ? "#2563eb" : "#93c5fd", borderRadius: [4, 4, 0, 0] },
              label: pending ? { show: true, position: "top", fontSize: 12, color: "#1d4ed8", fontWeight: 600, formatter: (params: { value: number }) => customers ? String(params.value) : compact(params.value) } : undefined };
          }) }],
      });
    });
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); chart?.dispose(); };
  }, [points, customers, incomplete]);
  return <div ref={element} className="cockpit-chart" role="img" aria-label={`近 ${points.length} 个月${customers ? "成交客户数" : "销售金额"}趋势，下方可展开精确数值`} />;
}

/** 客户贡献：横向比例条。条长表示组内相对量级，占比文字是占本月经营销售额的真实份额，未核实则不显示占比。 */
function Contributions({ rows, base, verified, onAnalyze, onOpenCustomer }: {
  rows: Contribution[]; base: number | null; verified: boolean;
  onAnalyze: () => void; onOpenCustomer: (id: string) => void;
}) {
  const max = Math.max(0, ...rows.map(r => Number(r.amount)));
  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const shareBase = verified && base !== null && base > 0 ? base : null;
  return <section className="cockpit-panel" aria-label="客户贡献">
    <div className="panel-heading">
      <div>
        <h2>客户贡献 Top {rows.length}</h2>
        <p className="panel-sub">{verified ? "本月经营销售额" : "源销售核对金额"} · 已扣退货、排除作废</p>
      </div>
      <button className="text-button" onClick={onAnalyze}>客户分析 →</button>
    </div>
    <ul className="contrib-list">
      {rows.map(c => {
        const amount = Number(c.amount);
        const width = max > 0 ? Math.max(1.5, amount / max * 100) : 0;
        const share = shareBase !== null ? amount / shareBase * 100 : null;
        return <li className="contrib-item" key={c.customer_id}>
          <div className="contrib-head">
            <button className="text-button customer-link contrib-name" onClick={() => onOpenCustomer(c.customer_id)}>{c.name}{c.level && <span className="level-tag">{c.level} 级</span>}</button>
            <span className="contrib-amount">{money(c.amount)}<small>元</small></span>
          </div>
          <span className="contrib-bar" role="img" aria-label={`${c.name} ${money(c.amount)} 元${share === null ? "" : `，占本月 ${share.toFixed(1)}%`}`}>
            <i style={{ width: `${width}%` }} />
          </span>
          <div className="contrib-meta">
            <span>{c.owner_name || "未分配负责人"}</span>
            <span>{c.orders} 单</span>
            {share !== null && <span className="contrib-share">占本月 {share.toFixed(1)}%</span>}
          </div>
        </li>;
      })}
    </ul>
    <div className="contrib-total">
      <span>Top {rows.length} 合计{shareBase !== null ? ` · 占本月 ${(total / shareBase * 100).toFixed(1)}%` : ""}</span>
      <strong>{money(String(total))} 元</strong>
    </div>
  </section>;
}

/** 团队目标：进度条 + 完成率；未设目标或口径未核实时不显示完成率。 */
function TeamTargets({ rows, verified, onOpenTeam }: { rows: Ranking[]; verified: boolean; onOpenTeam: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 5);
  const targeted = rows.filter(r => r.target !== null);
  const sumTarget = targeted.reduce((sum, r) => sum + Number(r.target), 0);
  const sumAmount = targeted.reduce((sum, r) => sum + Number(r.amount), 0);
  return <section className="cockpit-panel" aria-label="团队目标明细">
    <div className="panel-heading">
      <div>
        <h2>团队目标明细</h2>
        <p className="panel-sub">{targeted.length ? `${targeted.length} 人已设目标 · 合计 ${money(String(sumAmount))} / ${money(String(sumTarget))} 元` : "尚未设置销售目标"}</p>
      </div>
      <button className="text-button" onClick={onOpenTeam}>团队执行 →</button>
    </div>
    <ul className="team-list">
      {visible.map(r => {
        const rate = r.completion === null ? null : Number(r.completion);
        const behind = rate !== null && rate < BEHIND_RATE;
        return <li className="team-item" key={r.user_id}>
          <span className="team-avatar" aria-hidden="true">{r.name.slice(0, 1)}</span>
          <div className="team-body">
            <strong>{r.name}</strong>
            <span className="target-track" role="img" aria-label={rate === null ? `${r.name} 完成率暂不可用` : `${r.name} 目标完成率 ${rate.toFixed(1)}%`}>
              <i style={{ width: `${rate === null ? 0 : Math.max(0, Math.min(100, rate))}%` }} />
            </span>
          </div>
          <div className="team-figures">
            <strong className={behind ? "team-rate-behind" : undefined}>{rate === null ? (verified ? "未设目标" : "待核实") : `${rate.toFixed(1)}%`}</strong>
            <small>{money(r.amount)}{r.target !== null ? ` / ${money(r.target)}` : ""} 元</small>
          </div>
        </li>;
      })}
    </ul>
    {rows.length > 5 && <div className="team-toggle"><button className="text-button" onClick={() => setExpanded(v => !v)}>{expanded ? "收起" : `展开全部 ${rows.length} 人`}</button></div>}
    <p className="panel-note">进度条与完成率按个人月目标计算；销售口径未核实或未设目标时不显示完成率。完成率低于 {BEHIND_RATE}% 以琥珀色标注，仅为阅读提示。</p>
  </section>;
}

/** 需要关注：久未联系 / 无成交 / 商机停滞，按后端紧急度顺序展示。 */
function AttentionList({ items, total, onOpenAll, onOpenTasks, onOpenCustomer }: {
  items: Attention[]; total: number; onOpenAll: () => void; onOpenTasks: () => void; onOpenCustomer: (id: string) => void;
}) {
  return <section className="cockpit-panel" aria-label="需要关注">
    <div className="panel-heading">
      <div>
        <h2>需要关注</h2>
        <p className="panel-sub">{total ? `共 ${total} 项 · 按紧急度排序` : "当前没有需要关注的客户"}</p>
      </div>
    </div>
    {items.length ? <ul className="attn-list">
      {items.map((a, i) => <li className="attn-item" key={`${a.customer_id}-${i}`}>
        <div className="attn-main">
          <button className="text-button customer-link" onClick={() => onOpenCustomer(a.customer_id)}>{a.name}</button>
          <span className="attn-kind">{a.kind}</span>
        </div>
        {a.days !== null && <span className="attn-days">{a.days} 天</span>}
      </li>)}
    </ul> : <div className="cockpit-empty"><strong>暂无需要关注的客户</strong><p>出现久未联系、长时间无成交或商机停滞时，会在这里列出。</p></div>}
    <div className="panel-actions">
      {total > 0 && <button className="text-button" onClick={onOpenAll}>查看全部 {total} 项 →</button>}
      <button className="text-button" onClick={onOpenTasks}>进入待办与跟进 →</button>
    </div>
  </section>;
}

/** 财务视图：报表口径未确认时只标状态，不估数、不用示例值补齐。 */
function FinancePanel({ metrics, warnings, month }: { metrics: Metric[]; warnings: string[]; month: string }) {
  const values = metrics.filter(m => m.value !== null);
  return <section className="cockpit-panel finance-panel" aria-label="财务视图">
    <div className="panel-heading">
      <div>
        <h2>财务视图</h2>
        <p className="panel-sub">{month.slice(0, 7)} · 财务报表口径</p>
      </div>
    </div>
    {values.length ? <div className="finance-values">{values.map(m => <MetricCard key={m.code} metric={m} />)}</div>
      : <div className="finance-alert"><div>
        <strong>报表未就绪，暂不展示财务指标</strong>
        {warnings.length ? warnings.map(w => <p key={w}>{w}</p>) : <p>财务期间口径确认后，营业收入、毛利等指标才会显示；确认前不以估算值代替。</p>}
      </div></div>}
    {!!values.length && !!warnings.length && <details className="panel-note"><summary>财务数据状态</summary>{warnings.map(w => <p key={w}>{w}</p>)}</details>}
  </section>;
}

export default function Overview({ role, openBI, openCRM }: { role: string; openBI: (tab?: string) => void; openCRM: (entry?: CRMEntry) => void }) {
  const [sources, setSources] = useState<Source[]>([]), [source, setSource] = useState("");
  const [data, setData] = useState<OverviewData | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [retry, setRetry] = useState(0), [measure, setMeasure] = useState("sales");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    (async () => {
      try {
        const response = await fetch("/api/bi/sources", { signal: controller.signal, cache: "no-store" });
        const list = await response.json();
        if (!response.ok) throw new Error(list.error?.message || "数据源加载失败");
        if (controller.signal.aborted) return;
        setSources(list);
        const id = list.some((s: Source) => s.id === source) ? source : list[0]?.id;
        if (!id) return;
        const result = await fetch(`/api/bi/overview?source_id=${id}`, { signal: controller.signal, cache: "no-store" });
        const body = await result.json();
        if (!result.ok) throw new Error(body.error?.message || "总览加载失败");
        if (!controller.signal.aborted) setData(body);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "网络异常"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [source, retry]);
  const points = data ? measure === "sales" ? data.trend : data.customer_trend : [];
  const incomplete = data ? Number(data.through.slice(8)) < new Date(Number(data.month.slice(0, 4)), Number(data.month.slice(5, 7)), 0).getDate() : false;
  const financialValues = data?.finance_metrics.filter(m => m.value !== null) || [];
  const hero = data?.sales_metrics[0];
  const mom = data?.sales_metrics.find(m => m.code === "SALE_MOM");
  const orderMetric = data?.sales_metrics.find(m => m.code === "SALE_ORDER_COUNT");
  const customerMetric = data?.sales_metrics.find(m => m.code === "SALE_CUSTOMER_COUNT");
  const momValue = mom?.value !== null && mom?.value !== undefined ? Number(mom.value) : null;
  const heroNumber = hero?.value !== null && hero?.value !== undefined ? Number(hero.value) : null;
  const targeted = data?.person_ranking.filter(r => r.target !== null) ?? [];
  const targetSum = targeted.reduce((s, r) => s + Number(r.target), 0);
  const targetAmount = targeted.reduce((s, r) => s + Number(r.amount), 0);
  const overallCompletion = data && data.verified && targetSum > 0 ? targetAmount / targetSum * 100 : null;
  const owner = role === "owner";
  const attention = data?.attention_total ?? 0;
  return <section className="cockpit" aria-label="经营驾驶舱">
    <div className="cockpit-top">
      <div className="cockpit-title">
        <h1>经营驾驶舱</h1>
        {data && <div className="cockpit-trust">
          <span className={data.verified ? "status-ready" : "status-pending"}>{data.verified ? "销售口径已核实" : "待业务核实"}</span>
          <span className="trust-meta">截至 {data.through}{data.updated_at ? ` · 更新 ${dateTime(data.updated_at)}` : ""}</span>
          {!!data.warnings.length && <details className="trust-warnings"><summary>数据状态与比较说明</summary>{data.warnings.map(w => <p key={w}>{w}</p>)}</details>}
        </div>}
      </div>
      {sources.length > 1 && <label className="cockpit-source">数据源<select value={source || sources[0]?.id || ""} onChange={e => setSource(e.target.value)}>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    </div>
    {loading && <p role="status">正在加载总览…</p>}
    {error && <p className="error" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>重试</button></p>}
    {!loading && !error && !data && <section className="notice"><h2>尚无可见的经营数据</h2><p>请先完成销售导入和人员映射。</p><button onClick={() => openBI()}>前往销售工作台 →</button></section>}
    {data && hero && <>
      <section className="cockpit-hero" aria-label={hero.label}>
        <div className="hero-main">
          <span className="hero-label">{hero.label.replace("（本月）", "")} · {data.month.slice(0, 7)}{!data.verified && "（未核实）"}</span>
          <strong className="hero-value">{hero.unit === "元" ? money(hero.value) : hero.value ?? "—"}{hero.value !== null && <small>{hero.unit}</small>}</strong>
          <div className="hero-sub">
            {momValue !== null && <span className={`mom ${momValue >= 0 ? "mom-up" : "mom-down"}`}>{momValue >= 0 ? "▲" : "▼"} {Math.abs(momValue).toFixed(2)}%<small>较上月完整月</small></span>}
            {mom?.reason && momValue === null && <span className="muted">环比暂缺（{mom.reason}）</span>}
            <button className="text-button" onClick={() => openBI("sales")}>销售分析 →</button>
          </div>
          <details className="hero-caliber"><summary>指标口径</summary><p>{hero.definition}</p><p>{hero.source} · {hero.code}</p>{mom && <p>{mom.label}：{mom.definition}</p>}</details>
        </div>
        <dl className="hero-kpis">
          {orderMetric && <div><dt>销售订单</dt><dd>{orderMetric.value ?? "—"}<small>单</small></dd></div>}
          {customerMetric && <div><dt>成交客户</dt><dd>{customerMetric.value ?? "—"}<small>家</small></dd></div>}
          {owner && <div className="hero-target"><dt>目标完成率</dt>
            <dd>{overallCompletion !== null ? `${Math.min(999, overallCompletion).toFixed(1)}%` : targeted.length ? "待核实" : "未设目标"}</dd>
            <span className="target-track" role="img" aria-label={overallCompletion !== null ? `目标完成率 ${overallCompletion.toFixed(1)}%` : "目标完成率暂不可用"}><i style={{ width: `${overallCompletion === null ? 0 : Math.max(0, Math.min(100, overallCompletion))}%` }} /></span>
            <small className="target-note">{targeted.length ? `已设目标 ${targeted.length} 人合计 · ${money(String(targetAmount))} / ${money(String(targetSum))} 元` : "尚未设置销售目标"}{owner && targeted.length === 0 && <button className="text-button" onClick={() => openBI("team")}>去设置 →</button>}</small>
          </div>}
        </dl>
      </section>
      <section className="cockpit-panel"><div className="panel-heading">
        <div>
          <h2>销售趋势</h2>
          <p className="panel-sub">近 {points.length} 个月 · {measure === "sales" ? "经营销售额（元）" : "成交客户（家）"} · {data.verified ? "已扣退货、排除作废" : "源销售核对口径"}</p>
        </div>
        <div className="chart-switch" aria-label="趋势指标"><button aria-pressed={measure === "sales"} onClick={() => setMeasure("sales")}>销售额</button><button aria-pressed={measure === "customers"} onClick={() => setMeasure("customers")}>成交客户</button></div>
      </div><Trend points={points} customers={measure === "customers"} incomplete={incomplete} /><p className="panel-note">{data.verified ? "已核实销售口径，退货扣减、作废排除。" : "源销售核对口径，含未核实状态。"}{incomplete && "本月为未完月，以描边柱标识；此前为完整月。"}</p><details><summary>查看每月精确数值</summary><div className="table-scroll"><table><thead><tr><th>月份</th><th>{measure === "sales" ? "金额（元）" : "成交客户（家）"}</th></tr></thead><tbody>{points.map(p => <tr key={p.date}><td>{p.date.slice(0, 7)}</td><td className="number-cell">{measure === "sales" ? money(p.value) : p.value}</td></tr>)}</tbody></table></div></details></section>
      {owner && <div className={`cockpit-grid${financialValues.length || data.finance_metrics.length ? "" : " single"}`}>
        {data.customer_contributions.length
          ? <Contributions rows={data.customer_contributions} base={heroNumber} verified={data.verified} onAnalyze={() => openBI("customers")} onOpenCustomer={id => openCRM({ tab: "customers", customerId: id })} />
          : <section className="cockpit-panel"><div className="panel-heading"><div><h2>客户贡献</h2><p className="panel-sub">本月暂无贡献数据</p></div></div><div className="cockpit-empty"><strong>还没有可视的客户贡献</strong><p>完成销售导入并核对人员映射后，本月客户金额排名会在这里以比例条展示。</p></div></section>}
        <TeamTargets rows={data.person_ranking} verified={data.verified} onOpenTeam={() => openBI("team")} />
      </div>}
      {owner && <div className={`cockpit-grid${data.finance_metrics.length ? "" : " single"}`}>
        <AttentionList items={data.attention_items} total={attention} onOpenAll={() => openBI("attention")} onOpenTasks={() => openCRM({ tab: "tasks" })} onOpenCustomer={id => openCRM({ tab: "customers", customerId: id })} />
        {!!data.finance_metrics.length && <FinancePanel metrics={data.finance_metrics} warnings={data.finance_warnings} month={data.month} />}
      </div>}
      {!owner && <section className="cockpit-panel"><div className="panel-heading"><div><h2>我的工作</h2><p className="panel-sub">查看个人业绩、待办与客户进展</p></div></div><div className="panel-actions"><button className="text-button" onClick={() => openBI()}>销售工作台 →</button><button className="text-button" onClick={() => openCRM({ tab: "tasks" })}>待办与跟进 →</button></div></section>}
      {!owner && !!data.finance_metrics.length && <FinancePanel metrics={data.finance_metrics} warnings={data.finance_warnings} month={data.month} />}
    </>}
  </section>;
}
