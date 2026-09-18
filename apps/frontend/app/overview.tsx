"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CRMEntry } from "./crm-navigation";
import { api, useData } from "./lib/api";
import { compact, dateTime, money } from "./lib/format";
import { opportunityStageLabels } from "./lib/labels";
import type { Metric, OverviewAttention as Attention, ProjectPipeline, ProductMargins } from "./lib/types";

type Point = { date: string; value: string };
type Ranking = { user_id: string; name: string; amount: string; target: string | null; completion: string | null };
type Contribution = { customer_id: string; name: string; amount: string; orders: number };
type OverviewData = {
  month: string; through: string; verified: boolean; warnings: string[]; finance_warnings: string[];
  sales_metrics: Metric[]; finance_metrics: Metric[]; trend: Point[]; customer_trend: Point[]; updated_at: string | null;
  person_ranking: Ranking[]; customer_contributions: Contribution[];
  attention_items: Attention[]; attention_total: number; project_pipeline: ProjectPipeline | null;
};

type IconName = "sales" | "target" | "money" | "document" | "people" | "person" | "bell" | "tasks" | "calendar";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    sales: <><path d="M5 20V11M12 20V4M19 20V8" strokeWidth="3" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="m12 12 8-8M16 4h4v4" /></>,
    money: <><circle cx="12" cy="12" r="9" /><path d="m8 6 4 5 4-5M8 12h8M8 15h8M12 11v7" /></>,
    document: <><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6" /></>,
    people: <><circle cx="10" cy="7" r="3" /><path d="M3 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M20 21v-3a7 7 0 0 0-2-5" /></>,
    person: <><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 13-3M19 13v8M15 17h8" /></>,
    bell: <><path d="M5 10a7 7 0 0 1 14 0v5l2 3H3l2-3zM10 21h4M12 1v2" /></>,
    tasks: <><rect x="4" y="4" width="16" height="18" rx="2" /><path d="M9 4V2h6v2M8 13l3 3 6-6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 11h18" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Heading({ icon, title, action }: { icon: IconName; title: string; action?: ReactNode }) {
  return <div className="dc-panel-head"><h2><span className="dc-panel-icon"><Icon name={icon} /></span>{title}</h2>{action}</div>;
}
function Track({ value, label }: { value: number | null; label: string }) {
  return <span className="dc-track" role="img" aria-label={value === null ? `${label}暂不可用` : `${label} ${value.toFixed(1)}%`}><i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></span>;
}
// 金额仅做已有汇总项的精确展示合计；以分相加，避免二进制浮点累计误差。
function sumMoney(values: (string | null)[]) {
  const cents = values.reduce((sum, value) => {
    const [whole, fraction = ""] = (value ?? "0").split(".");
    return sum + BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2)) * BigInt(whole.startsWith("-") ? -1 : 1);
  }, BigInt(0));
  const abs = cents < BigInt(0) ? -cents : cents;
  return `${cents < BigInt(0) ? "-" : ""}${abs / BigInt(100)}.${String(abs % BigInt(100)).padStart(2, "0")}`;
}
function Delta({ metric, label }: { metric?: Metric; label: string }) {
  const value = metric?.value == null ? null : Number(metric.value);
  return <span className="dc-delta" title={value === null ? metric?.reason ?? "暂无可比数据" : metric?.definition}>
    <b className={value === null ? "" : value < 0 ? "dc-negative" : "dc-positive"}>{value === null ? "—" : `${value < 0 ? "▼" : "▲"} ${Math.abs(value).toFixed(2)}%`}</b><small>{label}</small>
  </span>;
}
function Kpi({ title, icon, metric, children, featured, onClick }: {
  title: string; icon: IconName; metric?: Metric; children?: ReactNode; featured?: boolean; onClick?: () => void;
}) {
  return <section className={`dc-kpi${featured ? " dc-kpi-featured cockpit-hero" : ""}`} aria-label={title}>
    <div className="dc-kpi-label"><span className="dc-icon"><Icon name={icon} /></span>{title}</div>
    <button className="dc-kpi-number" onClick={onClick} disabled={!onClick} aria-label={`查看${title}分析`}>
      {metric?.value == null ? "—" : metric.unit === "元" ? money(metric.value) : metric.value}
      {metric?.value != null && <small>{metric.unit}</small>}
    </button>
    {children}
  </section>;
}
function Trend({ points, customers, incomplete, measure }: { points: Point[]; customers: Point[]; incomplete: boolean; measure: string }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let chart: import("echarts").ECharts | undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => chart?.resize()); });
    if (element.current) observer.observe(element.current);
    import("echarts").then(echarts => {
      if (disposed || !element.current) return;
      const css = getComputedStyle(element.current);
      const token = (name: string) => css.getPropertyValue(name).trim();
      const accent = token("--accent"), muted = token("--muted"), line = token("--dc-line"), card = token("--card");
      const onlyCustomers = measure === "customers";
      chart = echarts.init(element.current, undefined, { renderer: "svg" });
      chart.setOption({ animation: false, textStyle: { fontFamily: css.fontFamily, fontSize: parseFloat(token("--fs-aux")) },
        grid: { left: 54, right: 36, top: 28, bottom: 28 }, tooltip: { trigger: "axis", renderMode: "richText" },
        xAxis: { type: "category", data: points.map(p => p.date.slice(0, 7)), axisLine: { lineStyle: { color: line } }, axisTick: { show: false }, axisLabel: { color: muted } },
        yAxis: [{ type: "value", name: "元", axisLabel: { color: muted, formatter: (v: number) => compact(v) }, nameTextStyle: { color: muted }, splitLine: { lineStyle: { color: line } }, show: !onlyCustomers },
          { type: "value", name: "个", minInterval: 1, axisLabel: { color: muted }, nameTextStyle: { color: muted }, splitLine: { show: onlyCustomers, lineStyle: { color: line } } }],
        series: [...(!onlyCustomers ? [{ name: "销售金额", type: "bar", barMaxWidth: 34, data: points.map((p, i) => ({ value: Number(p.value),
          itemStyle: { color: i === points.length - 1 ? accent : token("--dc-chart-soft"), borderRadius: [3, 3, 0, 0], borderColor: accent, borderWidth: incomplete && i === points.length - 1 ? 1.5 : 0 } })) }] : []),
          { name: "成交客户数", type: "line", yAxisIndex: 1, smooth: true, symbol: "circle", symbolSize: 7,
            itemStyle: { color: card, borderColor: accent, borderWidth: 2 }, lineStyle: { color: accent, width: 2 },
            data: points.map(p => { const found = customers.find(c => c.date === p.date); return found ? Number(found.value) : null; }) }],
      });
    });
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); chart?.dispose(); };
  }, [points, customers, incomplete, measure]);
  return <div ref={element} className="cockpit-chart dc-chart" role="img" aria-label={`近 ${points.length} 个月${measure === "customers" ? "成交客户数" : "销售金额与成交客户数"}趋势，下方可展开精确数值`} />;
}

