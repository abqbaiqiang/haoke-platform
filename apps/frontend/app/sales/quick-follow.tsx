"use client";

import { FormEvent, useRef, useState } from "react";
import { api, useData } from "../lib/api";
import type { CustomerRow as Customer, Page } from "../lib/types";

export function QuickFollow({ saved }: { saved: (s: string) => void }) {
  const [open, setOpen] = useState(true), [cid, setCid] = useState(""), [picked, setPicked] = useState(""), [q, setQ] = useState(""), [search, setSearch] = useState(""), [method, setMethod] = useState("phone"), [len, setLen] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const timer = useRef(0);
  const choices = useData<Page<Customer>>(open ? `/api/sales/customers?q=${encodeURIComponent(search)}&limit=8` : null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); const str = (k: string) => String(f.get(k) || "").trim(); const due = str("next_due") ? str("next_due") + ":00+08:00" : null; setBusy(true); setError(""); try {
      if (!cid) throw new Error("请先选择客户");
      if (!str("next_action") || !due) throw new Error("请填写下一步动作和时间，保存后才会生成待办");
      await api(`/api/sales/customers/${cid}/followup`, { method: "POST", json: { followup: { interaction_method: method, contact_result: "normal", is_effective: true, summary: str("summary"), next_action: str("next_action"), next_followup_at: due } } });
      setCid(""); setPicked(""); setQ(""); setSearch(""); setMethod("phone"); setLen(0); saved("跟进已保存，下一步已生成待办");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section className="sales-panel wb-quick">
      <div className="wb-panel-head"><h2>快速记录跟进</h2><button onClick={() => setOpen(v => !v)}>{open ? "收起" : "展开"}</button></div>
      {open && <form onSubmit={submit} className="sales-form wb-quick-form" aria-label="快速记录跟进">{error && <p className="sales-alert" role="alert">{error}</p>}
        <label>客户<input value={cid ? picked : q} maxLength={100} placeholder="搜索客户名称、联系人或手机号…" required={!cid} onChange={e => { setPicked(""); setCid(""); setQ(e.target.value); clearTimeout(timer.current); timer.current = window.setTimeout(() => setSearch(e.target.value.trim()), 300); }} /></label>
        {!cid && !!q && <>{choices.error && <p role="alert">{choices.error}</p>}<ul className="sales-typeahead">{choices.data?.rows.slice(0, 6).map(c => <li key={c.id}><button type="button" onClick={() => { setCid(c.id); setPicked(c.customer_name); }}>{c.customer_name}<small>{c.customer_code || ""}{c.contact_name ? ` · ${c.contact_name}` : ""}</small></button></li>)}</ul>{choices.data?.rows.length === 0 && <p className="sales-note">{search ? "没有匹配客户，换个关键字试试。" : "输入关键字联想客户。"}</p>}</>}
        <label>沟通方式</label>
        <div className="wb-methods" role="radiogroup" aria-label="沟通方式">{[["phone", "电话"], ["wechat", "微信"], ["meeting", "面谈"], ["other", "其他"]].map(([v, label]) => <button key={v} type="button" aria-pressed={method === v} onClick={() => setMethod(v)}>{label}</button>)}</div>
        <label>沟通内容<textarea name="summary" rows={3} maxLength={500} required placeholder="请填写本次沟通的主要内容…" onChange={e => setLen(e.target.value.length)} /><small className="wb-counter">{len}/500</small></label>
        <label>下一步动作<input name="next_action" maxLength={255} placeholder="例如：电话确认报价方案" /></label>
        <label>下一步时间（北京时间）<input name="next_due" type="datetime-local" required /></label>
        <button className="sales-primary wb-save" disabled={busy} type="submit">{busy ? "正在保存…" : "保存并生成待办"}</button>
      </form>}
    </section>
  );
}
