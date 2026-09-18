"use client";

import type { Dispatch, SetStateAction } from "react";
import CRM from "../crm";
import { api } from "../lib/api";
import { stamp } from "../lib/format";
import type { CustomerRow as Customer, Page, TaskRow as Task, User } from "../lib/types";
import type { CustomersPage, Data, Route } from "./types";
import { Empty, Panel, Pager } from "./ui";

/** 客户屏幕：客户详情（内嵌 CRM）或 我的客户/客户公海 列表。 */
export function CustomersScreen({ route, customers, user, revision, offset, onOffsetChange, pageSize, onPageSizeChange, claimFilter, onClaimFilterChange, poolIds, onPoolIdsChange, levelFilter, onLevelFilterChange, tagFilter, onTagFilterChange, searchInput, setSearchInput, onSearchInput, liveSearch, tagList, busy, run, record, go }: {
  route: Route;
  customers: Data<CustomersPage>;
  user: User;
  revision: number;
  offset: number;
  onOffsetChange: (n: number) => void;
  pageSize: number;
  onPageSizeChange: (n: number) => void;
  claimFilter: string;
  onClaimFilterChange: (v: string) => void;
  poolIds: string[];
  onPoolIdsChange: Dispatch<SetStateAction<string[]>>;
  levelFilter: string;
  onLevelFilterChange: (v: string) => void;
  tagFilter: string;
  onTagFilterChange: (v: string) => void;
  searchInput: string;
  setSearchInput: (v: string) => void;
  onSearchInput: (value: string) => void;
  liveSearch: (q: string) => void;
  tagList: Data<{ id: string; tag_name: string }[]>;
  busy: boolean;
  run: (action: () => Promise<unknown>, message: string) => Promise<void>;
  record: (task?: Task, customer?: Customer) => void;
  go: (r: Route) => void;
}) {
  const tabs: [string, string][] = [["", "全部客户"], ["new", "新客户"], ["intent", "意向客户"], ["quoting", "报价中"], ["deal", "成交客户"], ["dormant", "沉睡客户"]];
  const tabCount = (key: string) => { const t = customers.data?.tabs; if (!t) return ""; if (key === "") return t.deal == null ? "" : (["dormant","deal","quoting","intent","new"] as const).reduce((a, k) => a + (Number(t[k] ?? 0)), 0); return t[key as "dormant"] ?? ""; };
  return route.customerId ? (
    <div className="sales-detail">
      <button onClick={() => go({ screen: "customers" })}>← 返回客户列表</button>
      <button className="sales-primary" onClick={() => record(undefined, { id: route.customerId!, customer_name: "当前客户" } as Customer)}>记录跟进</button>
      <CRM key={`${route.customerId}-${revision}`} role="sales" userId={user.id} entry={{ tab: "customers", customerId: route.customerId }} embedded />
    </div>
  ) : (
    <Panel title={route.pool ? "客户公海" : "我的客户"} action={
      <div className="sales-tabs">
        <button aria-pressed={!route.pool} onClick={() => go({ screen: "customers", q: route.q })}>我的客户</button>
        <button aria-pressed={!!route.pool} onClick={() => go({ screen: "customers", pool: true, q: route.q })}>客户公海</button>
      </div>}>
      {!route.pool && <div className="sales-tabs cust-tabs" aria-label="客户状态">
        {tabs.map(([key, label]) => <button key={key || "all"} aria-pressed={(route.status || "") === key} onClick={() => go({ screen: "customers", q: route.q, status: key || undefined })}>{label}{tabCount(key) !== "" && `（${tabCount(key)}）`}</button>)}
      </div>}
      {!route.pool && route.status && !["new", "intent", "quoting", "deal", "dormant"].includes(route.status) && <p className="sales-notice" style={{ margin: "0 0 12px" }}>已按「{route.status === "key" ? "RFM 重点客户" : "疑似流失"}」筛选；<button onClick={() => go({ screen: "customers", q: route.q })}>清除筛选</button></p>}
      <div className="sales-list-toolbar">
        <form role="search" onSubmit={e => { e.preventDefault(); liveSearch(searchInput.trim()); }}>
          <input aria-label="搜索客户" placeholder="搜索客户" value={searchInput} maxLength={100} onChange={e => onSearchInput(e.target.value)} />
        </form>
        {!route.pool && <>
          <label>等级<select aria-label="按客户等级筛选" value={levelFilter} onChange={e => onLevelFilterChange(e.target.value)}><option value="">全部</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option><option value="none">未评级</option></select></label>
          <label>标签<select aria-label="按标签筛选" value={tagFilter} onChange={e => onTagFilterChange(e.target.value)}><option value="">全部</option>{tagList.data?.map(x => <option key={x.id} value={x.id}>{x.tag_name}</option>)}</select></label>
        </>}
        <span>{route.q ? `搜索“${route.q}” · ` : ""}共 {customers.data?.total ?? "—"} 位客户</span>
        {route.q && <button onClick={() => { setSearchInput(""); liveSearch(""); }}>清除搜索</button>}
        <label>每页<select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}>{[10, 20, 50].map(n => <option key={n} value={n}>{n} 行</option>)}</select></label>
        {route.pool && <label>认养状态<select value={claimFilter} onChange={e => onClaimFilterChange(e.target.value)}><option value="">全部</option><option value="unclaimed">未认养</option><option value="claimed">已认养</option></select></label>}
        {route.pool && <button className="sales-primary" disabled={busy || !poolIds.length} onClick={() => run(async () => { const r = await api<{ claimed_count: number; skipped: string[] }>("/api/crm/customers/batch-claim", { method: "POST", json: { customer_ids: poolIds } }); onPoolIdsChange([]); }, `已认养成功，可在“我的客户”查看`)}>一键认养（{poolIds.length}）</button>}
        <p>{route.pool ? "勾选未认养客户可一键认养；同一客户允许多位同事认养。" : "状态标签由成交事实与开放项目阶段推导（docs/32）；项目在客户详情中推进。"}</p>
      </div>
      {customers.loading ? <Empty>正在加载客户…</Empty> : customers.data?.rows.length ? (
        <div className="sales-table-scroll">
          <table className="sales-table">
            <thead><tr>
              {route.pool && <th><input type="checkbox" aria-label="全选本页可认养客户" checked={(() => { const rows = customers.data?.rows || []; const claimable = rows.filter(c => !c.claims.some(x => x.user_id === user.id)); return claimable.length > 0 && claimable.every(c => poolIds.includes(c.id)); })()} onChange={e => { const rows = customers.data?.rows || []; onPoolIdsChange(ids => e.target.checked ? [...new Set([...ids, ...rows.filter(c => !c.claims.some(x => x.user_id === user.id)).map(c => c.id)])] : ids.filter(id => !rows.some(c => c.id === id))); }} /></th>}
              <th>客户名称</th>
              {route.pool ? <><th>客户编码</th><th>认养人</th></> : <><th>标签</th><th>联系人</th><th>最近跟进</th><th>下一步计划</th><th>客户状态</th></>}
              <th>操作</th>
            </tr></thead>
            <tbody>{customers.data.rows.map(c =>
              <tr key={c.id}>
                {route.pool && <td><input type="checkbox" aria-label={`认养客户 ${c.customer_name}`} checked={poolIds.includes(c.id)} disabled={busy || c.claims.some(x => x.user_id === user.id)} onChange={e => onPoolIdsChange(ids => e.target.checked ? [...new Set([...ids, c.id])] : ids.filter(id => id !== c.id))} /></td>}
                <td><strong>{c.customer_name}</strong>{!route.pool && c.customer_level && <span className="sales-level" aria-label={`客户等级 ${c.customer_level}`}>{c.customer_level}</span>}{!route.pool && c.lifecycle_status === "lost" && <span className="sales-status lost">流失</span>}{!route.pool && c.claims.length > 1 && <small>共同认养：{c.claims.map(x => x.display_name).join("、")}</small>}</td>
                {route.pool ? <><td>{c.customer_code || "CRM 潜客"}</td><td>{c.claims.map(x => x.display_name).join("、") || "暂无"}</td></> : <>
                  <td>{c.tags.length ? <>{c.tags.slice(0, 2).map(t => <span key={t} className="sales-tag-chip">{t}</span>)}{c.tags.length > 2 && <span className="sales-tag-chip more">+{c.tags.length - 2}</span>}</> : <span className="sales-dim">未打标签</span>}</td>
                  <td>{c.contact_name || "未填写"}</td>
                  <td>{stamp(c.last_followup)}</td>
                  <td>{c.next_action || "未安排下一步"}{c.next_due && <small>{stamp(c.next_due)}</small>}</td>
                </>}
                <td><div className="sales-row-actions">{!route.pool ? <><button onClick={() => go({ screen: "customers", customerId: c.id })}>查看客户</button><button onClick={() => record(undefined, c)}>记录跟进</button></> : c.claims.some(x => x.user_id === user.id) ? <button onClick={() => go({ screen: "customers", customerId: c.id })}>已认养 · 查看</button> : <button disabled={busy} onClick={() => run(() => api(`/api/crm/customers/${c.id}/claim`, { method: "POST" }), "认养成功，可在我的客户查看")}>认养客户</button>}</div></td>
              </tr>)}</tbody>
          </table>
        </div>
      ) : <Empty>{route.q ? "没有匹配客户，请调整搜索条件。" : route.pool ? "公海暂无客户。" : "暂无客户，请到客户公海认养已导入的精斗云客户。"}</Empty>}
      <Pager offset={offset} total={customers.data?.total || 0} size={pageSize} onChange={onOffsetChange} />
    </Panel>
  );
}
