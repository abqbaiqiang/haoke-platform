"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { localTime } from "../lib/format";
import { api } from "./api";
import type { Field, Value } from "./types";

export function Editor({ title, fields, initial = {}, initialProducts = [], submit, save, cancel, autoProbability }: { title: string; fields: Field[]; initial?: Record<string, Value>; initialProducts?: { id: string; name: string }[]; submit: string; save: (data: Record<string, Value>) => Promise<void>; cancel?: () => void; autoProbability?: Record<string, number> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!cancel) return;
    const frame = requestAnimationFrame(() => {
      // 新建时按默认阶段预填默认成交概率（百分比）；已有值不覆盖。
      if (autoProbability) {
        const probability = formRef.current?.querySelector<HTMLInputElement>('input[name="probability"]');
        const stage = formRef.current?.querySelector<HTMLSelectElement>('select[name="stage"]');
        if (probability && stage && !probability.value) probability.value = String(Math.round((autoProbability[stage.value] ?? 0) * 100));
      }
      formRef.current?.querySelector('h3')?.focus({ preventScroll: true });
      formRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [title, !!cancel]);
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = e.currentTarget, fd = new FormData(form); setBusy(true); setError("");
    const data: Record<string, Value> = {};
    for (const f of fields) {
      if (f.type === "products") { data[f.key] = fd.getAll(f.key) as unknown as Value; continue; }
      if (f.type === "project") {
        data["project_id"] = (fd.get("project_id") as string) || null;
        data["project_name"] = ((fd.get("project_name") as string) || "").trim() || null;
        continue;
      }
      const raw = fd.get(f.key)?.toString() || "";
      data[f.key] = f.type === "checkbox" ? fd.has(f.key)
        : f.type === "percent" ? (raw ? String(Number(raw) / 100) : null)
        : f.type === "datetime-local" && raw ? new Date(raw + ":00+08:00").toISOString() : raw || null;
    }
    try { await save(data); form.reset(); } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); }
  }
  return (
    <form ref={formRef} className="crm-form" aria-label={title} onSubmit={handle}><h3 tabIndex={-1}>{title}</h3><div className="crm-fields">{fields.map(f => f.type === "products" ? <div key={f.key} className="products-field"><span>{f.label}（可多选）</span><ProductPicker initial={initialProducts} /></div> : f.type === "project" ? <div key={f.key} className="project-field"><span>{f.label}</span><ProjectNameInput defaultId={String(initial.project_id ?? "")} defaultName={String(initial.project_name ?? "")} /></div> : <label key={f.key}>{f.label}{f.type === "checkbox" ? <input name={f.key} type="checkbox" defaultChecked={!!initial[f.key]} /> : f.options ? <select name={f.key} required={f.required} defaultValue={String(initial[f.key] ?? f.options[0]?.[0] ?? "")} onChange={f.key === "stage" && autoProbability ? e => { const input = formRef.current?.querySelector<HTMLInputElement>('input[name="probability"]'); if (input) input.value = String(Math.round((autoProbability[e.target.value] ?? 0) * 100)); } : undefined}>{f.options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select> : f.type === "textarea" ? <textarea name={f.key} maxLength={f.maxLength || 4000} defaultValue={String(initial[f.key] ?? "")} /> : <input name={f.key} type={f.type === "percent" ? "number" : f.type || "text"} required={f.required} maxLength={f.maxLength || 255} step={f.step} min={f.min} max={f.max} defaultValue={f.type === "datetime-local" && initial[f.key] ? localTime(String(initial[f.key])) : f.type === "percent" ? (initial[f.key] === null || initial[f.key] === undefined || initial[f.key] === "" ? "" : String(Math.round(Number(initial[f.key]) * 100))) : String(initial[f.key] ?? "")} />}</label>)}</div>{error && <p role="alert" className="error">{error}</p>}<div className="crm-actions"><button className="primary" disabled={busy} type="submit">{busy ? "保存中…" : submit}</button>{cancel && <button type="button" onClick={cancel} disabled={busy}>取消编辑</button>}</div></form>
  );
}
function ProjectNameInput({ defaultId, defaultName }: { defaultId: string; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [picked, setPicked] = useState(defaultId ? defaultName : "");
  const [q, setQ] = useState("");
  const [list, setList] = useState<{ id: string; project_name: string; customer_count: number; product_summary: string }[]>([]);
  const timer = useRef(0);
  useEffect(() => { let live = true; api<{ id: string; project_name: string; customer_count: number; product_summary: string }[]>(`/projects/suggest?q=${encodeURIComponent(q)}`).then(d => { if (live) setList(d); }).catch(() => { }); return () => { live = false; }; }, [q]);
  return <div className="project-picker">
    <input name="project_id" type="hidden" defaultValue={defaultId} />
    <input aria-label="项目名称" value={name} maxLength={255} placeholder="输入项目名称，或输入前几个字选择历史项目…" autoComplete="off"
      onChange={e => { setName(e.target.value); setPicked(""); const input = (e.target.closest(".project-picker") as HTMLElement).querySelector<HTMLInputElement>('input[name="project_id"]'); if (input) input.value = ""; setQ(e.target.value.trim()); }} />
    {!!list.length && <ul className="project-suggest" role="listbox" aria-label="历史项目联想">
      {list.map(s => <li key={s.id}><button type="button" onClick={e => {
        const wrap = (e.currentTarget.closest(".project-picker") as HTMLElement);
        wrap.querySelector<HTMLInputElement>('input[name="project_id"]')!.value = s.id;
        setName(s.project_name); setPicked(s.project_name);
      }}>{s.project_name}<small>{s.customer_count ? `${s.customer_count} 家客户` : "尚无客户"}{s.product_summary ? ` · ${s.product_summary}` : ""}</small></button></li>)}
    </ul>}
    {picked && <small className="muted">已关联历史项目：{picked}。同一项目可推荐给多家客户；推荐产品时系统会提醒岔开。</small>}
  </div>;
}

function ProductPicker({ initial = [] }: { initial?: { id: string; name: string }[] }) {
  const [draft, setDraft] = useState<{ id: string; name: string }[]>(initial);
  const [q, setQ] = useState(""), [search, setSearch] = useState("");
  const timer = useRef(0);
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { let live = true; api<{ id: string; name: string }[]>(`/products?q=${encodeURIComponent(search)}&limit=30`).then(d => { if (live) setList(d); }).catch(() => { }); return () => { live = false; }; }, [search]);
  const toggle = (id: string, name: string) => setDraft(d => d.some(x => x.id === id) ? d.filter(x => x.id !== id) : [...d, { id, name }]);
  return (
    <div className="product-picker">
      <input aria-label="搜索产品" value={q} maxLength={100} placeholder="输入商品名称或编码搜索…"
        onChange={e => { setQ(e.target.value); clearTimeout(timer.current); timer.current = window.setTimeout(() => setSearch(e.target.value.trim()), 300); }}
        onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} />
      <div className="product-options">{(found(list, q, draft)).map(p => <button key={p.id} type="button" onClick={() => toggle(p.id, p.name)}>+ {p.name}</button>)}
        {!list.length && <small>{search ? "没有匹配的商品。" : "输入关键字搜索商品。"}</small>}</div>
      {draft.length > 0 && <div className="product-chips">{draft.map(p => <span key={p.id} className="product-chip">{p.name}<input type="checkbox" name="product_ids" value={p.id} checked readOnly hidden /> <button type="button" aria-label={`移除 ${p.name}`} onClick={() => toggle(p.id, p.name)}>×</button></span>)}</div>}
    </div>
  );
}
function found(list: { id: string; name: string }[], q: string, draft: { id: string; name: string }[]) { return list.filter(p => !draft.some(x => x.id === p.id)); }
