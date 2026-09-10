"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { CRMEntry } from "./crm-navigation";

type Role = "owner" | "manager" | "sales" | "finance" | "admin";
type Person = { id: string; name: string };
type Metric = { definition: string; source: string; code: string; label: string; value: string | null; unit: string; reason: string | null };
type Workbench = { user_id: string; name: string; month: string; through: string; metrics: Metric[]; warnings: string[]; today_tasks: number; week_tasks: number; overdue_tasks: number; open_opportunities: number };
type Target = { amount: string | null; remark: string | null };
type Dimension = { id: string; name: string; current: string; previous: string | null; change: string | null; orders: number; customers: number; quantity: string | null; unit: string | null; average_price: string | null };
type Analysis = { month: string; through: string; previous_month: string; basis: string; verified: boolean; warnings: string[]; updated_at: string | null; metrics: Metric[]; trend: { date: string; value: string }[]; rows: Dimension[]; total_rows: number; total_change: string | null; other_change: string | null; line_difference: string | null };
type Settings = { work_week: number[]; calendar: Record<string, boolean>; personal_calendar: Record<string, Record<string, boolean>>; dormant_days: number; lost_warning_days: number; followup_days: Record<string, number>; effective_activity_types: string[]; cancelled_tasks: "include" | "exclude" | null };
type Review = { coverage_from: string; coverage_to: string; valid_statuses: string[]; excluded_statuses: string[]; return_statuses: string[]; staff_mapping_complete: boolean; full_history: boolean; reason: string; acknowledge_export_scope: boolean };
type OrderPage = { rows: { id: string; number: string; date: string; amount: string; status: string }[]; total: number };
type Detail = { order_no: string; amount: string; customer: string; lines: { line_no: number; quantity: string; amount: string }[] };

const currentMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const value = (v: string | null | undefined) => v == null ? "—" : v;
const actionNames: Record<string, string> = { followup_create: "新增跟进", followup_update: "修改跟进", task_complete: "完成待办", opportunity_create: "新增商机", opportunity_update: "更新商机", customer_update: "维护客户", contact_create: "新增联系人", contact_update: "修改联系人" };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...options });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error?.message || "请求失败，请重试");
  return body;
}

function useLoad<T>(url: string | null, revision = 0): { data?: T; error?: string; loading: boolean; retry: () => void } {
  const [result, setResult] = useState<{ url: string | null; data?: T; error?: string; loading: boolean }>({ url: null, loading: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setResult({ url, loading: true });
    request<T>(url, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setResult({ url, data, loading: false }); }).catch(e => {
      if (!controller.signal.aborted) setResult({ url, error: e.message, loading: false });
    });
    return () => controller.abort();
  }, [url, revision, retry]);
  return { ...(result.url === url ? result : { loading: !!url }), retry: () => setRetry(n => n + 1) };
}

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

function Trend({ points }: { points: Analysis["trend"] }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let chart: import("echarts").ECharts | undefined;
    const observer = new ResizeObserver(() => chart?.resize());
    if (element.current) observer.observe(element.current);
    import("echarts").then(echarts => {
      if (disposed || !element.current) return;
      chart = echarts.init(element.current, undefined, { renderer: "svg" });
      chart.setOption({ color: ["#28624b"], grid: { left: 70, right: 20, top: 24, bottom: 45 }, tooltip: { trigger: "axis", renderMode: "richText" }, xAxis: { type: "category", data: points.map(p => p.date.slice(5)) }, yAxis: { type: "value", name: "元" }, series: [{ type: "line", data: points.map(p => Number(p.value)), smooth: false, areaStyle: { opacity: 0.08 } }] });
    });
    return () => { disposed = true; observer.disconnect(); chart?.dispose(); };
  }, [points]);
  return <section className="card"><h2>日销售趋势</h2><div ref={element} className="bi-chart" role="img" aria-label="日销售趋势图，下方可展开精确金额表" /><details><summary>查看每日精确金额</summary><div className="bi-table-wrap"><table><thead><tr><th>日期</th><th>金额（元）</th></tr></thead><tbody>{points.map(p => <tr key={p.date}><td>{p.date}</td><td>{p.value}</td></tr>)}</tbody></table></div></details></section>;
}

