"use client";

import { useState } from "react";
import type { Role, Tag } from "../lib/types";
import { api } from "./api";

export function TagPicker({ tags, selected, busy, canCreate, onCreate, onSave }: { tags: Tag[]; selected: string[]; busy: boolean; canCreate: boolean; onCreate: (name: string) => Promise<Tag | undefined>; onSave: (ids: string[]) => void }) {
  const [draft, setDraft] = useState<string[]>(selected);
  const [name, setName] = useState("");
  const toggle = (id: string) => setDraft(d => d.includes(id) ? d.filter(x => x !== id) : [...d, id]);
  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tag = await onCreate(trimmed);
    setName("");
    if (tag) setDraft(d => d.includes(tag.id) ? d : [...d, tag.id]);
  }
  return (
    <div className="tag-picker">{tags.filter(t => t.is_active || draft.includes(t.id)).map(t => <button key={t.id} type="button" aria-pressed={draft.includes(t.id)} disabled={busy} onClick={() => toggle(t.id)}>{t.tag_name}{!t.is_active ? "（已停用）" : ""}</button>)}{canCreate && <span className="tag-create"><input aria-label="新建标签名称" value={name} maxLength={100} placeholder="新建标签" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); create(); } }} /><button type="button" disabled={busy || !name.trim()} onClick={create}>添加</button></span>}<button className="primary tag-save" disabled={busy} onClick={() => onSave(draft)}>保存标签</button></div>
  );
}

export function TagManager({ tags, busy, run, role, userId }: { tags: Tag[]; busy: boolean; run: (fn: () => Promise<unknown>) => void; role: Role; userId: string }) {
  const [name, setName] = useState(""), [group, setGroup] = useState(""), [edits, setEdits] = useState<Record<string, { tag_name: string; tag_group: string }>>({});
  const row = (t: Tag) => edits[t.id] || { tag_name: t.tag_name, tag_group: t.tag_group || "" };
  const update = (t: Tag, patch: Partial<{ tag_name: string; tag_group: string }>) => setEdits(s => ({ ...s, [t.id]: { ...row(t), ...patch } }));
  const manageAll = ["owner", "admin"].includes(role);
  const editable = (t: Tag) => manageAll || t.created_by === userId;
  return (
    <div className="tag-manager">
      <form className="tag-add" onSubmit={e => { e.preventDefault(); const n = name.trim(); if (!n) return; run(async () => { await api("/tags", "POST", { tag_name: n, tag_group: group.trim() || null }); setName(""); setGroup(""); }); }}>
        <input aria-label="新标签名称" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="新标签名称" />
        <input aria-label="新标签分组" value={group} maxLength={32} onChange={e => setGroup(e.target.value)} placeholder="分组（可选）" />
        <button className="primary" disabled={busy || !name.trim()}>添加标签</button>
      </form>
      <ul>{tags.map(t => { const d = row(t); const mine = editable(t); return <li key={t.id}>
        {mine ? <><input aria-label={`改名：${t.tag_name}`} value={d.tag_name} maxLength={100} disabled={busy} onChange={e => update(t, { tag_name: e.target.value })} />
          <input aria-label={`分组：${t.tag_name}`} value={d.tag_group} maxLength={32} disabled={busy} onChange={e => update(t, { tag_group: e.target.value })} />
          <button disabled={busy || !d.tag_name.trim()} onClick={() => run(() => api(`/tags/${t.id}`, "PUT", { tag_name: d.tag_name.trim(), tag_group: d.tag_group.trim() || null, is_active: t.is_active }))}>保存修改</button>
          <button disabled={busy || !d.tag_name.trim()} onClick={() => run(() => api(`/tags/${t.id}`, "PUT", { tag_name: d.tag_name.trim(), tag_group: d.tag_group.trim() || null, is_active: !t.is_active }))}>{t.is_active ? "删除" : "恢复标签"}</button></>
          : <><strong>{t.tag_name}</strong>{t.tag_group && <span className="muted">{t.tag_group}</span>}<span className="muted">他人创建，仅老板／管理员可改</span></>}
        {!t.is_active && <span className="muted">已删除（停用），历史保留</span>}
      </li>; })}</ul>
      <p className="muted">删除=停用：已打此标签的客户保留历史，仅从点选与筛选中隐藏；改名立即生效。标签由大家自行创建和维护：你只能修改自己创建的标签{manageAll ? "；你是老板／管理员，可管理全部标签" : ""}。</p>
    </div>
  );
}
