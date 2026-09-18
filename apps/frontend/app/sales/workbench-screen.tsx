"use client";

import { useState } from "react";
import { api } from "../lib/api";
import { stamp } from "../lib/format";
import { opportunityStageLabels as oppStageLabels } from "../lib/labels";
import type { AttentionPage, CustomerRow, FollowupRow as Follow, Page, TaskPage, TaskRow as Task } from "../lib/types";
import type { BoardRow, Data, ProjectBoard, Route, Work, WorkbenchSummary } from "./types";
import { RecentTable } from "./recent-table";
import { QuickFollow } from "./quick-follow";
import { Empty, Modal, Pager, money } from "./ui";

/** 工作台屏幕（docs/32 阶段②）：4 指标卡 / 今日作战区 / 重点提醒 / 快速记录 / 最近跟进（动态位置）/ 项目面板（全员）。 */
export function WorkbenchScreen({ work, focusToday, focusOverdue, attention, summary, board, recent, go, record, completeTask, onDefer, run, busy, onQuickSaved, onShowRecent }: {
  work: Data<Work>;
  focusToday: Data<TaskPage>;
  focusOverdue: Data<TaskPage>;
  attention: Data<AttentionPage>;
  summary: Data<WorkbenchSummary>;
  board: Data<ProjectBoard>;
  recent: Data<Page<Follow>>;
  go: (r: Route) => void;
  record: (task?: Task, customer?: CustomerRow) => void;
  completeTask: (t: Task) => void;
  onDefer: (t: Task) => void;
  run: (action: () => Promise<unknown>, message: string) => Promise<void>;
  busy: boolean;
  onQuickSaved: (message: string) => void;
  onShowRecent: () => void;
}) {
  const [showBoard, setShowBoard] = useState(false);
  const [boardOffset, setBoardOffset] = useState(0);
  const [boardPage, setBoardPage] = useState<ProjectBoard | null>(null);
  const counts = focusToday.data?.counts;
  const done = counts?.done_today ?? 0;
  const todayN = counts?.today ?? 0;
  const overdueN = counts?.overdue ?? 0;
  // 今日待办较多（今天+逾期 ≥6）时最近跟进下移，少则上移（需求三.5）。
  const busyDay = todayN + overdueN >= 6;
  const merged = new Map<string, Task>();
  [...(focusOverdue.data?.rows || []), ...(focusToday.data?.rows || [])].forEach(t => merged.set(t.id, t));
  const battle = [...merged.values()].sort((a, b) => (a.due_at < b.due_at ? -1 : 1));
  const riskN: Record<string, number> = {};
  (attention.data?.rows || []).forEach(r => riskN[r.kind] = (riskN[r.kind] || 0) + 1);
  const risks: { label: string; n: number; unit: string; route: Route; tone: "high" | "med" }[] = [
    { label: "沉睡客户", n: riskN["沉睡"] || 0, unit: "家", route: { screen: "customers", status: "dormant" }, tone: "high" },
    { label: "疑似流失客户", n: riskN["疑似流失"] || 0, unit: "家", route: { screen: "customers", status: "at_risk" }, tone: "high" },
  ];
  if (overdueN > 0) risks.push({ label: "逾期任务", n: overdueN, unit: "项", route: { screen: "tasks", taskView: "overdue" }, tone: "med" });
  const metricOf = (code: string) => work.data?.metrics.find(m => m.code === code);
  const s = summary.data;
  const page: ProjectBoard | null = boardPage ?? (board.data ? { rows: board.data.rows, total: board.data.total } : null);
  const rows = page?.rows || [];
  async function openBoard(offset: number) {
    setBoardOffset(offset);
    setBoardPage(await api<ProjectBoard>(`/api/sales/opportunities/board?offset=${offset}&limit=20`));
  }
  const kpis = [
    { key: "target", label: "本月目标", href: () => go({ screen: "performance" }),
      main: s?.target_amount != null ? money(s.target_amount) : "未设定",
      body: s && s.actual_amount != null ? <><div className="sales-progress wb-kpi-bar"><i style={{ width: `${Math.min(100, Number(s.completion ?? 0))}%` }} /></div><small>已完成 {money(s.actual_amount)}{s.completion != null ? ` · 完成率 ${s.completion}%` : ""}</small></> : <small>{summary.loading ? "正在加载…" : "在「我的业绩」设定月目标"}</small> },
    { key: "today", label: "今日待办", href: () => go({ screen: "tasks", taskView: "today" }), main: `${todayN}`,
      body: <small>{overdueN > 0 ? <span className="sales-danger">逾期 {overdueN} 项</span> : "今日无逾期"} · 已完成 {done} 项</small> },
    { key: "projects", label: "待跟进项目", href: () => { setBoardPage(null); setShowBoard(true); }, main: s ? `${s.open_projects}` : "—",
      body: <small>全员开放项目 · 点击查看</small> },
    { key: "key", label: "重点客户", href: () => go({ screen: "customers", status: "key" }), main: s ? (s.key_customers != null ? `${s.key_customers}` : "—") : "—",
      body: <small>RFM 重要层 · 点击查看</small> },
  ];
  return (
    <div className="wb-root">
      <div className="wb-kpis">{kpis.map(k => <button key={k.key} className="wb-kpi" onClick={k.href}><span>{k.label}</span><strong>{k.main}</strong>{k.body}</button>)}</div>
      <div className="wb-core">
        <div className="wb-col-main">
        <section className="sales-panel wb-focus">
          <div className="wb-panel-head"><h2>今日作战区（{battle.length}）</h2><button onClick={() => go({ screen: "tasks", taskView: "today" })}>全部任务 →</button></div>
          {battle.length ? <div className="sales-table-scroll"><table className="sales-table">
            <thead><tr><th>客户名称</th><th>事项</th><th>当前阶段</th><th>截止时间</th><th>操作</th></tr></thead>
            <tbody>{battle.map(t => {
              const over = new Date(t.due_at) < new Date();
              const st = t.opp_stage && oppStageLabels[t.opp_stage];
              return <tr key={t.id}>
                <td><strong>{t.customer_name || "个人待办"}</strong>{t.customer_level && <span className="sales-level">{t.customer_level}</span>}</td>
                <td className="sales-task-title">{t.title}</td>
                <td>{st ? <span className="sales-status">{st}</span> : <span className="sales-dim">—</span>}</td>
                <td><span className={over ? "sales-danger" : ""}>{over ? "已逾期 " : new Date(t.due_at).toDateString() === new Date().toDateString() ? "今天 " : ""}{stamp(t.due_at)}</span></td>
                <td><div className="sales-row-actions">
                  {t.customer_id && <button className="sales-mini-primary" disabled={busy} onClick={() => record(t)}>去跟进</button>}
                  {t.customer_id && t.source_type === "followup"
                    ? <button disabled={busy} onClick={() => completeTask(t)}>完成</button>
                    : <button disabled={busy} onClick={() => run(() => api(`/api/crm/tasks/${t.id}`, { method: "PATCH", json: { status: "done" } }), "待办已完成")}>完成</button>}
                  <button onClick={() => onDefer(t)}>调整</button>
                </div></td>
              </tr>;
            })}</tbody></table></div>
            : <Empty>{focusToday.loading || focusOverdue.loading ? "正在加载今天的任务…" : "今天暂无待办。从右侧快速记录一次跟进，安排第一个下一步。"}</Empty>}
        </section>
        {!busyDay && <section className="sales-panel wb-recent">
          <div className="wb-panel-head"><h2>最近跟进</h2><button onClick={onShowRecent}>查看更多 →</button></div>
          <RecentTable recent={recent} go={go} />
        </section>}
        <section className="sales-panel wb-dynamics-panel">
          <div className="wb-panel-head"><h2>本周客户动态</h2><button onClick={() => go({ screen: "performance" })}>查看更多 →</button></div>
          <div className="wb-dynamics">{[["新增客户", "CRM_NEW_CUSTOMERS"], ["已报价客户", "CRM_QUOTED_CUSTOMERS"], ["成交客户", "CRM_DEAL_CUSTOMERS"], ["7天未跟进", "CRM_STALE_CUSTOMERS"]].map(([label, code]) => {
            const m = metricOf(code);
            return <div key={code} className="wb-dyn"><span>{label}</span><strong>{m?.value != null ? m.value : "—"}<small> 家</small></strong></div>;
          })}</div>
          <p className="sales-note">按本月累计口径统计；成交客户仅统计已核实销售单。</p>
        </section>
        </div>
        <div className="wb-side">
          <section className="sales-panel wb-risk">
            <div className="wb-panel-head"><h2>重点提醒</h2><button onClick={() => go({ screen: "customers" })}>查看全部 →</button></div>
            {risks.length ? <ul className="wb-risk-list">{risks.map(r => <li key={r.label}><button onClick={() => go(r.route)}><span className={`wb-risk-tag ${r.tone}`}>{r.tone === "high" ? "高" : "中"}</span><span className="wb-risk-label">{r.label}</span><strong>{r.n} {r.unit}</strong></button></li>)}</ul>
              : <Empty>{attention.loading ? "正在检查客户风险…" : attention.data?.warnings.length ? "销售口径未核实，暂不判定客户流失风险。" : "暂无风险提醒，客户跟进节奏良好。"}</Empty>}
          </section>
          <QuickFollow saved={onQuickSaved} />
        </div>
      </div>
      {busyDay && <section className="sales-panel wb-recent">
        <div className="wb-panel-head"><h2>最近跟进</h2><button onClick={onShowRecent}>查看更多 →</button></div>
        <RecentTable recent={recent} go={go} />
      </section>}
      <section className="sales-panel wb-board">
        <div className="wb-panel-head"><h2>项目面板（全员开放 {board.data?.total ?? "—"}）</h2><button onClick={() => { setBoardPage(null); setShowBoard(true); }}>查看全部 →</button></div>
        {board.loading ? <Empty>正在加载项目…</Empty> : rows.length ? <div className="sales-table-scroll"><table className="sales-table">
          <thead><tr><th>负责人</th><th>项目</th><th>客户</th><th>阶段</th><th>产品提报</th><th>预计金额</th><th>预计成交</th><th>下一步动作</th></tr></thead>
          <tbody>{rows.slice(0, 8).map((o: BoardRow) => <tr key={o.id}>
            <td><span className="sales-tag-chip">{o.owner_name}</span></td>
            <td><strong>{o.opportunity_name}</strong>{o.project_name && o.project_name !== o.opportunity_name && <small>{o.project_name}</small>}</td>
            <td><button className="sales-customer-link" onClick={() => go({ screen: "customers", customerId: o.customer_id })}>{o.customer_name}</button></td>
            <td><span className={`sales-status ${o.stage === "won" ? "won" : ""}`}>{oppStageLabels[o.stage] || o.stage}</span></td>
            <td>{o.products.length ? o.products.map(p => <span key={p.id} className="sales-tag-chip">{p.name}</span>) : <span className="sales-dim">—</span>}</td>
            <td>{money(o.estimated_amount)}</td>
            <td>{stamp(o.expected_close_date, false)}</td>
            <td className="sales-task-title">{o.next_promotion || <span className="sales-dim">未安排</span>}</td>
          </tr>)}</tbody></table></div>
          : <Empty>{board.data ? "暂无开放项目。在客户详情里为任意客户新增项目后，全公司的项目都会显示在这里。" : "正在加载项目…"}</Empty>}
      </section>
      {showBoard && <Modal title="全员开放项目" close={() => setShowBoard(false)}>
        {rows.length ? <>
          <div className="sales-table-scroll"><table className="sales-table">
            <thead><tr><th>负责人</th><th>项目</th><th>客户</th><th>阶段</th><th>产品提报</th><th>预计金额</th><th>预计成交</th></tr></thead>
            <tbody>{rows.map((o: BoardRow) => <tr key={o.id}>
              <td><span className="sales-tag-chip">{o.owner_name}</span></td>
              <td><strong>{o.opportunity_name}</strong></td>
              <td>{o.customer_name}</td>
              <td><span className={`sales-status ${o.stage === "won" ? "won" : ""}`}>{oppStageLabels[o.stage] || o.stage}</span></td>
              <td>{o.products.length ? o.products.map(p => <span key={p.id} className="sales-tag-chip">{p.name}</span>) : "—"}</td>
              <td>{money(o.estimated_amount)}</td>
              <td>{stamp(o.expected_close_date, false)}</td>
            </tr>)}</tbody></table></div>
          <Pager offset={boardOffset} total={page?.total ?? 0} size={20} onChange={openBoard} />
        </> : <Empty>{board.loading ? "正在加载…" : "暂无开放项目。"}</Empty>}
      </Modal>}
    </div>
  );
}
