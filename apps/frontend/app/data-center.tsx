"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import OrdersDialog from "./orders-dialog";
import FinancePreviewDialog from "./finance-preview-dialog";

type Source = { id: string; source_code: string; source_name: string; entity_name: string; staff: Record<string, string> };
type Batch = { id: string; data_source_id: string; business_type: string; original_filename: string; status: string;
  total_rows: number; success_rows: number; error_rows: number; duplicate_of: string | null; started_at: string;
  preview: { summary: { records?: number; orders?: number; lines?: number; source_amount?: string; date_from?: string; date_to?: string };
    errors: { row: number; field: string; message: string }[]; warnings: string[]; mapping: object;
    result?: { inserted: number; updated: number; unchanged: number } } };
type Period = { id: string; month: string; is_closed: boolean; profit_batch_id: string | null; balance_batch_id: string | null };
type Metric = { code: string; name: string; type: string; period_value: string | null; ytd_value: string | null;
  begin_value: string | null; end_value: string | null; batch_id: string };
type Finance = { month: string; confirmed: boolean; metrics: Metric[] };
type Month = { month: string; orders: number; amount: string; through: string; incomplete_month: boolean };
type RawRow = { sheet: string; row: number; status: string; error: string | null; cells: unknown[] };
const kinds: Record<string, string> = { customer: "客户档案", product: "商品档案", sales: "销售单", profit: "利润表", balance_sheet: "资产负债表" };
const status: Record<string, string> = { pending: "待确认", failed: "预检未通过", success: "已导入" };
function money(s: string | null | undefined) { if (s == null) return "未填报"; const [a, b = ""] = s.split("."); return a.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + b.padEnd(2, "0"); }
async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/data${path}`, { cache: "no-store", ...init });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "请求失败，请重试");
  return result;
}
const json = (body: object, method = "POST"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function DataCenter({ role }: { role: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Batch | null>(null);
  const [kind, setKind] = useState(role === "finance" ? "profit" : "customer");
  const [blank, setBlank] = useState(false);
  const [ack, setAck] = useState(false);
  const [replace, setReplace] = useState(false);
  const [mapping, setMapping] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(role === "owner" ? "reconcile" : "imports");
  const [months, setMonths] = useState<Month[]>([]);
  const [finance, setFinance] = useState<Finance[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [offset, setOffset] = useState(0);
  const [raw, setRaw] = useState<RawRow[]>([]);
  const [rawOffset, setRawOffset] = useState(0);
  const [users, setUsers] = useState<{ id: string; display_name: string; username: string }[]>([]);
  const [staff, setStaff] = useState<Record<string, string>>({});
  const [staffName, setStaffName] = useState("");
  const [staffUser, setStaffUser] = useState("");
  const [orderSelection, setOrderSelection] = useState<{ source: string; month: string } | null>(null);
  const [financePreviewId, setFinancePreviewId] = useState<string | null>(null);
  const reportRequest = useRef(0);

  async function act(fn: () => Promise<void>) { setBusy(true); setError(""); setMessage(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "网络异常"); } finally { setBusy(false); } }
  async function refreshBatches(page = offset) { setBatches(await api(`/imports?offset=${page}&limit=20`)); }
  async function refreshSources() { const list = await api("/sources"); setSources(list); setSource(previous => previous || list[0]?.id || ""); }
  async function refreshReports() {
    const requestId = ++reportRequest.current;
    if (!source) { setMonths([]); setFinance([]); setPeriods([]); return; }
    const p = await api(`/finance/periods?source_id=${source}`);
    if (requestId !== reportRequest.current) return;
    setPeriods(p);
    if (role !== "admin") {
      const m = await api(`/sales/monthly?source_id=${source}`);
      const f = await api(`/finance/monthly?source_id=${source}`);
      if (requestId !== reportRequest.current) return;
      setMonths(m.rows); setFinance(f.rows);
    }
  }
  useEffect(() => { act(async () => { await refreshSources(); await refreshBatches(0); if (["admin", "owner"].includes(role)) setUsers(await api("/mapping-users")); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setStaff(sources.find(s => s.id === source)?.staff || {}); setOrderSelection(null); setFinancePreviewId(null); setMonths([]); setFinance([]); setSelected(null); setRaw([]); refreshReports().catch(e => setError(e.message)); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps
  const canWrite = role === "admin" || role === "finance" || role === "owner"; // V1 usage: owner runs data imports
  const pendingFinance = batches.filter(b => b.data_source_id === source && b.status === "pending" && ["profit", "balance_sheet"].includes(b.business_type));
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("file") as File;
    await act(async () => {
      const parsed = mapping.trim() ? JSON.parse(mapping) : {};
      const query = new URLSearchParams({ source_id: source, kind, filename: file.name, options: JSON.stringify({ mapping: parsed, blank_as_zero: blank }) });
      const b: Batch = await api(`/imports?${query}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
      setSelected(b); setAck(false); setReplace(false); setRaw([]); setOffset(0); await refreshBatches(0);
      setMessage(b.status === "failed" ? "预检发现问题，请按原始行号修正后重新上传。" : "预检完成。请核对结果，再确认导入。");
    });
  }
  async function confirm() {
    await act(async () => {
      const b = await api(`/imports/${selected!.id}/confirm`, json({ acknowledge_warnings: ack, replace_version: replace }));
      setSelected(b); await refreshBatches(); await refreshReports(); setMessage("导入完成，核对数据已更新。");
    });
  }
  async function loadRows(page: number) { await act(async () => { setRaw(await api(`/imports/${selected!.id}/rows?offset=${page}&limit=20`)); setRawOffset(page); }); }

  return <><p className="eyebrow">工作空间 / 数据中心</p><h1>数据中心</h1><p className="muted">先预检，再确认导入。每个批次保留原件和核对记录。</p>
    <div className="data-toolbar"><label>数据源<select aria-label="数据源" value={source} onChange={e => setSource(e.target.value)}><option value="">请选择数据源</option>{sources.map(s => <option key={s.id} value={s.id}>{s.source_name}</option>)}</select></label><button disabled={busy} onClick={() => act(async () => { await refreshSources(); await refreshBatches(); await refreshReports(); })}>刷新</button></div>
    <div className="data-tabs"><button aria-pressed={tab === "imports"} onClick={() => setTab("imports")}>文件导入与历史</button><button aria-pressed={tab === "reconcile"} onClick={() => setTab("reconcile")}>{["admin", "owner"].includes(role) ? "财务期间确认" : "月度核对"}</button>{["admin", "owner"].includes(role) && <button aria-pressed={tab === "settings"} onClick={() => setTab("settings")}>数据源与人员映射</button>}</div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="data-success" role="status">{message}</p>}{busy && <p aria-live="polite">正在处理，请稍候…</p>}
    {!sources.length && <p className="notice">请由系统管理员在“数据源与人员映射”中创建数据源。客户、商品、销售和同一主体财务报表请选择同一个数据源。</p>}
    {tab === "settings" && ["admin", "owner"].includes(role) && <><section className="card data-section"><h2>创建数据源</h2><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); act(async () => { const created = await api("/sources", json({ source_code: f.get("code"), source_name: f.get("name"), entity_name: f.get("entity") })); await refreshSources(); setSource(created.id); setMessage("数据源已创建，可以上传文件。"); }); }}>
      <label>数据源编码<input name="code" placeholder="例如 company_erp" pattern="[a-z][a-z0-9_]*" maxLength={64} required /></label><label>显示名称<input name="name" maxLength={100} required /></label><label>公司全称<input name="entity" placeholder="必须与财务报表编制单位一致" maxLength={255} required /></label><button className="primary" disabled={busy}>创建数据源</button></form></section>
      {source && <section className="card data-section"><h2>销售人员对应账号</h2><p>使用导出文件中的人员名称。未映射记录保持未分配；更改后仅用于新预检，不自动改写历史归属。</p>
        {Object.entries(staff).map(([name, id]) => <div className="data-toolbar" key={name}><span>{name} → {users.find(u => u.id === id)?.display_name || "账号"}</span><button onClick={() => setStaff(Object.fromEntries(Object.entries(staff).filter(([n]) => n !== name)))}>移除 {name}</button></div>)}
        <label>导出中的人员名称<input value={staffName} onChange={e => setStaffName(e.target.value)} maxLength={100} /></label><label>对应平台账号<select value={staffUser} onChange={e => setStaffUser(e.target.value)}><option value="">请选择账号</option>{users.map(u => <option key={u.id} value={u.id}>{u.display_name}（{u.username}）</option>)}</select></label>
        <button disabled={!staffName.trim() || !staffUser} onClick={() => { setStaff({ ...staff, [staffName.trim()]: staffUser }); setStaffName(""); }}>加入映射列表</button><button disabled={busy} onClick={() => act(async () => { await api(`/sources/${source}/staff`, json({ staff }, "PUT")); await refreshSources(); setMessage("人员映射已保存。"); })}>保存人员映射</button></section>}</>}
    {tab === "imports" && <>{canWrite && <section className="card data-section"><h2>上传并预检</h2><form onSubmit={upload}><label>文件类型<select aria-label="文件类型" value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(kinds).filter(([k]) => ["admin", "owner"].includes(role) || ["profit", "balance_sheet"].includes(k)).map(([k, label]) => <option value={k} key={k}>{label}</option>)}</select></label>
      <label>选择文件<input name="file" type="file" accept=".xls,.xlsx,.csv" required /></label><p>支持 Excel 和 UTF-8 CSV。销售导出须保留每单合计行，先导客户与商品档案。</p>
      {["profit", "balance_sheet"].includes(kind) && <label className="check"><input type="checkbox" checked={blank} onChange={e => setBlank(e.target.checked)} />确认本表空白科目按零参与金额勾稽（原始空白仍保留）</label>}
      {!["profit", "balance_sheet"].includes(kind) && <details><summary>自定义列映射（标准导出无需填写）</summary><p>列号从 1 开始。例如客户表：{`{"_header_row":2,"code":2,"name":3}`}。销售可映射 order_no、order_date、customer_code、sales_amount、product_code、quantity、line_amount、updated 等字段。</p><textarea aria-label="自定义列映射" value={mapping} onChange={e => setMapping(e.target.value)} rows={4} /></details>}
      <button className="primary" type="submit" disabled={busy || !source}>上传并预检</button></form></section>}
      {selected && <section className="card data-section" aria-label="预检结果"><h2>{selected.original_filename}</h2><p>{status[selected.status]} · 原始行 {selected.total_rows} · 错误行 {selected.error_rows}</p><p>业务记录 {selected.preview.summary.records ?? 0}{selected.preview.summary.lines != null && ` · 商品明细 ${selected.preview.summary.lines}`}{selected.preview.summary.source_amount != null && ` · 源销售金额 ${money(selected.preview.summary.source_amount)} 元`}</p>
        {selected.preview.summary.date_from && <p>识别期间：{selected.preview.summary.date_from} 至 {selected.preview.summary.date_to}</p>}
        {selected.duplicate_of && <p className="data-success">识别到曾导入的相同文件，确认后不会重复计数。</p>}
        {selected.preview.warnings.map((w, i) => <p key={i} className="data-warning">{w}</p>)}
        {selected.preview.errors.length > 0 && <><div className="table-scroll"><table><thead><tr><th>原始行</th><th>字段</th><th>问题</th></tr></thead><tbody>{selected.preview.errors.slice(0, 100).map((e, i) => <tr key={i}><td>{e.row || "文件"}</td><td>{e.field}</td><td>{e.message}</td></tr>)}</tbody></table></div>{selected.preview.errors.length > 100 && <p>这里显示前 100 条。完整问题见原始行追溯及下载的错误清单。</p>}<button onClick={() => { const blob = new Blob([JSON.stringify(selected.preview.errors, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "导入问题.json"; a.click(); URL.revokeObjectURL(url); }}>下载错误清单</button></>}
        <details><summary>本次字段映射</summary><pre>{JSON.stringify(selected.preview.mapping, null, 2)}</pre></details>
        {canWrite && selected.status === "pending" && <><label className="check"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />已核对本次预检提示与金额</label>{["profit", "balance_sheet"].includes(selected.business_type) && <label className="check"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} />若该月份已有报表，确认用本次版本替换（旧版本仍保留）</label>}<button className="primary" disabled={busy || !ack} onClick={confirm}>确认导入</button></>}
        {selected.preview.result && <p role="status">新增 {selected.preview.result.inserted} · 更新 {selected.preview.result.updated} · 未变化 {selected.preview.result.unchanged}</p>}
        <div className="data-toolbar"><a href={`/api/data/imports/${selected.id}/file`}>下载原始文件</a><button disabled={busy} onClick={() => loadRows(0)}>查看原始行追溯</button>{selected.status !== "failed" && ["profit", "balance_sheet"].includes(selected.business_type) && <button aria-haspopup="dialog" onClick={() => setFinancePreviewId(selected.id)}>查看财务预览</button>}</div>
        {raw.length > 0 && <><div className="table-scroll"><table><thead><tr><th>工作表/行</th><th>状态</th><th>原始内容</th></tr></thead><tbody>{raw.map(r => <tr key={`${r.sheet}-${r.row}`}><td>{r.sheet} / {r.row}</td><td>{r.status}{r.error && `：${r.error}`}</td><td>{r.cells.map(v => v == null ? "∅" : String(v)).join(" | ")}</td></tr>)}</tbody></table></div><button disabled={busy || rawOffset === 0} onClick={() => loadRows(Math.max(0, rawOffset-20))}>前 20 行</button><button disabled={busy || raw.length < 20} onClick={() => loadRows(rawOffset+20)}>后 20 行</button></>}
      </section>}
      <section className="card data-section"><h2>导入历史</h2><div className="table-scroll"><table><thead><tr><th>文件</th><th>类型</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>{batches.map(b => <tr key={b.id}><td>{b.original_filename}</td><td>{kinds[b.business_type]}</td><td>{status[b.status]}</td><td>{new Date(b.started_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</td><td><button onClick={() => { setSelected(b); setRaw([]); setAck(false); setReplace(false); }}>查看批次</button></td></tr>)}</tbody></table></div>{!batches.length && <p>还没有导入记录。</p>}<button disabled={busy || offset === 0} onClick={() => act(async () => { const n = Math.max(0, offset-20); setOffset(n); await refreshBatches(n); })}>上一页</button><button disabled={busy || batches.length < 20} onClick={() => act(async () => { setOffset(offset+20); await refreshBatches(offset+20); })}>下一页</button></section>
    </>}
    {tab === "reconcile" && <>{role !== "admin" && <><section className="card data-section"><h2>销售月度核对</h2><p>源销售金额核对值；退货、作废及导出完整性未确认。财务营业收入单独展示。</p><div className="table-scroll"><table><thead><tr><th>月份</th><th>订单</th><th>源销售金额（元）</th><th>数据截至</th><th>核对</th></tr></thead><tbody>{months.map(m => <tr key={m.month}><td>{m.month}{m.incomplete_month && "（未完月）"}</td><td>{m.orders}</td><td>{money(m.amount)}</td><td>{m.through}</td><td><button aria-haspopup="dialog" onClick={() => setOrderSelection({ source, month: m.month })}>查看订单</button></td></tr>)}</tbody></table></div>{!months.length && <p>暂无授权范围内的销售数据。请先完成销售导入或人员映射。</p>}
      {orderSelection && <OrdersDialog key={`${orderSelection.source}-${orderSelection.month}`} {...orderSelection} onClose={() => setOrderSelection(null)} />}</section>
      <section className="card data-section"><h2>财务月度核对</h2><p>本月和本年累计分开。资产对比列为年初余额，不能用作上月余额。</p>{!finance.length && <p>暂无已确认导入的财务报表。可以先查看待确认批次的预览。</p>}{pendingFinance.length > 0 && <section aria-label="待确认财务报表"><h3>最近待确认的财务报表</h3><p>以下文件尚未确认导入。更多批次可在“文件导入与历史”中查看。</p>{pendingFinance.map(b => <div key={b.id}><button aria-haspopup="dialog" onClick={() => setFinancePreviewId(b.id)}>预览 {b.original_filename}</button></div>)}</section>}{finance.map(f => <div key={f.month}><h3>{f.month} · {f.confirmed ? "期间已确认" : "待财务期间确认"}</h3><div className="table-scroll"><table><thead><tr><th>科目</th><th>本月/期末（元）</th><th>累计/年初（元）</th></tr></thead><tbody>{f.metrics.map(m => <tr key={`${m.type}-${m.code}`}><td>{m.name}</td><td>{money(m.type === "profit" ? m.period_value : m.end_value)}</td><td>{money(m.type === "profit" ? m.ytd_value : m.begin_value)}</td></tr>)}</tbody></table></div></div>)}</section></>}
      {["admin", "owner"].includes(role) && <section className="card data-section"><h2>财务期间确认</h2><p>请完成财务核对后确认期间。确认后禁止直接替换报表；解除确认和重新确认均保留记录。</p>{periods.map(p => <div key={p.id} className="data-toolbar"><span>{p.month.slice(0, 7)} · 利润表 {p.profit_batch_id ? "已导入" : "缺失"} · 资产负债表 {p.balance_batch_id ? "已导入" : "缺失"} · {p.is_closed ? "已确认" : "未确认"}</span><button disabled={busy || (!p.is_closed && !(p.profit_batch_id && p.balance_batch_id))} onClick={() => act(async () => { await api(`/finance/periods/${p.id}`, json({ is_closed: !p.is_closed }, "PATCH")); await refreshReports(); })}>{p.is_closed ? "解除期间确认" : "确认财务期间"}</button></div>)}{!periods.length && <p>尚无财务期间。</p>}</section>}
    </>}
    {financePreviewId && <FinancePreviewDialog key={financePreviewId} batchId={financePreviewId} onClose={() => setFinancePreviewId(null)} />}
  </>;
}
