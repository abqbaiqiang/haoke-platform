"use client";

import { api } from "../lib/api";
import { stamp } from "../lib/format";
import { taskSourceLabels as sourceLabels, taskTypeLabels as taskTypes } from "../lib/labels";
import type { CustomerRow as Customer, TaskPage, TaskRow as Task } from "../lib/types";
import type { Data, Route } from "./types";
import { Empty, Panel, Pager } from "./ui";

/** 待办屏幕：视图 Tab + 待办表格 + 分页。 */
export function TasksScreen({ taskData, taskOffset, onOffsetChange, taskView, onViewChange, go, record, completeTask, onDefer, run, busy }: {
  taskData: Data<TaskPage>;
  taskOffset: number;
  onOffsetChange: (n: number) => void;
  taskView: string;
  onViewChange: (key: string) => void;
  go: (r: Route) => void;
  record: (task?: Task, customer?: Customer) => void;
  completeTask: (t: Task) => void;
  onDefer: (t: Task) => void;
  run: (action: () => Promise<unknown>, message: string) => Promise<void>;
  busy: boolean;
}) {
  function status(t: Task) { return t.status === "done" ? "已完成" : new Date(t.due_at) < new Date() ? "已逾期" : "待处理"; }
  function taskTabs() {
    return (
      <div className="sales-tabs" aria-label="待办视图">
        {[["today", "今天"], ["overdue", "逾期"], ["week", "未来7天"], ["future", "全部未来"], ["done", "已完成"]].map(([key, label]) =>
          <button key={key} aria-pressed={taskView === key} onClick={() => onViewChange(key)}>{label} <span>{taskData.data?.counts[key] ?? ""}</span></button>)}
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
              <td className={status(t) === "已逾期" ? "sales-danger" : ""}>{stamp(taskView === "done" ? t.completed_at : t.due_at)}</td>
              <td>{t.customer_id ? <button className="sales-customer-link" onClick={() => go({ screen: "customers", customerId: t.customer_id! })}>{t.customer_name}</button> : "个人待办"}<small>{taskTypes[t.task_type] || "其他"}</small></td>
              <td className="sales-task-title">{t.title}</td>
              <td><span className={`sales-status ${status(t) === "已逾期" ? "late" : ""}`}>{status(t)}</span></td>
              <td><span className="sales-tag-chip">{sourceLabels[t.source_type] || "系统"}</span></td>
              <td><div className="sales-row-actions">{t.status === "todo" && <>
                {t.customer_id && <button onClick={() => record(t)}>记录跟进</button>}
                {t.customer_id && t.source_type === "followup" ? <button disabled={busy} onClick={() => completeTask(t)}>完成…</button> : <button disabled={busy} onClick={() => run(() => api(`/api/crm/tasks/${t.id}`, { method: "PATCH", json: { status: "done" } }), "待办已完成")}>完成</button>}
                <button onClick={() => onDefer(t)}>调整</button>
              </>}</div></td>
            </tr>)}</tbody>
        </table>
      </div>
    ) : <Empty>{taskView === "done" ? "还没有已完成待办。" : taskView === "today" ? "今天暂无待办。可以新建待办，或从客户开始记录跟进。" : "此视图暂无待办。"}</Empty>;
  }
  return (
    <Panel title="待办列表" action={taskTabs()}>
      <p className="sales-note">今天包含当日全部未完成待办；逾期按当前时间判断。未来 7 天从明天起算。</p>
      {taskData.loading ? <Empty>正在加载待办…</Empty> : tasksTable(taskData.data?.rows || [])}
      <Pager offset={taskOffset} total={taskData.data?.total || 0} onChange={onOffsetChange} />
    </Panel>
  );
}