function Orders({ source, month, dimension, item, close }: { source: string; month: string; dimension: string; item: { id: string; name: string }; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [offset, setOffset] = useState(0);
  const [orderId, setOrderId] = useState("");
  const [orderMonth, setOrderMonth] = useState(month);
  const list = useLoad<OrderPage>(`/api/bi/orders?source_id=${source}&month=${orderMonth}-01&dimension=${dimension}&key=${encodeURIComponent(item.id)}&offset=${offset}`);
  const detail = useLoad<Detail>(orderId ? `/api/data/sales/orders/${orderId}` : null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="bi-dialog" aria-labelledby="bi-orders-title" onCancel={close} onClose={close}><div className="bi-dialog-head"><h2 id="bi-orders-title">{item.name} · 源订单</h2><button onClick={close}>关闭订单</button></div><p className="muted">订单原始金额，按来源状态调整前；可切换月份查看历史。</p><label>订单月份<input type="month" value={orderMonth} onChange={e => { setOrderMonth(e.target.value || currentMonth()); setOffset(0); setOrderId(""); }} /></label>{orderId ? <><button onClick={() => setOrderId("")}>返回订单列表</button><Feedback state={detail} />{detail.data && <><h3>{detail.data.order_no}</h3><p>{detail.data.customer} · {detail.data.amount} 元</p><div className="bi-table-wrap"><table><thead><tr><th>行</th><th>数量</th><th>金额</th></tr></thead><tbody>{detail.data.lines.map(l => <tr key={l.line_no}><td>{l.line_no}</td><td>{l.quantity}</td><td>{l.amount}</td></tr>)}</tbody></table></div></>}</> : <><Feedback state={list} />{list.data && <><div className="bi-table-wrap"><table><thead><tr><th>单号</th><th>日期</th><th>源金额</th><th>来源状态</th><th>操作</th></tr></thead><tbody>{list.data.rows.map(o => <tr key={o.id}><td>{o.number}</td><td>{o.date}</td><td>{o.amount}</td><td>{o.status}</td><td><button onClick={() => setOrderId(o.id)}>查看明细</button></td></tr>)}</tbody></table></div>{!list.data.total && <p>该月没有可见订单。</p>}<Pages offset={offset} total={list.data.total} size={30} onChange={setOffset} /></>}</>}</dialog>;
}

function TargetForm({ person, month, changed }: { person: string; month: string; changed: () => void }) {
  const state = useLoad<Target>(`/api/bi/targets/${person}?month=${month}-01`);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setMessage(""); setError("");
    try { await request(`/api/bi/targets/${person}?month=${month}-01`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: form.get("amount"), remark: form.get("remark") || null }) }); setMessage("目标已保存，修改历史已留痕"); changed(); state.retry(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="card"><h2>月销售目标</h2><Feedback state={state} />{state.data && <form aria-label="设置月销售目标" onSubmit={save} key={`${person}-${month}-${state.data.amount}`}><div className="bi-form-grid"><label>月目标金额（元）<input name="amount" type="number" step="0.01" min="0" required defaultValue={state.data.amount || ""} /></label><label>调整说明<input name="remark" maxLength={255} defaultValue={state.data.remark || ""} /></label></div><button className="primary" disabled={busy}>保存月目标</button></form>}{message && <p role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}</section>;
}

function Configuration({ persons, source }: { persons: Person[]; source: string }) {
  const loaded = useLoad<Settings>("/api/bi/settings");
  const reviewState = useLoad<Review | null>(source ? `/api/bi/reviews/${source}` : null);
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
  return <><Feedback state={loaded} />{error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}{config && <section className="card"><h2>工作日历与指标参数</h2><p className="muted">节假日、调休、请假及入离职日期通过日历例外维护，不自动推测。</p><form aria-label="工作日历与指标参数" onSubmit={e => { e.preventDefault(); save("/api/bi/settings", config); }}><fieldset><legend>每周工作日</legend><div className="bi-checks">{["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((n, i) => <label key={n}><input type="checkbox" checked={config.work_week.includes(i)} onChange={e => setConfig({ ...config, work_week: e.target.checked ? [...config.work_week, i] : config.work_week.filter(v => v !== i) })} />{n}</label>)}</div></fieldset><div className="bi-form-grid"><label>沉睡阈值（天）<input type="number" min="1" required value={config.dormant_days} onChange={e => setConfig({ ...config, dormant_days: Number(e.target.value) })} /></label><label>疑似流失阈值（天）<input type="number" min="2" required value={config.lost_warning_days} onChange={e => setConfig({ ...config, lost_warning_days: Number(e.target.value) })} /></label><label>取消任务计入到期分母<select value={config.cancelled_tasks || ""} onChange={e => setConfig({ ...config, cancelled_tasks: e.target.value as Settings["cancelled_tasks"] || null })}><option value="">待业务确认</option><option value="exclude">排除取消任务</option><option value="include">包含取消任务</option></select></label>{["A", "B", "C"].map(level => <label key={level}>{level} 级跟进阈值（天，可空）<input type="number" min="1" value={config.followup_days[level] || ""} onChange={e => { const days = { ...config.followup_days }; if (e.target.value) days[level] = Number(e.target.value); else delete days[level]; setConfig({ ...config, followup_days: days }); }} /></label>)}</div><fieldset><legend>有效业务动作（登录、浏览不计）</legend><div className="bi-checks">{Object.entries(actionNames).map(([k, label]) => <label key={k}><input type="checkbox" checked={config.effective_activity_types.includes(k)} onChange={e => setConfig({ ...config, effective_activity_types: e.target.checked ? [...config.effective_activity_types, k] : config.effective_activity_types.filter(v => v !== k) })} />{label}</label>)}</div></fieldset><h3>日期例外</h3><div className="bi-form-grid"><label>例外日期<input type="date" value={calendarDate} onChange={e => setCalendarDate(e.target.value)} /></label><label>适用人员<select value={calendarPerson} onChange={e => setCalendarPerson(e.target.value)}><option value="">全体人员</option>{persons.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>该日安排<select value={working ? "work" : "off"} onChange={e => setWorking(e.target.value === "work")}><option value="off">非工作日</option><option value="work">工作日</option></select></label></div><button type="button" onClick={calendarAdd} disabled={!calendarDate}>加入日历例外</button><ul className="bi-calendar-list">{Object.entries({ "": config.calendar, ...config.personal_calendar }).flatMap(([uid, days]) => Object.entries(days).sort().map(([day, work]) => <li key={`${uid}-${day}`}>{day} · {uid ? persons.find(p => p.id === uid)?.name || "历史人员" : "全体"} · {work ? "工作日" : "非工作日"}<button type="button" onClick={() => calendarRemove(uid, day)}>移除例外</button></li>))}</ul><button className="primary" disabled={busy}>保存日历与参数</button></form></section>}
    {source && <section className="card"><h2>销售数据核实</h2><p>仅在人工确认导出期间完整、有效单据及退货/作废处理后保存。保存不会改写订单原始金额或状态，后续销售事实更新将要求重新核实。</p><Feedback state={reviewState} />{!reviewState.loading && !reviewState.error && <form aria-label="销售数据核实" key={source + JSON.stringify(reviewState.data)} onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const statuses = (key: string) => String(f.get(key) || "").split(",").map(s => s.trim()).filter(Boolean); save(`/api/bi/reviews/${source}`, { coverage_from: f.get("from"), coverage_to: f.get("to"), valid_statuses: statuses("valid"), excluded_statuses: statuses("excluded"), return_statuses: statuses("returns"), staff_mapping_complete: f.has("staff"), full_history: f.has("history"), acknowledge_export_scope: f.has("ack"), reason: f.get("reason") }); }}><div className="bi-form-grid"><label>完整覆盖起日<input type="date" name="from" required defaultValue={reviewState.data?.coverage_from} /></label><label>完整覆盖止日<input type="date" name="to" required defaultValue={reviewState.data?.coverage_to} /></label><label>有效单据状态值（逗号分隔）<input name="valid" required defaultValue={reviewState.data?.valid_statuses.join(",") || ""} /></label><label>作废/取消状态值<input name="excluded" defaultValue={reviewState.data?.excluded_statuses.join(",") || "void,cancelled"} /></label><label>退货状态值（金额按负数计）<input name="returns" defaultValue={reviewState.data?.return_statuses.join(",") || "return"} /></label><label>核实依据<textarea name="reason" required minLength={5} maxLength={1000} defaultValue={reviewState.data?.reason} /></label></div><div className="bi-checks"><label><input type="checkbox" name="staff" />销售人员映射已完整核实</label><label><input type="checkbox" name="history" />覆盖起日前不存在遗漏的历史成交</label><label><input type="checkbox" name="ack" required />已人工核实有效单据、退货/作废和导出期间</label></div><button className="primary" disabled={busy}>保存人工核实结论</button></form>}</section>}</>;
}

export default function BI({ role, userId, openCRM }: { role: Role; userId: string; openCRM: (entry?: CRMEntry) => void }) {
  const [tab, setTab] = useState(role === "admin" ? "settings" : role === "finance" ? "sales" : "workbench");
  const [month, setMonth] = useState(currentMonth());
  const [person, setPerson] = useState(role === "sales" || role === "manager" ? userId : "");
  const [selectedSource, setSource] = useState("");
  const [dimension, setDimension] = useState("customer");
  const [basis, setBasis] = useState("source");
  const [offset, setOffset] = useState(0);
  const [teamOffset, setTeamOffset] = useState(0);
  const [attentionOffset, setAttentionOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [drill, setDrill] = useState<{ id: string; name: string; dimension: string }>();
  const persons = useLoad<Person[]>(role !== "finance" ? "/api/bi/people" : null);
  const sources = useLoad<Person[]>("/api/bi/sources");
  const source = selectedSource || sources.data?.[0]?.id || "";
  useEffect(() => { if (!person && persons.data?.length) setPerson(persons.data[0].id); }, [person, persons.data]);
  const work = useLoad<Workbench>(tab === "workbench" && person ? `/api/bi/workbench/${person}?month=${month}-01` : null, revision);
  const team = useLoad<{ rows: Workbench[]; total: number }>(tab === "team" ? `/api/bi/team?month=${month}-01&offset=${teamOffset}` : null, revision);
  const report = useLoad<Analysis>(tab === "sales" && source ? `/api/bi/sales?source_id=${source}&month=${month}-01&dimension=${dimension}&basis=${basis}&offset=${offset}` : null, revision);
  const attention = useLoad<{ rows: { id: string; name: string; kind: string; days: number | null }[]; total: number; warnings: string[] }>(tab === "attention" && source ? `/api/bi/attention?source_id=${source}&offset=${attentionOffset}` : null);
  const tabs = role === "admin" ? [["settings", "日历与分析设置"]] : role === "finance" ? [["sales", "销售分析"], ["attention", "客户关注"]] : [["workbench", "个人工作台"], ...(role !== "sales" ? [["team", "团队执行"]] : []), ["sales", "销售分析"], ["attention", "客户关注"]];
  return <div className="bi"><p className="eyebrow">目标 · 过程 · 经营</p><h1>销售工作台与分析</h1><p className="muted">以精斗云交易为实际业绩依据，让目标、客户动作和未来商机清楚可见。</p><nav className="bi-tabs" aria-label="分析导航">{tabs.map(([key, label]) => <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setDrill(undefined); }}>{label}</button>)}<button onClick={() => openCRM()}>进入客户与待办</button></nav><div className="bi-toolbar">{tab !== "settings" && tab !== "attention" && <label>统计月份<input type="month" value={month} onChange={e => { setMonth(e.target.value || currentMonth()); setOffset(0); }} /></label>}{tab === "workbench" && <label>查看人员<select value={person} onChange={e => setPerson(e.target.value)}>{persons.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}{["sales", "attention", "settings"].includes(tab) && <label>分析数据源<select value={source} onChange={e => { setSource(e.target.value); setOffset(0); setAttentionOffset(0); }}><option value="">请选择数据源</option>{sources.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}{tab === "sales" && <><label>数据口径<select value={basis} onChange={e => { setBasis(e.target.value); setOffset(0); }}><option value="source">源销售核对（待核实）</option><option value="verified">已确认经营销售</option></select></label><label>分析维度<select value={dimension} onChange={e => { setDimension(e.target.value); setOffset(0); }}><option value="customer">客户</option><option value="product">商品</option><option value="person">业务员</option></select></label></>}</div><Feedback state={sources} /><Feedback state={persons} />
    {tab === "workbench" && <><Feedback state={work} />{!person && !persons.loading && <p>尚无可查看的销售人员，请先配置业务账号。</p>}{work.data && <><p className="muted">{work.data.name} · {work.data.month.slice(0, 7)} · 统计截至 {work.data.through}</p><Notes notes={work.data.warnings} /><div className="bi-summary"><button onClick={() => openCRM({tab:"tasks",taskView:"today",personId:work.data!.user_id})}>今日待办 <strong>{work.data.today_tasks}</strong></button><button onClick={() => openCRM({tab:"tasks",taskView:"week",personId:work.data!.user_id})}>本周待办 <strong>{work.data.week_tasks}</strong></button><button onClick={() => openCRM({tab:"tasks",taskView:"overdue",personId:work.data!.user_id})}>逾期待办 <strong>{work.data.overdue_tasks}</strong></button><button onClick={() => openCRM({tab:"opportunities",openOnly:true,personId:work.data!.user_id})}>开放商机 <strong>{work.data.open_opportunities}</strong></button></div><Metrics rows={work.data.metrics} /></>}{person && ["owner", "manager"].includes(role) && <TargetForm person={person} month={month} changed={() => setRevision(v => v + 1)} />}</>}
    {tab === "team" && <><Feedback state={team} />{team.data && <><p>并列查看目标、业务动作和商机；不生成个人综合评分。点击人员查看完整指标。</p><div className="bi-table-wrap"><table><thead><tr><th>人员</th><th>月目标</th><th>已确认销售</th><th>完成率</th><th>登录工作日</th><th>有效活跃日</th><th>有效跟进</th><th>逾期任务</th><th>加权商机</th></tr></thead><tbody>{team.data.rows.map(w => { const m = (code: string) => value(w.metrics.find(m => m.code === code)?.value); return <tr key={w.user_id}><td><button onClick={() => { setPerson(w.user_id); setTab("workbench"); }}>{w.name}</button></td><td>{m("TGT_MONTH_AMT")}</td><td>{m("EXEC_SALES_AMT")}</td><td>{m("TGT_COMPLETION")}</td><td>{m("CRM_LOGIN_DAY")}</td><td>{m("CRM_EFFECTIVE_DAY")}</td><td>{m("CRM_FOLLOWUP_COUNT")}</td><td>{w.overdue_tasks}</td><td>{m("OPP_WEIGHTED_AMT")}</td></tr>; })}</tbody></table></div><Pages offset={teamOffset} total={team.data.total} size={20} onChange={setTeamOffset} /></>}</>}
    {tab === "sales" && <><Feedback state={report} />{!source && !sources.loading && <p>暂无可见的销售数据源。未映射订单不会自动分配给当前账号。</p>}{report.data && <><h2>{report.data.basis} · {report.data.month.slice(0, 7)}</h2><p className="muted">统计截至 {report.data.through} · 对比 {report.data.previous_month.slice(0, 7)} 完整月 · 最近事实更新 {report.data.updated_at ? new Date(report.data.updated_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "暂无"}</p><Notes notes={report.data.warnings} /><Metrics rows={report.data.metrics} />{!!report.data.trend.length && <Trend points={report.data.trend} />}<section className="card"><h2>销售变化贡献</h2><p>按增减金额的绝对影响排序。维度变化合计 {value(report.data.total_change)} 元，本页之外合计 {value(report.data.other_change)} 元。</p>{report.data.line_difference !== null && <p>本期订单头与商品明细口径差额：{report.data.line_difference} 元。差额单列，不分摊到商品。</p>}<div className="bi-table-wrap"><table><thead><tr><th>名称</th><th>本期金额</th><th>上期金额</th><th>变化贡献</th>{dimension === "product" && <><th>数量/单位</th><th>均价</th></>}<th>下钻</th></tr></thead><tbody>{report.data.rows.map(r => <tr key={r.id}><td>{r.name}</td><td>{r.current}</td><td>{value(r.previous)}</td><td>{value(r.change)}</td>{dimension === "product" && <><td>{r.quantity ? `${r.quantity} ${r.unit || "单位待核实"}` : "不可跨单位汇总"}</td><td>{value(r.average_price)}</td></>}<td><button onClick={() => setDrill({ id: r.id, name: r.name, dimension })}>查看源订单</button></td></tr>)}</tbody></table></div>{!report.data.rows.length && <p>本口径暂无可用记录。</p>}<Pages offset={offset} total={report.data.total_rows} size={20} onChange={setOffset} /></section></>}</>}
    {tab === "attention" && <><Feedback state={attention} />{!source && !sources.loading && <p>暂无可见销售数据源。</p>}{attention.data && <><Notes notes={attention.data.warnings} /><p>客户关注按今天判断，标签不自动修改客户状态。</p><div className="bi-attention">{attention.data.rows.map((r, i) => <article className="card" key={`${r.id}-${i}`}><h3>{r.name}</h3><p>{r.kind}{r.days !== null ? ` · ${r.days} 天` : ""}</p><button onClick={() => setDrill({ id: r.id, name: r.name, dimension: "customer" })}>查看源订单</button></article>)}</div>{!attention.data.total && <p>当前没有可判定的关注项，请同时查看上方数据条件。</p>}<Pages offset={attentionOffset} total={attention.data.total} size={30} onChange={setAttentionOffset} /></>}</>}
    {tab === "settings" && <Configuration persons={persons.data || []} source={source} />}
    {drill && <Orders source={source} month={month} dimension={drill.dimension} item={drill} close={() => setDrill(undefined)} />}
  </div>;
}
