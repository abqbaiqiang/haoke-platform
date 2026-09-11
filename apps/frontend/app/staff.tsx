"use client";

import { FormEvent, useEffect, useState } from "react";

type Staff = { id: string; username: string; display_name: string; role_code: string; mobile: string | null; is_active: boolean; last_login_at: string | null };

const roles: Record<string, string> = { owner: "老板", manager: "销售经理", sales: "销售业务员", finance: "财务", admin: "系统管理员" };
const fmt = (v: string | null) => v ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "从未登录";

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(`/api/staff${path}`, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "操作失败，请重试");
  return data;
}

export default function Staff() {
  const [list, setList] = useState<Staff[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [passwordFor, setPasswordFor] = useState<Staff | null>(null);

  async function refresh() {
    setError("");
    try { setList(await api<Staff[]>("")) } catch (e) { setError(e instanceof Error ? e.message : "加载失败"); }
  }
  useEffect(() => { refresh(); }, []);

  async function act(fn: () => Promise<void>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); setNotice(message); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await act(async () => {
      await api("", "POST", { username: f.get("username"), display_name: f.get("display_name"), password: f.get("password"), mobile: f.get("mobile") || null });
      setEditing(null);
    }, "同事账号已创建，把账号和密码交给同事即可登录");
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const target = editing as Staff;
    await act(async () => {
      await api(`/${target.id}`, "PATCH", { display_name: f.get("display_name"), mobile: f.get("mobile") || null });
      setEditing(null);
    }, "同事信息已更新");
  }

  async function resetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const target = passwordFor as Staff;
    await act(async () => {
      await api(`/${target.id}`, "PATCH", { new_password: f.get("password") });
      setPasswordFor(null);
    }, "密码已重置，同事的旧登录会立即失效");
  }

  return <div className="staff"><p className="eyebrow">工作空间 / 人员管理</p><h1>同事账号</h1><p className="muted">为同事创建账号并管理密码。同事登录后只看到自己的客户、待办和销售数据。</p>
    {error && <p className="error" role="alert">{error}</p>}{notice && <p role="status" className="data-success">{notice}</p>}
    {editing !== "new" && <button className="primary" onClick={() => { setEditing("new"); setNotice(""); }}>新增同事账号</button>}
    {editing === "new" && <section className="card"><h2>新增同事</h2><form onSubmit={create}><div className="bi-form-grid">
      <label>登录账号（字母数字）<input name="username" required maxLength={64} pattern="[a-zA-Z0-9_.@-]+" /></label>
      <label>姓名<input name="display_name" required maxLength={100} /></label>
      <label>手机号（可空）<input name="mobile" maxLength={32} /></label>
      <label>初始密码（至少 12 位）<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
    </div><button className="primary" disabled={busy}>创建账号</button> <button type="button" onClick={() => setEditing(null)}>取消</button></form></section>}
    <section className="card"><div className="table-scroll"><table><thead><tr><th>姓名</th><th>账号</th><th>角色</th><th>手机号</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead><tbody>
      {list.map(s => <tr key={s.id}><td>{s.display_name}</td><td>{s.username}</td><td>{roles[s.role_code] || s.role_code}</td><td>{s.mobile || "—"}</td><td>{s.is_active ? "启用" : "已停用"}</td><td>{fmt(s.last_login_at)}</td><td>
        {s.role_code === "sales" && <>{editing !== s && <button onClick={() => { setEditing(s); setNotice(""); }}>编辑</button>}
          {!passwordFor && <button onClick={() => { setPasswordFor(s); setNotice(""); }}>重置密码</button>}
          <button disabled={busy} onClick={() => act(() => api(`/${s.id}`, "PATCH", { is_active: !s.is_active }), s.is_active ? "账号已停用，同事立即无法登录" : "账号已重新启用")}>{s.is_active ? "停用" : "启用"}</button></>}
      </td></tr>)}
    </tbody></table></div>{!list.length && <p>还没有同事账号，点击上方按钮创建。</p>}</section>
    {editing && editing !== "new" && <section className="card"><h2>编辑：{(editing as Staff).display_name}</h2><form onSubmit={saveEdit}><div className="bi-form-grid">
      <label>姓名<input name="display_name" required maxLength={100} defaultValue={(editing as Staff).display_name} /></label>
      <label>手机号（可空）<input name="mobile" maxLength={32} defaultValue={(editing as Staff).mobile || ""} /></label>
    </div><button className="primary" disabled={busy}>保存</button> <button type="button" onClick={() => setEditing(null)}>取消</button></form></section>}
    {passwordFor && <section className="card"><h2>重置密码：{passwordFor.display_name}</h2><form onSubmit={resetPassword}><div className="bi-form-grid">
      <label>新密码（至少 12 位）<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
    </div><button className="primary" disabled={busy}>确认重置</button> <button type="button" onClick={() => setPasswordFor(null)}>取消</button></form></section>}
    <p className="muted">停用同事不会删除任何业务数据；其名下客户与历史记录全部保留。账号操作均记录审计日志。</p>
  </div>;
}
