"use client";

import { api } from "../lib/api";
import { stamp } from "../lib/format";
import { taskSourceLabels as sourceLabels, taskTypeLabels as taskTypes } from "../lib/labels";
import type { CustomerRow as Customer, TaskPage, TaskRow as Task } from "../lib/types";
import type { Data, Route } from "./types";
import { Empty, Icon, Panel, Pager } from "./ui";

const VIEWS: [string, string][] = [["all", "全部"], ["today", "今天"], ["overdue", "逾期"], ["week", "未来7天"], ["done", "已完成"]];

/** 待办屏幕（docs/32 阶段④，老板拍板按参考图三栏看板）：统计卡 + 视图 Tab + 看板/列表；空列自动收纳。 */
export function TasksScreen({ taskData, taskOffset, onOffsetChange, taskView, onViewChange, boardToday, boardOverdue, boardWeek, go, record, completeTask, onDefer, run, busy }: {
  taskData: Data<TaskPage>;
  taskOffset: number;
  onOffsetChange: (n: number) => void;
  taskView: string;
  onViewChange: (key: string) => void;
  boardToday: Data<TaskPage>;
  boardOverdue: Data<TaskPage>;
  boardWeek: Data<TaskPage>;
  go: (r: Route) => void;
  record: (task?: Task, customer?: Customer) => void;
  completeTask: (t: Task) => void;
  onDefer: (t: Task) => void;
  run: (action: () => Promise<unknown>, message: string) => Promise<void>;
  busy: boolean;
}) {
  const c = boardToday.data?.counts;
  const doneToday = c?.done_today ?? 0, todayN = c?.today ?? 0, overdueN = c?.overdue ?? 0, weekN = c?.week ?? 0;
  const doneTotal = c?.done ?? 0;
  const dayTotal = doneToday + todayN;
  const pct = dayTotal ? Math.round(doneToday / dayTotal * 100) : 0;
  const tabCount = (key: string) => {
    if (key === "all") { const t = c; if (!t) return ""; return todayN + overdueN + (t.week ?? 0) + (t.future ?? 0); }
    if (key === "done") return doneTotal;
    return c?.[key as "today"] ?? "";
  };
  function complete(t: Task) {
    if (t.customer_id && t.source_type === "followup") completeTask(t);
    else run(() => api(`/api/crm/tasks/${t.id}`, { method: "PATCH", json: { status: "done" } }), "待办已完成");
  }
  function setToday(t: Task) {
    const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    run(() => api(`/api/crm/tasks/${t.id}`, { method: "PATCH", json: { due_at: `${day}T18:00:00+08:00` } }), "已调整为今天 18:00");
  }
  function card(t: Task, actions: "today" | "overdue" | "future") {
    const over = new Date(t.due_at) < new Date() && t.status === "todo";
    const dueToday = new Date(t.due_at).toDateString() === new Date().toDateString();
    return (
      <div key={t.id} className="tk-card">
        <div className="tk-card-head">
          <button aria-label={`完成待办：${t.title}`} disabled={busy} className="tk-check" onClick={() => complete(t)} />
          <strong className="tk-title">{t.title}</strong>
          <span className={`tk-due ${over ? "risk" : dueToday ? "today" : ""}`}>{stamp(t.due_at, false)}</span>
        </div>
        <p className="tk-meta">{t.customer_id
          ? <button className="sales-customer-link tk-cust" onClick={() => go({ screen: "customers", customerId: t.customer_id! })}>{t.customer_name || "客户"}</button>
          : <span className="sales-dim tk-cust">个人待办</span>}
          <span className="tk-note">{taskTypes[t.task_type] || "其他"} · {sourceLabels[t.source_type] || "系统"}{over ? " · 已逾期" : ""}</span></p>
        <div className="tk-actions">
          {t.customer_id && <button disabled={busy} onClick={() => record(t)}>{actions === "future" ? "记录跟进" : "记录跟进"}</button>}
          {actions === "future" && <button disabled={busy} onClick={() => setToday(t)}>设为今天</button>}
          <button disabled={busy} onClick={() => onDefer(t)}>调整</button>
        </div>
      </div>
    );
  }
  function tasksTable(rows: Task[]) {
    return rows.length ? (
      <div className="sales-table-scroll">
        <table className="sales-table">
          <thead><tr><th>{taskView === "done" ? "完成时间" : "截止时间"}</th><th>关联客户</th><th>待办内容</th><th>状态</th><th>来源</th><th>操作</th></tr></thead>
          <tbody>{rows.map(t =>
            <tr key={t.id}>
              <td className={t.status === "todo" && new Date(t.due_at) < new Date() ? "sales-danger" : ""}>{stamp(taskView === "done" ? t.completed_at : t.due_at)}</td>
              <td>{t.customer_id ? <button className="sales-customer-link" onClick={() => go({ screen: "customers", customerId: t.customer_id! })}>{t.customer_name}</button> : "个人待办"}<small>{taskTypes[t.task_type] || "其他"}</small></td>
              <td className="sales-task-title">{t.title}</td>
              <td><span className={`sales-status ${t.status === "todo" && new Date(t.due_at) < new Date() ? "late" : ""}`}>{t.status === "done" ? "已完成" : new Date(t.due_at) < new Date() ? "已逾期" : "待处理"}</span></td>
              <td><span className="sales-tag-chip">{sourceLabels[t.source_type] || "系统"}</span></td>
              <td><div className="sales-row-actions">{t.status === "todo" && <>
                {t.customer_id && <button onClick={() => record(t)}>记录跟进</button>}
                <button disabled={busy} onClick={() => complete(t)}>完成</button>
                <button onClick={() => onDefer(t)}>调整</button>
              </>}</div></td>
            </tr>)}</tbody>
        </table>
      </div>
    ) : <Empty>{taskView === "done" ? "还没有已完成待办。" : taskView === "today" ? "今天暂无待办。可以新建待办，或从客户开始记录跟进。" : "此视图暂无待办。"}</Empty>;
  }
  const columns: { key: string; title: string; tone: string; count: number; data: Data<TaskPage>; mode: "today" | "overdue" | "future" }[] = [
    { key: "today", title: `今天必须完成（${todayN}）`, tone: "today", count: todayN, data: boardToday, mode: "today" },
    { key: "overdue", title: `已逾期（${overdueN}）`, tone: "overdue", count: overdueN, data: boardOverdue, mode: "overdue" },
    { key: "week", title: `未来计划（${weekN}）`, tone: "future", count: weekN, data: boardWeek, mode: "future" },
  ];
  // 空列收纳 + 列宽按任务数自动分配（docs/32 阶段④迭代，老板反馈两栏等宽不协调）。
  // 对照参考图：三栏永远等宽渲染；空栏显示柔和的“已处理完”状态（逾期栏保留浅红底），不再挤压其他栏。
  const visibleColumns = columns;
  return (
    <div className="tk-root">
      <div className="wb-kpis tk-stats">
        <div className="wb-kpi"><span className="wb-kpi-ico blue"><Icon name="clock" /></span><div className="wb-kpi-body"><span>今日应完成</span><strong>{todayN}</strong><small>个任务</small></div></div>
        <div className="wb-kpi"><span className="wb-kpi-ico green"><Icon name="checkcircle" /></span><div className="wb-kpi-body"><span>已完成</span><strong>{doneToday}</strong><small>{dayTotal ? `完成率 ${pct}%` : "今日尚无任务"}</small>{dayTotal > 0 && <div className="sales-progress tk-rate" role="img" aria-label={`今日完成率 ${pct}%`}><i style={{ width: `${pct}%` }} /></div>}</div></div>
        <div className="wb-kpi"><span className="wb-kpi-ico red"><Icon name="alert" /></span><div className="wb-kpi-body"><span>已逾期</span><strong className={overdueN ? "sales-danger" : ""}>{overdueN}</strong><small>个任务</small></div></div>
        <div className="wb-kpi"><span className="wb-kpi-ico blue"><Icon name="performance" /></span><div className="wb-kpi-body"><span>本周新增</span><strong>{weekN}</strong><small>个任务</small></div></div>
      </div>
      <div className="sales-tabs tk-tabs" aria-label="待办视图">
        {VIEWS.map(([key, label]) => <button key={key} aria-pressed={taskView === key} onClick={() => onViewChange(key)}>{label}{tabCount(key) !== "" && `（${tabCount(key)}）`}</button>)}
      </div>
      {taskView === "all" ? (
        boardToday.loading || boardOverdue.loading || boardWeek.loading ? <Panel title="待办看板"><Empty>正在加载待办…</Empty></Panel> :
          <div className="tk-board">
            {visibleColumns.map(col => <section key={col.key} className={`sales-panel tk-col ${col.tone === "overdue" ? "risk-col" : ""}`}>
              <div className="wb-panel-head"><h2 className={col.tone === "overdue" ? "sales-danger" : ""}><span className={`tk-col-ico ${col.tone}`}><Icon name={col.tone === "today" ? "clock" : col.tone === "overdue" ? "alert" : "calendar"} /></span>{col.title}</h2></div>
              {col.data.data?.rows.length ? <div className="tk-cards">{col.data.data.rows.map(t => card(t, col.mode))}</div>
                : <Empty>{col.key === "today" ? "今天暂无待办，可点右上角新建。" : col.key === "overdue" ? "没有逾期任务，节奏很好。" : "未来 7 天暂无安排。"}</Empty>}
            </section>)}
          </div>
      ) : (
        <Panel title={`${VIEWS.find(v => v[0] === taskView)?.[1] || "待办"}列表`} action={taskView !== "all" ? <button onClick={() => onViewChange("all")}>← 返回看板</button> : undefined}>
          <p className="sales-note">今天包含当日全部未完成待办；逾期按当前时间判断。未来 7 天从明天起算。</p>
          {taskData.loading ? <Empty>正在加载待办…</Empty> : tasksTable(taskData.data?.rows || [])}
          <Pager offset={taskOffset} total={taskData.data?.total || 0} onChange={onOffsetChange} />
        </Panel>
      )}
    </div>
  );
}