export default function Overview({ role, userId, openBI, openCRM }: {
  role: string; userId: string; openBI: (tab?: string) => void; openCRM: (entry?: CRMEntry) => void;
}) {
  const [sources, setSources] = useState<{ id: string; name: string }[]>([]), [source, setSource] = useState("");
  const [data, setData] = useState<OverviewData | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [retry, setRetry] = useState(0), [measure, setMeasure] = useState("sales");
  const [expandedTeam, setExpandedTeam] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    (async () => {
      try {
        const list = await api<{ id: string; name: string }[]>("/api/bi/sources", { signal: controller.signal });
        if (controller.signal.aborted) return;
        setSources(list);
        const id = list.some(s => s.id === source) ? source : list[0]?.id;
        if (!id) return;
        const body = await api<OverviewData>(`/api/bi/overview?source_id=${id}`, { signal: controller.signal });
        if (!controller.signal.aborted) setData(body);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "网络异常"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [source, retry]);
  const selected = sources.find(s => s.id === source)?.id ?? sources[0]?.id;
  const query = data && selected ? `source_id=${selected}&month=${data.month}` : null;
  const analysis = useData<{ metrics: Metric[] }>(query ? `/api/bi/sales?${query}&basis=verified&limit=1` : null, retry);
  const margins = useData<ProductMargins>(query ? `/api/bi/product-margins?${query}&limit=1` : null, retry);
  // 现有工作台接口只接受销售/经理；老板本人工作复用 CRM 已授权列表。
  // 列表接口每页最多 100 条，到达上限明确显示 100+，不将首屏条数冒充总数。
  const workBase = data && role === "owner" ? `/api/crm/tasks?assignee_user_id=${userId}` : null;
  const todayWork = useData<{ id: string }[]>(workBase ? `${workBase}&view=today` : null, retry);
  const weekWork = useData<{ id: string }[]>(workBase ? `${workBase}&view=week` : null, retry);
  const overdueWork = useData<{ id: string }[]>(workBase ? `${workBase}&view=overdue` : null, retry);
  const projectsWork = useData<{ id: string }[]>(workBase ? `/api/crm/opportunities?owner_user_id=${userId}&status=open` : null, retry);
  const personalWork = [todayWork, weekWork, projectsWork, overdueWork];
  const workLoading = personalWork.some(w => w.loading);
  const workFailed = personalWork.some(w => w.error);
  const listCount = (rows?: { id: string }[]) => rows ? rows.length >= 100 ? "100+" : String(rows.length) : undefined;
  const owner = role === "owner";
  const metric = (code: string) => data?.sales_metrics.find(m => m.code === code) ?? analysis.data?.metrics.find(m => m.code === code) ?? data?.finance_metrics.find(m => m.code === code);
  const hero = data?.sales_metrics[0];
  const targeted = data?.person_ranking.filter(r => r.target !== null) ?? [];
  const targetSum = sumMoney(targeted.map(r => r.target));
  const targetAmount = sumMoney(targeted.map(r => r.amount));
  const completion = data?.verified && Number(targetSum) > 0 ? Number(targetAmount) / Number(targetSum) * 100 : null;
  const contributions = data?.customer_contributions ?? [];
  const total = sumMoney(contributions.map(r => r.amount));
  const max = Math.max(0, ...contributions.map(r => Number(r.amount)));
  const pipeline = data?.project_pipeline;
  const incomplete = data ? Number(data.through.slice(8)) < new Date(Number(data.month.slice(0, 4)), Number(data.month.slice(5, 7)), 0).getDate() : false;
  const openAttention = (a: Attention) => a.customer_id ? openCRM({ tab: "customers", customerId: a.customer_id }) : a.entry === "tasks" ? openCRM({ tab: "tasks", taskView: "overdue" }) : a.entry === "projects" ? openCRM({ tab: "opportunities" }) : openBI("team");
  const headingAction = (label: string, onClick: () => void) => <button className="text-button" onClick={onClick}>{label} →</button>;
  return <section className="cockpit dc-dashboard" aria-label="经营驾驶舱">
    <div className="dc-top">
      <div><h1>经营驾驶舱</h1><p>用数据洞察业务全貌，把握经营节奏，助力业绩增长。</p></div>
      <div className="dc-filters">
        {data && <span className="dc-month" title="驾驶舱展示当前月；历史月份请进入销售分析" aria-label="当前统计月份">{data.month.slice(0, 4)}年{data.month.slice(5, 7)}月 <Icon name="calendar" /></span>}
        {!!sources.length && <label className="cockpit-source">数据源<select value={selected ?? ""} onChange={e => setSource(e.target.value)}>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      </div>
    </div>
    {loading && <div className="dc-loading" role="status">正在加载经营数据…</div>}
    {error && <p className="error" role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>重试</button></p>}
    {!loading && !error && !data && <section className="notice"><h2>尚无可见的经营数据</h2><p>请先完成销售导入和人员映射。</p>{headingAction("前往销售分析", () => openBI("sales"))}</section>}
    {data && hero && <>
      <div className="dc-kpis">
        <Kpi title={data.verified ? "本月销售额" : "源销售核对金额"} icon="sales" metric={hero} featured onClick={() => openBI("sales")}>
          <div className="dc-deltas"><Delta metric={metric("SALE_MOM")} label="环比 · 上月完整月" /><Delta metric={metric("SALE_YOY")} label="同比" /></div>
          <svg className="dc-wave" viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 25 Q30 5 60 24 T120 24 T180 22 T240 2 V40 H0Z" /></svg>
        </Kpi>
        {owner ? <section className="dc-kpi" aria-label="目标达成率"><div className="dc-kpi-label"><span className="dc-icon"><Icon name="target" /></span>目标达成率</div>
          <button className="dc-kpi-number" onClick={() => openBI("team")}>{completion === null ? "—" : `${completion.toFixed(1)}%`}</button>
          <Track value={completion} label="整体目标完成率" /><p className="dc-kpi-note">{targeted.length ? <>已完成 {money(targetAmount)} 元<br />目标 {money(targetSum)} 元</> : "尚未设置销售目标"}{targeted.length > 0 && !data.verified && " · 待核实"}</p>
        </section> : <Kpi title="销售订单数" icon="document" metric={metric("SALE_ORDER_COUNT")} onClick={() => openBI("sales")} />}
        <Kpi title="销售毛利" icon="money" metric={margins.data?.metrics.find(m => m.code === "SALE_GROSS_PROFIT")} onClick={() => openBI("sales")}>
          <p className="dc-kpi-note">{margins.loading ? "正在加载…" : margins.error ? "毛利加载失败" : margins.data?.total_profit == null ? "尚无可用成本数据" : <>最近一次采购价口径<br />成本覆盖 {margins.data.cost_coverage === null ? "—" : `${Number(margins.data.cost_coverage).toFixed(1)}%`}</>}</p>
          {margins.error && headingAction("重试", margins.retry)}
        </Kpi>
        <Kpi title="应收账款" icon="document" metric={metric("EXEC_AR_BAL")}><p className="dc-kpi-note">财务报表月末余额<br />{metric("EXEC_AR_BAL")?.value == null ? "本月报表尚未就绪" : "资产负债表口径"}</p></Kpi>
        <Kpi title="成交客户数" icon="people" metric={metric("SALE_CUSTOMER_COUNT")} onClick={() => openBI("customers")}><p className="dc-kpi-note">本月有效销售去重客户<br />截至 {data.through}</p></Kpi>
        <Kpi title="首次成交客户数" icon="person" metric={metric("CUS_NEW_TRANSACT")} onClick={() => openBI("customers")}><p className="dc-kpi-note">{analysis.loading ? "正在加载…" : analysis.error ? "客户指标加载失败" : metric("CUS_NEW_TRANSACT")?.value == null ? metric("CUS_NEW_TRANSACT")?.reason || "暂无可用数据" : "本月首次成交 · 非新建档"}</p>{analysis.error && headingAction("重试", analysis.retry)}</Kpi>
      </div>
      <div className={`dc-row dc-primary-row${owner ? "" : " dc-single"}`}>
        <section className="dc-panel" aria-label="销售趋势">
          <Heading icon="people" title="销售趋势" action={<div className="dc-legend" aria-label="趋势指标"><button aria-pressed={measure === "sales"} onClick={() => setMeasure("sales")}><i className="dc-legend-bar" />销售额</button><button aria-pressed={measure === "customers"} onClick={() => setMeasure("customers")}><i className="dc-legend-line" />成交客户</button></div>} />
          <Trend points={data.trend} customers={data.customer_trend} incomplete={incomplete} measure={measure} />
          <details className="dc-trend-details"><summary>查看每月精确数值 → <span>{incomplete ? `本月截至 ${data.through}` : "完整月"}</span></summary><div className="table-scroll"><table><thead><tr><th>月份</th><th>销售金额（元）</th><th>成交客户（个）</th></tr></thead><tbody>{data.trend.map(p => <tr key={p.date}><td>{p.date.slice(0, 7)}</td><td className="number-cell">{money(p.value)}</td><td className="number-cell">{data.customer_trend.find(c => c.date === p.date)?.value ?? "—"}</td></tr>)}</tbody></table></div></details>
        </section>
        {owner && <section className="dc-panel" aria-label="团队目标明细">
          <Heading icon="sales" title="目标达成与团队表现" action={headingAction("查看详情", () => openBI("team"))} />
          <div className="dc-team-summary"><div><span>整体目标达成率</span><strong>{completion === null ? "—" : `${completion.toFixed(1)}%`}</strong></div><p>已完成 {money(targetAmount)} 元<br />目标 {money(targetSum)} 元</p></div>
          <Track value={completion} label="已设目标人员合计完成率" />
          <div className="dc-team-caption">销售人员完成情况 <span>{expandedTeam ? "全部" : "TOP 5"}</span></div>
          <div className="dc-team-table" role="table" aria-label="销售人员完成情况"><div className="dc-team-row dc-team-th" role="row"><span role="columnheader">销售人员</span><span role="columnheader">完成金额</span><span role="columnheader">目标达成率</span></div>
            {(expandedTeam ? data.person_ranking : data.person_ranking.slice(0, 5)).map(r => <div className="dc-team-row" role="row" key={r.user_id}><span role="cell" className="dc-person"><i>{r.name.slice(0, 1)}</i>{r.name}</span><span role="cell">{money(r.amount)} <small>元</small></span><span role="cell" className="dc-team-rate"><Track value={r.completion === null ? null : Number(r.completion)} label={`${r.name} 目标完成率`} /><b className={r.completion !== null && Number(r.completion) < 75 ? "dc-warning" : "dc-positive"}>{r.completion === null ? "—" : `${Number(r.completion).toFixed(1)}%`}</b></span></div>)}
          </div>
          {!data.person_ranking.length && <p className="dc-empty">暂无可见的销售人员，请进入团队执行查看。</p>}
          <div className="dc-team-foot"><span>{!data.verified ? "销售口径待核实，不展示完成率" : "仅汇总已设个人月目标的人员"}</span>{data.person_ranking.length > 5 && headingAction(expandedTeam ? "收起" : "展开全部", () => setExpandedTeam(v => !v))}</div>
        </section>}
      </div>
      {owner && <>
        <div className="dc-row dc-secondary-row">
          <section className="dc-panel" aria-label="客户贡献"><Heading icon="document" title="客户贡献 Top 5" action={headingAction("客户分析", () => openBI("customers"))} />
            {contributions.length ? <ol className="dc-contributions">{contributions.map((c, i) => <li key={c.customer_id}><span className={`dc-rank dc-rank-${i + 1}`}>{i + 1}</span><div><div className="dc-contrib-title"><button className="text-button customer-link" onClick={() => openCRM({ tab: "customers", customerId: c.customer_id })}>{c.name}</button><span>{money(c.amount)} <small>元</small></span></div><span className="dc-contrib-track" role="img" aria-label={`${c.name} ${money(c.amount)} 元`}><i style={{ width: `${max > 0 ? Math.max(0, Number(c.amount) / max * 100) : 0}%` }} /></span></div></li>)}</ol> : <p className="dc-empty">本月暂无客户贡献。完成销售导入后可查看客户排名。</p>}
            <p className="dc-contrib-total">Top {contributions.length} 合计：{money(total)} 元{data.verified && Number(hero.value) > 0 && `（占比 ${(Number(total) / Number(hero.value) * 100).toFixed(1)}%）`} · 按销售额</p>
          </section>
          <section className="dc-panel" aria-label="需要关注"><Heading icon="bell" title="经营预警与需关注" action={headingAction("查看更多", () => openBI("attention"))} />
            {data.attention_items.length ? <ul className="dc-alerts">{data.attention_items.slice(0, 4).map((a, i) => <li key={`${a.entry}-${a.customer_id}-${i}`}><span className="dc-alert-icon"><Icon name={a.entry === "tasks" ? "tasks" : "bell"} /></span><div><strong>{a.kind}</strong><span title={`${a.name}；${a.action}`}>{a.name}{a.days === null ? "" : ` · ${a.days} 天`}<small>{a.action}</small></span></div><button className="text-button" onClick={() => openAttention(a)}>{a.customer_id ? "去跟进" : "去查看"} →</button></li>)}</ul> : <p className="dc-empty">暂无需关注事项。出现客户沉睡、项目停滞或逾期任务时会在此提醒。</p>}
            <details className="dc-alert-more"><summary>查看全部关注摘要 · 客户关注 {data.attention_total} 项</summary>{data.attention_items.slice(4).map((a, i) => <p key={i}>{a.kind}：{a.name} {headingAction("去查看", () => openAttention(a))}</p>)}{headingAction("进入待办与跟进", () => openCRM({ tab: "tasks" }))}</details>
          </section>
        </div>
        <div className="dc-row dc-secondary-row">
          <section className="dc-panel dc-compact" aria-label="项目管道"><Heading icon="document" title="项目管道概览" action={headingAction("查看详情", () => openCRM({ tab: "opportunities" }))} />
            <div className="dc-summary-stats">{[{ label: "开放项目", value: pipeline?.open_count, cls: "" }, { label: "本月预计成交", value: pipeline?.expected_this_month, cls: "dc-accent" }, { label: "加权金额", value: pipeline ? money(pipeline.weighted_amount) : undefined, cls: "dc-positive" }, { label: "停滞项目", value: pipeline?.stagnant_count, cls: "dc-negative" }].map(s => <button key={s.label} onClick={() => openCRM({ tab: "opportunities", openOnly: true })}><strong className={s.cls}>{s.value ?? "—"}<small>{s.label === "加权金额" ? "元" : "个"}</small></strong><span>{s.label}</span></button>)}</div>
            <details className="dc-pipeline-details"><summary>项目金额与阶段分布（预测口径）</summary>{pipeline ? <><p>有效项目金额 {money(pipeline.open_amount)} 元 · 加权金额 {money(pipeline.weighted_amount)} 元</p>{pipeline.stages.map(s => <p key={s.stage}>{opportunityStageLabels[s.stage] || s.stage}：{s.count} 个 · {money(s.amount)} 元</p>)}{pipeline.open_count === 0 && <p>暂无开放项目，可在客户详情中新增项目并安排下一步。</p>}</> : <p>暂无项目管道数据。</p>}</details>
          </section>
          <section className="dc-panel dc-compact" aria-label="我的待办"><Heading icon="tasks" title="我的待办" action={headingAction("查看全部", () => openCRM({ tab: "tasks", personId: userId }))} />
            <div className="dc-summary-stats">{[{ label: "今日待办", value: listCount(todayWork.data), view: "today" as const }, { label: "本周待办", value: listCount(weekWork.data), view: "week" as const }, { label: "开放项目", value: listCount(projectsWork.data), view: null }, { label: "逾期待办", value: listCount(overdueWork.data), view: "overdue" as const }].map(s => <button key={s.label} onClick={() => openCRM(s.view ? { tab: "tasks", personId: userId, taskView: s.view } : { tab: "opportunities", personId: userId, openOnly: true })}><strong className={s.view === "overdue" ? "dc-negative" : ""}>{s.value ?? "—"}<small>个</small></strong><span>{s.label}</span></button>)}</div>
            <p className="dc-personal-note">{workLoading ? "正在加载本人工作数据…" : workFailed ? <>本人待办加载失败 {headingAction("重试", () => personalWork.forEach(w => { if (w.error) w.retry(); }))}</> : "当前登录人 · 今日、本周与逾期可能重叠；100+ 表示至少 100 条"}</p>
          </section>
        </div>
      </>}
      <details className="dc-disclosure"><summary><span className={data.verified ? "status-ready" : "status-pending"}>{data.verified ? "销售口径已核实" : "待业务核实"}</span> 截至 {data.through} · 指标口径与数据状态{data.updated_at && <span> · 更新 {dateTime(data.updated_at)}</span>}</summary>
        <p>销售趋势按当前所选数据源展示；当月为未完月，环比基期为上月完整月。项目为全公司当前开放项目，待办为当前登录人。缺失数据以“—”展示。</p>
        {[...data.warnings, ...data.finance_warnings, ...(margins.data?.warnings ?? [])].map((w, i) => <p key={i}>{w}</p>)}
        {[...data.sales_metrics, ...(analysis.data?.metrics ?? []), ...(margins.data?.metrics ?? [])].map((m, i) => <p key={`${m.code}-${i}`}><b>{m.label}</b> · {m.code}：{m.definition}（{m.source}）{m.value === null && m.reason ? `；${m.reason}` : ""}</p>)}
        <h2>财务视图</h2>{data.finance_metrics.length ? <div className="dc-finance-values">{data.finance_metrics.map(m => <div key={m.code}><span>{m.label}</span><strong>{m.value === null ? "—" : m.unit === "元" ? money(m.value) : m.value} {m.value !== null && m.unit}</strong><p>{m.definition} · {m.code}{m.value === null && m.reason ? ` · ${m.reason}` : ""}</p></div>)}</div> : <p>当前无可见财务指标。</p>}
      </details>
    </>}
  </section>;
}
