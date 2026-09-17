"use client";

import { stamp } from "../lib/format";
import { opportunityStageLabels as oppStageLabels } from "../lib/labels";
import type { AttentionPage, CustomerRow as Customer, FollowupRow as Follow, Page, TaskPage, TaskRow as Task } from "../lib/types";
import type { Data, OppRow, Route, Work } from "./types";
import { RecentTable } from "./recent-table";
import { QuickFollow } from "./quick-follow";
import { Empty, Panel, money } from "./ui";

/** 工作台屏幕：今日概览 / 重点提醒 / 今天最该做的事 / 快速跟进 / 执行进度 / 最近跟进 / 客户动态 / 本月商机。 */
export function WorkbenchScreen({ work, focusToday, focusOverdue, attention, oppRecent, recent, go, record, busy, onQuickSaved, onShowRecent }: {
  work: Data<Work>;
  focusToday: Data<TaskPage>;
  focusOverdue: Data<TaskPage>;
  attention: Data<AttentionPage>;
  oppRecent: Data<{ rows: OppRow[]; total: number }>;
  recent: Data<Page<Follow>>;
  go: (r: Route) => void;
  record: (task?: Task, customer?: Customer) => void;
  busy: boolean;
  onQuickSaved: (message: string) => void;
  onShowRecent: () => void;
}) {
  const c = focusToday.data?.counts;
  const done = c?.done_today ?? 0, total = done + (c?.today ?? 0), pct = total ? Math.round(done / total * 100) : 0;
  const merged = new Map<string, Task>();
  [...(focusOverdue.data?.rows || []), ...(focusToday.data?.rows || [])].forEach(t => merged.set(t.id, t));
  const pri = (t: Task) => new Date(t.due_at) < new Date() ? "high" : t.priority === "urgent" || t.priority === "high" ? "high" : t.priority === "low" ? "low" : "med";
  const rank = { "high": 0, "med": 1, "low": 2 } as const;
  const focus = [...merged.values()].sort((a, b) => pri(a) === pri(b) ? (a.due_at < b.due_at ? -1 : 1) : rank[pri(a)] - rank[pri(b)]);
  const riskN: Record<string, number> = {};
  (attention.data?.rows || []).forEach(r => riskN[r.kind] = (riskN[r.kind] || 0) + 1);
  const riskItems = [["去年同月成交、本月尚未复购", "去年同期成交、本月尚未成交"], ["疑似流失", "疑似流失的重点客户"], ["跟进超期", "超过跟进阈值未跟进的重点客户"]]
    .map(([key, label]) => ({ key, label, n: riskN[key] || 0 })).filter(x => x.n > 0);
  const metricOf = (code: string) => work.data?.metrics.find(m => m.code === code);
  return (
    <div className="wb-root">
      <div className="wb-top">
        <section className="sales-panel wb-overview"><h2>今日待办概览</h2><div className="wb-tiles">{[["今日待办", c ? `${c.today}` : "—", "blue"], ["已逾期", c ? `${c.overdue}` : "—", "red"], ["今日已完成", c ? `${c.done_today}` : "—", "green"], ["本周待跟进", c ? `${c.week}` : "—", "gray"]].map(([label, v, tone]) => <div key={label} className="wb-tile"><i className={`wb-dot ${tone}`} aria-hidden /><div><span>{label}</span><strong>{v}<small> 项</small></strong></div></div>)}</div></section>
        <section className="sales-panel wb-risk"><div className="wb-panel-head"><h2>重点提醒</h2><button onClick={() => go({ screen: "customers" })}>查看全部 →</button></div>
          {riskItems.length ? <ul className="wb-risk-list">{riskItems.map(r => <li key={r.key}><button onClick={() => go({ screen: "customers" })}><span>{r.label}</span><strong>{r.n} 家</strong></button></li>)}</ul> : <Empty>{attention.loading ? "正在检查客户风险…" : attention.data?.warnings.length ? "销售口径未核实，暂不判定客户流失风险。" : "暂无风险提醒，客户跟进节奏良好。"}</Empty>}
        </section>
      </div>
      <div className="wb-core">
        <section className="sales-panel wb-focus"><div className="wb-panel-head"><h2>今天最该做的事（{focus.length}）</h2><button onClick={() => go({ screen: "tasks", taskView: "today" })}>查看全部 →</button></div>
          {focus.length ? <div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>优先级</th><th>客户名称</th><th>任务内容</th><th>截止时间</th><th>客户等级</th><th>操作</th></tr></thead><tbody>{focus.map(t => { const p = pri(t), over = p === "high" && new Date(t.due_at) < new Date(), sameDay = new Date(t.due_at).toDateString() === new Date().toDateString(); return <tr key={t.id}><td><span className={`wb-pri ${p}`}>{p === "high" ? "高" : p === "med" ? "中" : "低"}</span></td><td><strong>{t.customer_name || "个人待办"}</strong></td><td className="sales-task-title">{t.title}</td><td><span className={over ? "sales-danger" : ""}>{over ? "已逾期 " : sameDay ? "今天 " : ""}{stamp(t.due_at)}</span></td><td>{t.customer_level ? <span className="sales-level">{t.customer_level}</span> : <span className="sales-dim">—</span>}</td><td><div className="sales-row-actions">{t.customer_id ? <><button className="sales-mini-primary" disabled={busy} onClick={() => record(t)}>记录跟进</button><button onClick={() => go({ screen: "customers", customerId: t.customer_id! })}>去处理</button></> : <button onClick={() => go({ screen: "tasks", taskView: "today" })}>去处理</button>}</div></td></tr>; })}</tbody></table></div> : <Empty>{focusToday.loading || focusOverdue.loading ? "正在加载今天的任务…" : "今天暂无待办。从右侧快速记录一次跟进，安排第一个下一步。"}</Empty>}
        </section>
        <div className="wb-side">
          <QuickFollow saved={onQuickSaved} />
          <section className="sales-panel wb-progress"><h2>今日执行进度</h2>{total ? <div className="wb-progress-body"><div className="wb-ring" style={{ background: `conic-gradient(#0b62d8 ${pct * 3.6}deg,#e6edf6 0deg)` }} role="img" aria-label={`今日执行进度 ${pct}%`}><span>{pct}%</span></div><div className="wb-progress-text"><strong>已完成 {done} / {total}</strong><span>还有 {total - done} 项待完成</span><div className="sales-progress"><i style={{ width: `${pct}%` }} /></div></div></div> : <Empty>{focusToday.loading ? "正在统计…" : "今天还没有安排待办。"}</Empty>}</section>
        </div>
      </div>
      <div className="wb-bottom">
        <Panel title="最近跟进" action={<button onClick={onShowRecent}>查看更多 →</button>}><RecentTable recent={recent} go={go} /></Panel>
        <Panel title="本周客户动态" action={<button onClick={() => go({ screen: "performance" })}>查看更多 →</button>}><div className="wb-dynamics">{[["新增客户", "CRM_NEW_CUSTOMERS"], ["已报价客户", "CRM_QUOTED_CUSTOMERS"], ["成交客户", "CRM_DEAL_CUSTOMERS"], ["7天未跟进", "CRM_STALE_CUSTOMERS"]].map(([label, code]) => { const m = metricOf(code); return <div key={code} className="wb-dyn"><span>{label}</span><strong>{m?.value != null ? m.value : "—"}<small> 家</small></strong></div>; })}</div><p className="sales-note">按本月累计口径统计；成交客户仅统计已核实销售单。</p></Panel>
      </div>
      <Panel title="本月商机" action={<button onClick={() => go({ screen: "customers" })}>查看客户 →</button>}>
        {oppRecent.loading ? <Empty>正在加载商机…</Empty> : oppRecent.data?.rows.length ? <div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>客户名称</th><th>商机</th><th>推荐产品</th><th>阶段</th><th>预计金额</th><th>预计成交</th></tr></thead><tbody>{oppRecent.data.rows.map(o => <tr key={o.id}><td><button className="sales-customer-link" onClick={() => go({ screen: "customers", customerId: o.customer_id })}>{o.customer_name}</button></td><td>{o.opportunity_name}</td><td>{o.products.length ? o.products.map(p => <span key={p.id} className="sales-tag-chip">{p.name}</span>) : <span className="sales-dim">—</span>}</td><td><span className={`sales-status ${o.stage === "won" ? "won" : ""}`}>{oppStageLabels[o.stage] || o.stage}</span></td><td>{money(o.estimated_amount)}</td><td>{stamp(o.expected_close_date, false)}</td></tr>)}</tbody></table></div> : <Empty>{oppRecent.data ? "最近 30 天暂无新商机。在客户详情里新增商机后会显示在这里。" : "正在加载商机…"}</Empty>}
      </Panel>
    </div>
  );
}
