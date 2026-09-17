"use client";

import { FormEvent, useRef, useState } from "react";
import { api, useData } from "../lib/api";
import { taskTypeLabels as taskTypes } from "../lib/labels";
import type { Contact, CustomerRow as Customer, Page, TaskRow as Task, User } from "../lib/types";
import type { DialogState } from "./types";
import { Modal } from "./ui";

export function SalesDialog({ state, user, close, saved, switchToFollow }: { state: DialogState; user: User; close: () => void; saved: (s: string) => void; switchToFollow: (t: Task) => void }) {
  const [cid, setCid] = useState(state.customer?.id || state.task?.customer_id || ""), [q, setQ] = useState(""), [search, setSearch] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [complete, setComplete] = useState(state.kind === "follow" && !!state.task), [nextPlan, setNextPlan] = useState<"need" | "skip">("need");
  const timer = useRef(0);
  const choices = useData<Page<Customer>>(!state.customer && !state.task && ["follow", "task"].includes(state.kind) ? `/api/sales/customers?q=${encodeURIComponent(search)}&limit=100` : null);
  const detail = useData<{ customer: { customer_name: string }; contacts: Contact[] }>(cid ? `/api/crm/customers/${cid}` : null);
  const title = { follow: "记录跟进", task: "新建待办", defer: "调整待办", complete: "完成待办" }[state.kind];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const str = (k: string) => String(f.get(k) || "").trim(); const date = (k: string) => str(k) ? str(k) + ":00+08:00" : null; setBusy(true); setError(""); try {
      if (state.kind === "follow") { if (!cid) throw new Error("请先选择客户"); if (!!str("next_action") !== !!str("next_followup_at")) throw new Error("下一步动作与时间需同时填写"); if (nextPlan === "skip" && ["normal", "good"].includes(str("result"))) throw new Error("已沟通或沟通顺利的客户请安排下一步；若暂不跟进，请把沟通结果改为“暂无需求 / 等待反馈 / 未接通”等"); await api(`/api/sales/customers/${cid}/followup`, { method: "POST", json: { followup: { interaction_method: str("method"), contact_result: str("result"), is_effective: str("effective") !== "no", contact_id: str("contact") || null, summary: str("summary"), next_action: str("next_action") || null, next_followup_at: date("next_followup_at"), quotation_sent: f.has("quoted") }, complete_task_id: complete ? state.task?.id : null } }); saved(complete ? "跟进已保存，本次待办已完成；填写的下一步已生成待办" : "跟进已保存；填写的下一步已生成待办"); }
      if (state.kind === "task") { await api("/api/crm/tasks", { method: "POST", json: { title: str("title"), customer_id: cid || null, assignee_user_id: user.id, due_at: date("due"), task_type: str("type") } }); saved("待办已创建"); }
      if (state.kind === "defer") { await api(`/api/crm/tasks/${state.task!.id}`, { method: "PATCH", json: str("status") === "cancelled" ? { status: "cancelled" } : { due_at: date("due") } }); saved("待办已调整，历史已保留"); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={title} close={close} locked={busy}>
    {state.kind === "complete" ? <><p>待办「{state.task?.title}」即将完成。建议把和客户的实际沟通记录下来，下次跟进有依据。</p>
      <div className="sales-form-footer">
        <button type="button" disabled={busy} onClick={() => switchToFollow(state.task!)}>记录跟进并完成</button>
        <button className="sales-primary" disabled={busy} onClick={async () => { setBusy(true); try { await api(`/api/crm/tasks/${state.task!.id}`, { method: "PATCH", json: { status: "done" } }); saved("待办已完成，未记录跟进"); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{busy ? "正在保存…" : "直接完成"}</button>
      </div></> : <form onSubmit={submit} className="sales-form" aria-label={title}>
      {error && <p className="sales-alert" role="alert">{error}</p>}
      {detail.error && <p role="alert">{detail.error}</p>}
      {["follow", "task"].includes(state.kind) && <>{state.customer || state.task ? <p className="sales-context">{detail.data?.customer.customer_name || state.customer?.customer_name || state.task?.customer_name}{state.task && <small>当前待办：{state.task.title}</small>}</p> : <>
        <div className="sales-picker"><label>查找客户（输入即联想）<input value={q} maxLength={100} placeholder="例如输入“冠”立即列出冠松、冠磊…" onChange={e => { setQ(e.target.value); clearTimeout(timer.current); timer.current = window.setTimeout(() => setSearch(e.target.value.trim()), 300); }} /></label></div>
        {choices.error && <p role="alert">{choices.error}</p>}
        <ul className="sales-typeahead">{state.kind === "task" && <li><button type="button" aria-pressed={!cid} onClick={() => setCid("")}>不关联客户（个人待办）</button></li>}{choices.data?.rows.slice(0, 8).map(c => <li key={c.id}><button type="button" aria-pressed={cid === c.id} onClick={() => { setCid(c.id); setQ(c.customer_name); setSearch(c.customer_name); }}>{c.customer_name}<small>{c.customer_code || ""}{c.contact_name ? ` · ${c.contact_name}` : ""}</small></button></li>)}</ul>
        {cid && <p className="sales-note">已选择：{choices.data?.rows.find(x => x.id === cid)?.customer_name || "当前客户"} <button type="button" onClick={() => setCid("")}>重选</button></p>}
        {choices.data?.rows.length === 0 && <p className="sales-note">{search ? "没有匹配的客户，换个关键字试试。" : "输入关键字联想客户。"}</p>}
        {(choices.data?.total || 0) > 8 && <small>共 {choices.data?.total} 个匹配，输入更多关键字可缩小范围。</small>}
      </>}</>}
      {state.kind === "follow" && <>
        <div className="sales-form-grid"><label>跟进方式<select name="method"><option value="phone">电话</option><option value="wechat">微信</option><option value="visit">拜访</option><option value="meeting">面谈</option><option value="quote">报价</option><option value="other">其他</option></select></label><label>沟通结果<select name="result"><option value="normal">已沟通</option><option value="good">沟通顺利</option><option value="waiting">等待反馈</option><option value="no_answer">未接通</option><option value="no_need">暂无需求</option><option value="rejected">明确拒绝</option><option value="won">已成交（不计入实际业绩）</option></select></label><label>沟通有效性<select name="effective" defaultValue="yes"><option value="yes">有效沟通</option><option value="no">未联系上</option></select></label></div>
        <label>联系人<select name="contact" key={cid}><option value="">未指定</option>{detail.data?.contacts.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>沟通摘要<textarea name="summary" rows={3} maxLength={4000} required placeholder="客户反馈了什么，还需确认什么？" /></label>
        <label className="sales-check"><input name="quoted" type="checkbox" />本次已发送报价（客户将进入“已报价”阶段）</label>
        <div className="sales-next-step">
          <h3>下一步安排</h3>
          <div className="sales-plan-choice" role="radiogroup" aria-label="是否需要安排下一步"><button type="button" aria-pressed={nextPlan === "need"} onClick={() => setNextPlan("need")}>需要安排下一步</button><button type="button" aria-pressed={nextPlan === "skip"} onClick={() => setNextPlan("skip")}>暂不需要</button></div>
          {nextPlan === "skip" ? <p className="sales-note">暂不安排时，请在上方“沟通结果”里注明原因（如暂无需求、等待反馈、未接通），避免客户被遗忘。</p> : <p>同时填写动作和时间，自动生成一条我的待办。</p>}
          <label>下一步动作<input name="next_action" maxLength={255} disabled={nextPlan === "skip"} placeholder="例如：电话确认礼盒数量" /></label>
          <label>下次联系时间（北京时间）<input name="next_followup_at" type="datetime-local" disabled={nextPlan === "skip"} /></label>
        </div>
        {state.task && <label className="sales-check"><input type="checkbox" checked={complete} onChange={e => setComplete(e.target.checked)} />同时完成当前待办</label>}
      </>}
      {state.kind === "task" && <><label>待办内容<input name="title" required maxLength={255} /></label><div className="sales-form-grid"><label>类型<select name="type">{Object.entries(taskTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>截止时间（北京时间）<input name="due" type="datetime-local" required /></label></div></>}
      {state.kind === "defer" && <><p>{state.task?.title}</p><label>调整方式<select name="status" onChange={e => setComplete(e.target.value === "cancelled")}><option value="todo">修改截止时间</option><option value="cancelled">取消待办</option></select></label><label>新的截止时间（北京时间）<input name="due" type="datetime-local" required={!complete} /></label><p className="sales-note">取消后保留历史，不删除记录。</p></>}
      <div className="sales-form-footer"><button type="button" disabled={busy} onClick={close}>取消</button><button className="sales-primary" disabled={busy || ((state.kind === "follow") && (!cid || detail.loading || !!detail.error))}>{busy ? "正在保存…" : state.kind === "follow" ? "保存跟进与下一步" : "保存"}</button></div>
    </form>}
  </Modal>;
}
