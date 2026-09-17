"use client";

import type { Dispatch, SetStateAction } from "react";
import { dateTime } from "../../lib/format";
import { contactResultOptions as results, crmActivityLabels, decisionRoleOptions as decisionRoles, interactionMethodOptions as methods, opportunityStageOptions as stages, opportunityStageProbability } from "../../lib/labels";
import type { CrmSettings, Customer, Role } from "../../lib/types";
import { Editor } from "../editor";
import { OppList, FollowList, TaskList } from "../lists";
import { money, text } from "../shared";
import type { Detail, Field, Profile, Value } from "../types";

type EditState = { kind: string; id?: string } | null;

/** 客户详情其余分区：经营画像、联系人、跟进、待办、商机、销售历史、时间线与历史分页。 */
export function DetailSections({ detail, customer, profile, role, userId, processWrite, customerWrite, busy, loading, name, detailTab, edit, setEdit, personOptions, selected, act, save, open, historyOffset, onHistoryOffset, config }: {
  detail: Detail;
  customer: Customer;
  profile: Profile | null;
  role: Role;
  userId: string;
  processWrite: boolean;
  customerWrite: boolean;
  busy: boolean;
  loading: boolean;
  name: (id: string | null) => string;
  detailTab: string;
  edit: EditState;
  setEdit: Dispatch<SetStateAction<EditState>>;
  personOptions: [string, string][];
  selected: string | null;
  act: (run: () => Promise<unknown>, message?: string) => Promise<void>;
  save: (path: string, method: string, data: unknown) => Promise<void>;
  open: (id: string, followup?: boolean) => void;
  historyOffset: number;
  onHistoryOffset: Dispatch<SetStateAction<number>>;
  config?: CrmSettings | null;
}) {
  const contactFields: Field[] = [{ key: "name", label: "联系人姓名", required: true, maxLength: 100 }, { key: "role_label", label: "职位/关系角色（如老板、采购）", maxLength: 64 }, { key: "mobile", label: "联系电话", maxLength: 32 }, { key: "wechat", label: "微信", maxLength: 100 }, { key: "email", label: "邮箱", maxLength: 255 }, { key: "decision_role", label: "业务角色", options: [["", "未指定"], ...decisionRoles] }, { key: "is_primary", label: "主要联系人", type: "checkbox" }, { key: "relationship_note", label: "关系备注", type: "textarea" }, { key: "is_active", label: "联系人有效", type: "checkbox" }];
  const followFields: Field[] = [{ key: "interaction_method", label: "跟进方式", options: methods }, { key: "contact_result", label: "沟通结果", options: results }, { key: "contact_id", label: "关联联系人", options: [["", "未指定"], ...(detail.contacts.filter(c => c.is_active).map(c => [c.id, c.name] as [string, string]) || [])] }, { key: "occurred_at", label: "沟通时间（北京时间）", type: "datetime-local" }, { key: "summary", label: "沟通摘要", type: "textarea" }, { key: "material_sent", label: "已发送资料", type: "checkbox" }, { key: "material_note", label: "资料说明" }, { key: "quotation_sent", label: "已报价", type: "checkbox" }, { key: "next_action", label: "下一步动作" }, { key: "next_followup_at", label: "下次跟进时间（北京时间）", type: "datetime-local" }];
  const oppFields: Field[] = [{ key: "opportunity_name", label: "项目名称", required: true }, { key: "project", label: "所属项目（选历史项目=同项目多客户；输入新名称=新建项目）", type: "project" }, { key: "owner_user_id", label: "项目负责人", required: true, options: personOptions }, { key: "stage", label: "项目阶段", options: stages }, { key: "estimated_amount", label: "预计金额（元）", type: "number", step: "0.01", min: "0" }, { key: "probability", label: "成交概率（%，切换阶段自动带出默认值）", type: "percent", step: "0.0001", min: "0", max: "100" }, { key: "expected_close_date", label: "预计成交日期", type: "date" }, { key: "planned_contact_date", label: "计划：接触客户", type: "date" }, { key: "planned_recommend_date", label: "计划：推荐产品", type: "date" }, { key: "planned_selection_date", label: "计划：选品", type: "date" }, { key: "planned_bidding_date", label: "计划：招投标", type: "date" }, { key: "planned_negotiation_date", label: "计划：大单议价", type: "date" }, { key: "planned_delivery_date", label: "计划：交付", type: "date" }, { key: "delivery_ratio", label: "交付比例（%，分母为该项目预计金额）", type: "percent", step: "0.01", min: "0", max: "100" }, { key: "product_ids", label: "推荐产品", type: "products" }, { key: "need_summary", label: "主要需求", type: "textarea" }, { key: "current_blocker", label: "当前卡点（如：等待客户确认预算）", maxLength: 255 }, { key: "next_promotion", label: "下一步推进（如：9月17日发送3套方案）", maxLength: 500 }, { key: "lost_reason", label: "流失原因" }];
  const stageProbability = config?.stage_probability && Object.keys(config.stage_probability).length ? config.stage_probability : opportunityStageProbability;
  return <>
    {detailTab === "transactions" && role !== "finance" && <section className="card data-section" aria-label="经营画像"><h2>经营画像</h2>
      {profile && !profile.warnings.length ? <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginTop: 12, gap: 12 }}>
        <div><span>RFM 分层</span><h3>{profile.layer || "—"}</h3></div>
        <div><span>累计源销售金额</span><h3>{money(profile.amount)} 元</h3></div>
        <div><span>订单数 / 客单价</span><h3>{profile.orders} 单 · {money(profile.aov)} 元</h3></div>
        <div><span>最近成交</span><h3>{profile.days_since !== null ? `${profile.days_since} 天前` : "—"}</h3><p>{profile.last_order_date || ""}</p></div>
        <div><span>复购</span><h3>{profile.is_repeat ? "已复购" : "尚未复购"}</h3></div>
        <div><span>成交转化周期</span><h3>{profile.convert_days !== null ? `${profile.convert_days} 天` : "—"}</h3></div>
      </div> : <p className="muted">{profile?.warnings?.join("；") || (loading ? "正在加载经营画像…" : "当前账号暂无可用经营画像")}</p>}
      <p className="muted">分层基于源销售历史（R=近期成交 · F=成交频次 · M=金额贡献），阈值由老板在销售工作台设置中调整。</p></section>}
    {detailTab === "contacts" && <section id="customer-contacts" className="card data-section"><h2>联系人与关系人</h2>{["owner", "manager", "sales"].includes(role) && <button onClick={() => setEdit({ kind: "contact" })}>新增联系人</button>}{detail.contacts.map(c => <article className="crm-item" key={c.id}><strong>{c.name} · {c.role_label || "未指定角色"}{c.is_primary ? " · 主要联系人" : ""}{!c.is_active ? " · 已停用" : ""}</strong><p>{c.mobile || "无电话"} · 微信 {c.wechat || "未填写"}</p><p>{c.relationship_note}</p>{customerWrite && <button onClick={() => setEdit({ kind: "contact", id: c.id })}>编辑联系人</button>}</article>)}{edit?.kind === "contact" && <Editor key={edit.id || "new"} title="联系人信息" fields={contactFields} initial={(detail.contacts.find(c => c.id === edit.id) || { is_active: true }) as unknown as Record<string, Value>} submit="保存联系人" cancel={() => setEdit(null)} save={d => save(`/customers/${selected}/contacts${edit.id ? "/" + edit.id : ""}`, edit.id ? "PUT" : "POST", d)} />}</section>}
    {detailTab === "followups" && role !== "finance" && <section id="customer-followups" className="card data-section"><h2>跟进记录</h2>{processWrite && <button onClick={() => setEdit({ kind: "followup" })}>新增跟进</button>}{edit?.kind === "followup" && <Editor key={edit.id || "new"} title="记录跟进" fields={followFields} initial={(detail.followups.find(f => f.id === edit.id) || { occurred_at: new Date().toISOString() }) as unknown as Record<string, Value>} submit="保存跟进与下一步" cancel={() => setEdit(null)} save={d => save(`/customers/${selected}/followups${edit.id ? "/" + edit.id : ""}`, edit.id ? "PUT" : "POST", d)} />}<p className="muted">同时填写下一步动作和时间，将自动生成一条待办；修改保留历史。</p><FollowList data={detail.followups} name={name} selected={selected} processWrite={processWrite} role={role} edit={edit} setEdit={setEdit} save={save} open={open} /></section>}
    {detailTab === "tasks" && role !== "finance" && <section id="customer-tasks" className="card data-section"><h2>客户待办</h2>{["owner", "manager", "sales"].includes(role) && <button onClick={() => setEdit({ kind: "newtask" })}>为客户安排待办</button>}<TaskList data={detail.tasks} name={name} selected={selected} processWrite={processWrite} role={role} busy={busy} act={act} open={open} edit={edit} setEdit={setEdit} save={save} /></section>}
    {detailTab === "opportunities" && role !== "finance" && <section className="card data-section"><h2>客户项目</h2>{processWrite && <button onClick={() => setEdit({ kind: "opportunity" })}>新增项目</button>}{edit?.kind === "opportunity" && <Editor key={edit.id || "new"} title="项目信息" fields={oppFields} autoProbability={stageProbability} initial={(detail.opportunities.find(o => o.id === edit.id) || { owner_user_id: customer.owner_user_id || userId, stage: "contact" }) as unknown as Record<string, Value>} initialProducts={detail.opportunities.find(o => o.id === edit.id)?.products || []} submit="保存项目" cancel={() => setEdit(null)} save={async d => {
      const ids = Array.isArray(d.product_ids) ? d.product_ids as string[] : [];
      const hits: string[] = [];
      for (const o of detail.opportunities) { if (edit.id && o.id === edit.id) continue; for (const p of o.products || []) if (ids.includes(p.id)) hits.push(`${p.name}（${o.opportunity_name || "未命名项目"}）`); }
      if (hits.length && !window.confirm(`该客户已经推荐过这款产品：${hits.join("、")}。仍要保存？`)) throw new Error("已取消：存在重复推荐，可调整产品后重试");
      const path = `/customers/${selected}/opportunities${edit.id ? "/" + edit.id : ""}`;
      const method = edit.id ? "PUT" : "POST";
      try { await save(path, method, d); }
      catch (e) {
        const conflict = (e as Error & { payload?: { code?: string; message?: string } }).payload;
        if (conflict?.code === "cross_customer_product_conflict" && window.confirm(conflict.message)) await save(path, method, { ...d, confirm_cross_customer: true });
        else throw e;
      }
    }} />}<p className="muted">项目预计金额用于销售过程管理，成交不会自动生成正式销售订单（实际成交以精斗云导入为准）。同一项目跨客户重复推荐同款产品、同一客户重复推荐时系统都会提醒；开放项目必须始终有下一步。</p><OppList data={detail.opportunities} name={name} selected={selected} processWrite={processWrite} open={open} setEdit={setEdit} /></section>}
    {detailTab === "transactions" && <section id="customer-transactions" className="card data-section"><h2>精斗云销售历史</h2><p>按销售数据权限显示导入记录；客户转交不改变历史业绩归属。以下为源销售核对值，退货和作废范围仍待业务确认。</p><div className="cards crm-summary"><div><span>累计源销售金额</span><h3>{money(detail.sales_summary.total_amount)} 元</h3></div><div><span>本年源销售金额</span><h3>{money(detail.sales_summary.year_amount)} 元</h3></div><div><span>授权订单 / 最近成交</span><h3>{detail.sales_summary.order_count} 单</h3><p>{detail.sales_summary.last_order_date || "暂无记录"}</p></div></div>{detail.sales_summary.top_products.length > 0 && <><h3>主要购买商品（按源行金额）</h3>{detail.sales_summary.top_products.map((p, i) => <p key={i}>{p.name} · {money(p.amount)} 元</p>)}</>}{detail.orders.length === 0 ? <p>暂无授权范围内的销售记录。</p> : <div className="table-scroll"><table><thead><tr><th>单号</th><th>日期</th><th>源销售金额（元）</th></tr></thead><tbody>{detail.orders.map(o => <tr key={o.id}><td>{o.order_no}</td><td>{o.order_date}</td><td>{money(o.sales_amount)}</td></tr>)}</tbody></table></div>}</section>}
    {detailTab === "followups" && role !== "finance" && <section className="card data-section"><h2>操作时间线</h2>{detail.events.length === 0 ? <p>暂无 CRM 操作。</p> : detail.events.map(e => <p key={e.id}>{dateTime(e.occurred_at)} · {name(e.user_id)} · {crmActivityLabels[e.activity_type] || "客户操作"}{e.details?.after?.reason ? " · " + e.details.after.reason : ""}</p>)}</section>}
    <div className="crm-actions"><button disabled={loading || historyOffset === 0} onClick={() => onHistoryOffset(Math.max(0, historyOffset - 50))}>较新客户记录</button><span>客户历史第 {historyOffset / 50 + 1} 页（跟进、待办、商机、订单、时间线各 50 条）</span><button disabled={loading || !detail.has_more_history} onClick={() => onHistoryOffset(historyOffset + 50)}>更早客户记录</button></div>
  </>;
}
