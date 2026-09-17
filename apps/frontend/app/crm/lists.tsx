"use client";

import type { Dispatch, SetStateAction } from "react";
import { dateTime } from "../lib/format";
import { opportunityStageOptions as stages, contactResultOptions as results, interactionMethodOptions as methods } from "../lib/labels";
import type { Followup as Follow, Opportunity, Role, Task } from "../lib/types";
import { api } from "./api";
import { Editor } from "./editor";
import { money, text } from "./shared";

type EditState = { kind: string; id?: string } | null;

/** 待办列表：客户待办 Tab 与“我的待办”Tab 共用。 */
export function TaskList({ data, name, selected, processWrite, role, busy, act, open, edit, setEdit, save }: {
  data: Task[];
  name: (id: string | null) => string;
  selected: string | null;
  processWrite: boolean;
  role: Role;
  busy: boolean;
  act: (run: () => Promise<unknown>, message?: string) => Promise<void>;
  open: (id: string, followup?: boolean) => void;
  edit: EditState;
  setEdit: Dispatch<SetStateAction<EditState>>;
  save: (path: string, method: string, data: unknown) => Promise<void>;
}) {
  return (
    <div className="crm-list">{data.length === 0 && <p className="muted">暂无待办</p>}{data.map(t => <article key={t.id} className="crm-item"><strong>{t.title}</strong><p>{dateTime(t.due_at)} · {name(t.assignee_user_id)} · {t.status === "done" ? "已完成" : t.status === "cancelled" ? "已取消" : new Date(t.due_at).getTime() < Date.now() ? "已逾期" : "待处理"} · {t.source_type === "followup" ? "跟进生成" : t.source_type === "manager" ? "管理者分配" : "手动创建"}</p><div className="crm-actions">{t.customer_id && !selected && <button onClick={() => open(t.customer_id!)}>查看客户</button>}{t.customer_id && processWrite && <button onClick={() => open(t.customer_id!, true)}>快速记录跟进</button>}{t.status === "todo" && ["owner", "manager", "sales"].includes(role) && <><button disabled={busy} onClick={() => act(() => api(`/tasks/${t.id}`, "PATCH", { status: "done" }), "待办已完成")}>完成待办</button><button onClick={() => setEdit({ kind: "task", id: t.id })}>延期／取消</button></>}</div>{edit?.kind === "task" && edit.id === t.id && <Editor title="调整待办" fields={[{ key: "due_at", label: "延期至（北京时间）", type: "datetime-local" }, { key: "status", label: "待办状态", options: [["todo", "待处理"], ["cancelled", "取消"]] }, { key: "completion_result", label: "简短结果", maxLength: 100 }]} initial={{}} submit="保存待办" cancel={() => setEdit(null)} save={async d => { if (d.status === "cancelled" || !d.due_at) delete d.due_at; await save(`/tasks/${t.id}`, "PATCH", d); }} />}</article>)}</div>
  );
}

/** 商机列表：商机 Tab 与客户详情商机 Tab 共用。 */
export function OppList({ data, name, selected, processWrite, open, setEdit }: {
  data: Opportunity[];
  name: (id: string | null) => string;
  selected: string | null;
  processWrite: boolean;
  open: (id: string, followup?: boolean) => void;
  setEdit: Dispatch<SetStateAction<EditState>>;
}) {
  return (
    <div className="crm-list">{data.length === 0 && <p className="muted">暂无商机</p>}{data.map(o => <article className="crm-item" key={o.id}><strong>{o.opportunity_name}</strong><p>{text(stages, o.stage)} · {name(o.owner_user_id)} · 预计 {money(o.estimated_amount)} 元 · 加权 {money(o.weighted_amount)} 元</p>{o.products && o.products.length > 0 && <p>推荐产品：{o.products.map(p => p.name).join("、")}</p>}{o.closed_at && <p>关闭时间：{dateTime(o.closed_at)}</p>}{o.lost_reason && <p>流失原因：{o.lost_reason}</p>}{!selected ? <button onClick={() => open(o.customer_id)}>查看客户与商机</button> : processWrite && <button onClick={() => setEdit({ kind: "opportunity", id: o.id })}>更新商机</button>}</article>)}</div>
  );
}

/** 跟进列表：跟进 Tab 与客户详情跟进 Tab 共用。 */
export function FollowList({ data, name, selected, processWrite, role, edit, setEdit, save, open }: {
  data: Follow[];
  name: (id: string | null) => string;
  selected: string | null;
  processWrite: boolean;
  role: Role;
  edit: EditState;
  setEdit: Dispatch<SetStateAction<EditState>>;
  save: (path: string, method: string, data: unknown) => Promise<void>;
  open: (id: string, followup?: boolean) => void;
}) {
  return (
    <div className="crm-list">{data.length === 0 && <p className="muted">暂无跟进</p>}{data.map(f => <article className="crm-item" key={f.id}><strong>{text(methods, f.interaction_method)} · {text(results, f.contact_result)}</strong><p>{dateTime(f.occurred_at)} · {name(f.owner_user_id)}</p><p>{f.summary || "未填写摘要"}{f.material_sent ? " · 已发资料" : ""}{f.quotation_sent ? " · 已报价" : ""}</p>{f.next_action && <p>下一步：{f.next_action} · {dateTime(f.next_followup_at)}</p>}{!f.is_active && <p className="data-warning">已作废，历史内容保留</p>}{!selected ? <button onClick={() => open(f.customer_id)}>查看客户与跟进</button> : processWrite && f.is_active && <button onClick={() => setEdit({ kind: "followup", id: f.id })}>修改跟进</button>}{selected && f.is_active && ["owner", "admin"].includes(role) && <button onClick={() => setEdit({ kind: "void", id: f.id })}>作废跟进</button>}{edit?.kind === "void" && edit.id === f.id && <Editor title="作废跟进" fields={[{ key: "reason", label: "作废原因", required: true, maxLength: 500 }]} submit="确认作废" cancel={() => setEdit(null)} save={d => save(`/customers/${selected}/followups/${f.id}/void`, "POST", d)} />}</article>)}</div>
  );
}
