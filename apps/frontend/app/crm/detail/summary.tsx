"use client";

import type { Dispatch, SetStateAction } from "react";
import { dateTime } from "../../lib/format";
import { lifecycleOptions as lifecycle, customerStatusOptions as customerStage } from "../../lib/labels";
import type { CrmSettings as Settings, Customer, Role, Tag } from "../../lib/types";
import { api } from "../api";
import { Editor } from "../editor";
import { TagManager, TagPicker } from "../tags";
import { text } from "../shared";
import type { Detail, Value } from "../types";
import { primaryContactOf } from "./derive";

type EditState = { kind: string; id?: string } | null;

/** 客户详情：摘要卡、分区 Tab 导航、标签区与 客户/归属/绑定 编辑器。 */
export function DetailSummary({ detail, customer, tags, config, role, userId, processWrite, manage, customerWrite, busy, name, tagMgr, onTagMgr, detailTab, onDetailTab, edit, setEdit, candidates, setCandidates, personOptions, selected, act, save, refresh, open, setNotice, onCloseDetail }: {
  detail: Detail;
  customer: Customer;
  tags: Tag[];
  config: Settings | null;
  role: Role;
  userId: string;
  processWrite: boolean;
  manage: boolean;
  customerWrite: boolean;
  busy: boolean;
  name: (id: string | null) => string;
  tagMgr: boolean;
  onTagMgr: Dispatch<SetStateAction<boolean>>;
  detailTab: string;
  onDetailTab: (v: string) => void;
  edit: EditState;
  setEdit: Dispatch<SetStateAction<EditState>>;
  candidates: Customer[];
  setCandidates: Dispatch<SetStateAction<Customer[]>>;
  personOptions: [string, string][];
  selected: string | null;
  act: (run: () => Promise<unknown>, message?: string) => Promise<void>;
  save: (path: string, method: string, data: unknown) => Promise<void>;
  refresh: () => void;
  open: (id: string, followup?: boolean) => void;
  setNotice: (v: string) => void;
  onCloseDetail: () => void;
}) {
  const primaryContact = primaryContactOf(detail);
  const detailTabs: [string, string][] = [["overview", "概览"], ["contacts", "联系人"], ...(role !== "finance" ? [["followups", "跟进记录"], ["tasks", "待办任务"], ["opportunities", "商机"]] as [string, string][] : []), ["transactions", "交易"]];
  return <>
    <header className="cd-card cd-summary" aria-label="客户摘要">
      <div>
        <div className="cd-title-row"><h2 className="cd-name">{customer.customer_name}</h2>
          <div className="cd-title-actions">
            {customerWrite && processWrite && <button className="cd-primary" onClick={() => { onDetailTab("followups"); setEdit({ kind: "followup" }); }}>记录跟进</button>}
            {customerWrite && <button onClick={() => setEdit({ kind: "customer" })}>编辑客户</button>}
            {manage && <details><summary aria-label="更多客户操作">···</summary><div className="cd-actions-row">{manage && <button onClick={() => setEdit({ kind: "transfer" })}>分配／转交／公海</button>}{manage && customer.source_system === "crm" && !customer.bound_customer_id && <button onClick={() => { setEdit({ kind: "bind" }); setCandidates([]); }}>绑定精斗云客户</button>}</div></details>}
          </div>
        </div>
        <div className="cd-tagwrap" style={{ marginTop: 8 }}>
          {customer.customer_level && <span className="cd-tag level">{customer.customer_level}级客户</span>}
          <span className="cd-tag status">{text(lifecycle, customer.lifecycle_status)}</span>
          {customer.customer_type && <span className="cd-tag plain">{customer.customer_type}</span>}
        </div>
        <p className="cd-desc">{customer.remark || "暂无客户备注"}</p>
      </div>
      <dl className="cd-meta">
        <div><dt>负责人</dt><dd>{name(customer.owner_user_id)}</dd></div>
        <div><dt>主要联系人</dt><dd>{primaryContact ? primaryContact.name : "未登记"}</dd></div>
        <div><dt>联系电话</dt><dd>{primaryContact?.mobile || "—"}</dd></div>
        <div><dt>客户编号</dt><dd>{customer.customer_code || "CRM 潜客"}</dd></div>
        <div><dt>创建时间</dt><dd>{dateTime(customer.created_at)}</dd></div>
      </dl>
      <div>
        <div className="cd-tagwrap">
          {detail.tags.slice(0, 4).map(t => <span key={t.id} className="cd-tag plain">{t.tag_name}</span>)}
          {detail.tags.length > 4 && <span className="cd-tag more">+{detail.tags.length - 4}</span>}
          {!detail.tags.length && <span className="cd-empty">暂无标签</span>}
        </div>
        {customerWrite && <button className="cd-more" aria-expanded={tagMgr} onClick={() => onTagMgr(v => !v)}>{tagMgr ? "收起标签管理" : "管理标签"}</button>}
        {customer.claims?.length ? <p className="cd-sub">认养人：{customer.claims.map(x => x.display_name + (x.user_id === userId ? "（我）" : "")).join("、")}</p> : null}
      </div>
    </header>
    <nav className="cd-tabs" aria-label="客户详情分区">{detailTabs.map(([key, label]) => <button key={key} aria-pressed={detailTab === key} onClick={() => onDetailTab(key)}>{label}</button>)}</nav>
    {tagMgr && customerWrite && <section className="card data-section" aria-label="标签管理"><TagManager tags={tags} busy={busy} run={act} role={role} userId={userId} /><TagPicker key={detail.tags.map(t => t.id).join(",")} tags={tags} selected={detail.tags.map(t => t.id)} busy={busy} canCreate={!!processWrite && !!config?.sales_create_tags} onCreate={async tagName => { let t: Tag | undefined; await act(async () => { t = await api<Tag>("/tags", "POST", { tag_name: tagName, tag_group: null }); }, ""); return t; }} onSave={ids => act(() => api(`/customers/${selected}/tags`, "PUT", { tag_ids: ids }))} /></section>}
    {!customerWrite && <section className="card data-section" aria-label="标签管理"><div className="tag-picker">{detail.tags.map(t => <span key={t.id} className="tag-chip">{t.tag_name}</span>)}{!detail.tags.length && <p className="muted">暂无标签</p>}</div></section>}
    {edit?.kind === "customer" && <Editor title="客户扩展信息" initial={customer as unknown as Record<string, Value>} fields={[...(customer.source_system === "crm" && !customer.bound_customer_id ? [{ key: "customer_name", label: "客户名称", required: true }] : []), { key: "remark", label: "客户备注", type: "textarea" }, ...(customerWrite ? [{ key: "customer_level", label: "客户级别（A-D，销售可自行调整）", options: [["", "未评级"], ["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"]] as [string, string][] }] : []), ...(customerWrite ? [{ key: "customer_status", label: "客户阶段", options: [["", "未标记"], ...customerStage] as [string, string][] }] : []), ...(manage ? [{ key: "customer_type", label: "客户类型", maxLength: 32 }, { key: "lifecycle_status", label: "合作状态", options: lifecycle }] : [])]} submit="保存客户" cancel={() => setEdit(null)} save={d => save(`/customers/${selected}`, "PATCH", d)} />}
    {edit?.kind === "transfer" && <Editor title="客户归属调整" fields={[{ key: "owner_user_id", label: "新负责人", options: [["", "进入公海"], ...personOptions] }, { key: "reason", label: "转交原因", required: true, maxLength: 500 }]} initial={{ owner_user_id: customer.owner_user_id }} submit="确认调整归属" cancel={() => setEdit(null)} save={async d => { await api(`/customers/${selected}/transfer`, "POST", d); onCloseDetail(); setNotice("归属已调整，历史记录保留"); refresh(); }} />}
    {edit?.kind === "bind" && <><Editor title="查找精斗云正式客户" fields={[{ key: "q", label: "正式客户名称", required: true, maxLength: 100 }]} submit="查找可绑定客户" cancel={() => setEdit(null)} save={async d => setCandidates(await api<Customer[]>(`/binding-candidates?q=${encodeURIComponent(String(d.q))}`))} /><p>仅列出未分配、未管理的正式客户。绑定保留潜客历史和精斗云原始订单。</p>{candidates.map(c => <p key={c.id}>{c.customer_name} · {c.customer_code}<button disabled={busy} onClick={() => act(async () => { const bound = await api<Customer>(`/customers/${selected}/bind`, "POST", { target_id: c.id }); open(bound.id); }, "已绑定，潜客历史已保留")}>绑定此客户</button></p>)}</>}
  </>;
}
