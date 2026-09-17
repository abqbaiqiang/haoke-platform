"use client";

import { dateTime, dayDiff } from "../../lib/format";
import { opportunityStageFlowOptions as stageFlow, opportunityStageOptions as stages, interactionMethodOptions as methods, decisionRoleOptions as decisionRoles, lifecycleOptions as lifecycle, customerStatusOptions as customerStage } from "../../lib/labels";
import type { Role } from "../../lib/types";
import { api } from "../api";
import { Editor } from "../editor";
import { money, relLabel, text } from "../shared";
import type { Detail, Profile, Value } from "../types";
import { currentOppOf, lastFollowOf, nextTaskOf } from "./derive";

type EditState = { kind: string; id?: string } | null;

/** 客户详情概览 Tab：KPI、下一步行动、当前商机、最近跟进/交易与右栏信息。 */
export function DetailOverview({ detail, profile, role, processWrite, customerWrite, busy, name, edit, setEdit, onDetailTab, selected, act, save, setNotice }: {
  detail: Detail;
  profile: Profile | null;
  role: Role;
  processWrite: boolean;
  customerWrite: boolean;
  busy: boolean;
  name: (id: string | null) => string;
  edit: EditState;
  setEdit: (v: EditState) => void;
  onDetailTab: (v: string) => void;
  selected: string | null;
  act: (run: () => Promise<unknown>, message?: string) => Promise<void>;
  save: (path: string, method: string, data: unknown) => Promise<void>;
  setNotice: (v: string) => void;
}) {
  const nextTask = nextTaskOf(detail);
  const currentOpp = currentOppOf(detail);
  const lastFollow = lastFollowOf(detail);
  const activeContacts = detail.contacts.filter(c => c.is_active);
  const stageIndex = (s: string) => stageFlow.findIndex(([v]) => v === s);
  async function copyText(value: string, label: string) { try { await navigator.clipboard.writeText(value); setNotice(`已复制${label}：${value}`); } catch { setNotice(`复制失败，请手动复制${label}：${value}`); } }
  return <>
    <div className="cd-kpis">
      <button className="cd-card cd-kpi" onClick={() => onDetailTab("transactions")}><span>累计销售额</span><strong>{detail.sales_summary.order_count ? money(detail.sales_summary.total_amount) : "—"}</strong><small>{detail.sales_summary.order_count ? `${detail.sales_summary.order_count} 单` : "暂无精斗云销售记录"}</small></button>
      <button className="cd-card cd-kpi" onClick={() => onDetailTab("transactions")}><span>本年销售额</span><strong>{detail.sales_summary.order_count ? money(detail.sales_summary.year_amount) : "—"}</strong><small>同比 —</small></button>
      <button className="cd-card cd-kpi" onClick={() => onDetailTab("transactions")}><span>最近成交</span><strong>{profile?.days_since != null ? `${profile.days_since} 天前` : "—"}</strong><small>{detail.sales_summary.last_order_date || "暂无成交记录"}</small></button>
      <button className="cd-card cd-kpi" onClick={() => onDetailTab("followups")}><span>最近跟进</span><strong>{lastFollow ? relLabel(dayDiff(lastFollow.occurred_at)) : "—"}</strong><small>{lastFollow ? dateTime(lastFollow.occurred_at) : "暂无跟进记录"}</small></button>
      <button className="cd-card cd-kpi" onClick={() => onDetailTab("tasks")}><span>下一步计划</span><strong className={nextTask && dayDiff(nextTask.due_at) < 0 ? "danger" : ""}>{nextTask ? relLabel(dayDiff(nextTask.due_at)) : "—"}</strong><small>{nextTask ? dateTime(nextTask.due_at) : "暂无待办"}</small></button>
    </div>
    <div className="cd-columns">
      <div className="cd-main">
        <section className="cd-card" aria-label="下一步行动">
          <header><h3>下一步行动</h3>{["owner", "manager", "sales"].includes(role) && <button className="cd-more" onClick={() => setEdit({ kind: "newtask" })}>+ 新建下一步行动</button>}</header>
          {nextTask ? <div className={"cd-next" + (dayDiff(nextTask.due_at) < 0 ? " overdue" : "")}>
            <div className="when">{dateTime(nextTask.due_at)}<br /><span className="due">{dayDiff(nextTask.due_at) < 0 ? `已逾期 ${-dayDiff(nextTask.due_at)} 天` : relLabel(dayDiff(nextTask.due_at))}</span></div>
            <div className="what"><strong>{nextTask.title}</strong><p>负责人：{name(nextTask.assignee_user_id)} · {nextTask.source_type === "followup" ? "跟进生成" : nextTask.source_type === "manager" ? "管理者分配" : "手动创建"}</p></div>
            <div className="cd-actions-row">{["owner", "manager", "sales"].includes(role) && <><button className="cd-primary" disabled={busy} onClick={() => act(() => api(`/tasks/${nextTask.id}`, "PATCH", { status: "done" }), "待办已完成；建议顺手记录一次跟进")}>完成</button><button onClick={() => setEdit({ kind: "task", id: nextTask.id })}>修改</button></>}</div>
          </div> : <p className="cd-empty">暂无下一步行动，为这个客户安排一件今天能推进的事。</p>}
          {edit?.kind === "task" && edit.id && detail.tasks.some(t => t.id === edit.id) && <Editor title="调整待办" fields={[{ key: "due_at", label: "延期至（北京时间）", type: "datetime-local" }, { key: "status", label: "待办状态", options: [["todo", "待处理"], ["cancelled", "取消"]] }, { key: "completion_result", label: "简短结果", maxLength: 100 }]} initial={{}} submit="保存待办" cancel={() => setEdit(null)} save={async d => { if (d.status === "cancelled" || !d.due_at) delete d.due_at; await save(`/tasks/${edit!.id}`, "PATCH", d); }} />}
        </section>
        <section className={"cd-card" + (currentOpp ? " cd-opp" : "")} aria-label="当前商机">
          <header><h3>当前商机</h3><button className="cd-more" onClick={() => onDetailTab("opportunities")}>查看全部商机 ›</button></header>
          {currentOpp ? <>
            <div className="cd-opp-head"><strong>{currentOpp.opportunity_name}</strong><span className="amount">{currentOpp.estimated_amount ? money(currentOpp.estimated_amount) : "未填写"}</span></div>
            <ol className="cd-steps">{stageFlow.map(([v, label]) => <li key={v} className={v === currentOpp.stage ? "current" : stageIndex(v) < stageIndex(currentOpp.stage) ? "done" : ""}>{label}</li>)}</ol>
            <dl><dt>预计成交时间</dt><dd>{currentOpp.expected_close_date || "未填写"}</dd><dt>当前卡点</dt><dd>{currentOpp.current_blocker || "未填写"}</dd><dt>下一步推进</dt><dd>{currentOpp.next_promotion || "未填写"}</dd><dt>相关产品</dt><dd>{currentOpp.products && currentOpp.products.length ? currentOpp.products.map(p => p.name).join("、") : "—"}</dd><dt>商机负责人</dt><dd>{name(currentOpp.owner_user_id)}</dd></dl>
            {currentOpp.expected_close_date && dayDiff(currentOpp.expected_close_date) < 0 && <p className="warn">已超过预计成交日期，请与负责人确认商机进展。</p>}
            {processWrite && <div className="cd-actions-row"><button onClick={() => setEdit({ kind: "opportunity", id: currentOpp.id })}>编辑商机</button><button className="cd-primary" onClick={() => setEdit({ kind: "promote", id: currentOpp.id })}>推进商机</button></div>}
          </> : <p className="cd-empty">暂无进行中商机。{processWrite ? "可为这个客户新增一个商机。" : ""}</p>}
        </section>
        <div className="cd-duo">
          <section className="cd-card" aria-label="最近跟进">
            <header><h3>最近跟进</h3><button className="cd-more" onClick={() => onDetailTab("followups")}>查看全部 ›</button></header>
            {detail.followups.length ? <ul className="cd-feed">{detail.followups.slice(0, 3).map(f => <li key={f.id}><span className="dot" /><div className="body"><div className="head"><time>{dateTime(f.occurred_at)}</time><span className="cd-tag plain">{text(methods, f.interaction_method)}</span><span className="muted">{name(f.owner_user_id)}</span></div><p>{f.summary || "未填写摘要"}{f.next_action ? ` · 下一步：${f.next_action}` : ""}</p></div></li>)}</ul> : <p className="cd-empty">暂无跟进记录。</p>}
            {processWrite && <div className="cd-actions-row"><button className="cd-primary" onClick={() => { onDetailTab("followups"); setEdit({ kind: "followup" }); }}>+ 记录跟进</button></div>}
          </section>
          <section className="cd-card" aria-label="最近交易">
            <header><h3>最近交易</h3><button className="cd-more" onClick={() => onDetailTab("transactions")}>查看全部 ›</button></header>
            {detail.orders.length ? <><table className="cd-table"><thead><tr><th>日期</th><th>单据号</th><th>金额</th></tr></thead><tbody>{detail.orders.slice(0, 3).map(o => <tr key={o.id}><td>{o.order_date}</td><td>{o.order_no}</td><td>{money(o.sales_amount)}</td></tr>)}</tbody></table>
              <div className="cd-mini"><div><span>累计销售</span><strong>{money(detail.sales_summary.total_amount)}</strong></div><div><span>本年销售</span><strong>{money(detail.sales_summary.year_amount)}</strong></div><div><span>订单数</span><strong>{detail.sales_summary.order_count} 单</strong></div></div></>
              : <p className="cd-empty">暂无精斗云销售记录。</p>}
          </section>
        </div>
      </div>
      <div className="cd-side">
        <section className="cd-card" aria-label="联系人">
          <header><h3>联系人（{activeContacts.length}）</h3><button className="cd-more" onClick={() => { onDetailTab("contacts"); setEdit({ kind: "contact" }); }}>+ 新增联系人</button></header>
          <div className="cd-contacts">{activeContacts.slice(0, 4).map(c =>
            <div className="cd-contact" key={c.id}>
              <span className="avatar">{c.name.slice(0, 1)}</span>
              <div className="who">
                <div className="nm">{c.name}{c.is_primary && <span className="cd-tag">主要联系人</span>}</div>
                <div className="rl">{[c.role_label, c.decision_role ? text(decisionRoles, c.decision_role) : ""].filter(Boolean).join(" · ") || "未指定角色"}</div>
                {c.mobile && <div className="mb">{c.mobile}</div>}
              </div>
              <div className="cd-quick">
                {c.mobile && <button onClick={() => copyText(c.mobile!, "电话号码")}>电话</button>}
                {c.wechat && <button onClick={() => copyText(c.wechat!, "微信号")}>微信</button>}
                <button onClick={() => { onDetailTab("contacts"); setEdit({ kind: "contact", id: c.id }); }}>编辑</button>
              </div>
            </div>)}
            {!activeContacts.length && <p className="cd-empty">暂无联系人。</p>}
          </div>
        </section>
        <section className="cd-card" aria-label="客户信息">
          <header><h3>客户信息</h3>{customerWrite && <button className="cd-more" onClick={() => setEdit({ kind: "customer" })}>编辑</button>}</header>
          <dl className="cd-info">
            <div><dt>客户等级</dt><dd>{detail.customer.customer_level ? `${detail.customer.customer_level}级客户` : "未评级"}</dd></div>
            <div><dt>RFM 分层</dt><dd>{profile?.layer || "—"}</dd></div>
            <div><dt>客户阶段</dt><dd>{detail.customer.customer_status ? text(customerStage, detail.customer.customer_status) : "未标记"}</dd></div>
            <div><dt>合作状态</dt><dd>{text(lifecycle, detail.customer.lifecycle_status)}</dd></div>
            <div><dt>客户类型</dt><dd>{detail.customer.customer_type || "—"}</dd></div>
            <div className="weak"><dt>绑定状态</dt><dd>{detail.customer.bound_at ? "已绑定精斗云" : "未绑定精斗云"}</dd></div>
          </dl>
        </section>
        <section className="cd-card" aria-label="客户备注">
          <header><h3>客户备注</h3>{customerWrite && <button className="cd-more" onClick={() => setEdit({ kind: "customer" })}>编辑</button>}</header>
          <p className="cd-note">{detail.customer.remark || "暂无客户备注"}</p>
        </section>
      </div>
    </div>
    {edit?.kind === "promote" && edit.id && <Editor title="推进商机" fields={[{ key: "stage", label: "商机阶段", options: stages }, { key: "estimated_amount", label: "预计金额（元）", type: "number", step: "0.01", min: "0" }, { key: "expected_close_date", label: "预计成交日期", type: "date" }, { key: "current_blocker", label: "当前卡点（如：等待客户确认预算）", maxLength: 255 }, { key: "next_promotion", label: "下一步推进（如：9月17日发送3套方案）", maxLength: 500 }]} initial={detail.opportunities.find(o => o.id === edit.id) as unknown as Record<string, Value>} submit="保存推进" cancel={() => setEdit(null)} save={async d => { const o = detail.opportunities.find(x => x.id === edit!.id)!; await save(`/customers/${selected}/opportunities/${edit!.id}`, "PUT", { opportunity_name: o.opportunity_name, owner_user_id: o.owner_user_id, probability: o.probability, need_summary: o.need_summary, lost_reason: o.lost_reason, product_ids: o.products.map(p => p.id), ...d }); }} />}
  </>;
}
