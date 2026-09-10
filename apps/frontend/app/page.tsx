"use client";

import { FormEvent, useEffect, useState } from "react";
import DataCenter from "./data-center";
import CRM from "./crm";
import BI from "./bi";

type Role = "owner" | "manager" | "sales" | "finance" | "admin";
type User = { id: string; username: string; display_name: string; role_code: Role; last_login_at: string | null };
type Identity = { user: User; scope_type: string; member_ids: string[]; timezone: string };
const roles: Record<Role, string> = { owner: "老板", manager: "销售经理", sales: "销售业务员", finance: "财务", admin: "系统管理员" };
const scopes: Record<string, string> = { all: "全部", team: "所属团队", self: "本人", custom: "指定授权", none: "未配置" };

export default function Home() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("home");

  async function refresh() {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) { setIdentity(null); return; }
    if (!response.ok) throw new Error("服务暂时不可用，请稍后重试");
    setIdentity(await response.json());
  }
  useEffect(() => { refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error?.message || "登录失败"); }
      form.reset(); await refresh(); setView("home");
    } catch (e) { setError(e instanceof Error ? e.message : "网络连接失败"); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok && response.status !== 401) throw new Error("退出失败，请重试");
      setIdentity(null); setView("home");
    } catch (e) { setError(e instanceof Error ? e.message : "网络连接失败"); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="loading" aria-live="polite">正在连接平台…</main>;
  if (!identity) return <main className="login-layout">
    <section className="intro"><div className="brand-mark">松</div><p className="eyebrow">SONGMAO · MANAGEMENT</p><h1>松茂经营管理平台</h1><p>让日常工作有序，让经营决策有据。</p><div className="intro-footer">公司内部平台 <span>Asia / Shanghai</span></div></section>
    <section className="login-panel"><form onSubmit={signIn}><p className="eyebrow">欢迎回来</p><h2>登录工作空间</h2><p className="muted">请使用管理员为您分配的账号。</p><label htmlFor="username">账号</label><input id="username" name="username" autoComplete="username" maxLength={64} required /><label htmlFor="password">密码</label><input id="password" name="password" type="password" autoComplete="current-password" maxLength={128} required />{error && <p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy} type="submit">{busy ? "正在登录…" : "登录"}</button><p className="footnote">忘记密码请联系系统管理员。</p></form><small>M3 · 销售工作台</small></section>
  </main>;
  const user = identity.user;
  return <div className="workspace"><aside><div className="brand"><div className="brand-mark small">松</div><strong>松茂经营管理平台</strong></div><p className="nav-label">工作空间</p><nav aria-label="主导航"><button aria-current={view === "bi" ? "page" : undefined} onClick={() => setView("bi")}>销售工作台</button><button aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}>平台首页</button><button aria-current={view === "account" ? "page" : undefined} onClick={() => setView("account")}>我的账号</button>{["owner", "admin"].includes(user.role_code) && <button aria-current={view === "system" ? "page" : undefined} onClick={() => setView("system")}>系统状态</button>}{["owner", "admin", "finance"].includes(user.role_code) && <button aria-current={view === "data" ? "page" : undefined} onClick={() => setView("data")}>数据中心</button>}<button aria-current={view === "crm" ? "page" : undefined} onClick={() => setView("crm")}>客户与待办</button></nav><div className="sidebar-bottom">M3 销售工作台 <span className="dot" /></div></aside>
    <div className="content"><header><span>{roles[user.role_code]}工作空间</span><div><span>{user.display_name}</span><button onClick={signOut} disabled={busy}>退出登录</button></div></header><main className="dashboard">{error && <p role="alert" className="error">{error}</p>}
      {view === "home" && <><p className="eyebrow">工作空间 / 首页</p><h1>欢迎，{user.display_name}</h1><p className="muted">从客户与待办开始，安排今天的联系与跟进。</p><div className="cards"><section className="card"><span>当前身份</span><h2>{roles[user.role_code]}</h2><p>主角色：{user.role_code}</p></section><section className="card"><span>访问范围</span><h2>{user.role_code === "admin" ? "系统管理" : scopes[identity.scope_type]}</h2><p>访问权限由服务器校验</p></section><section className="card"><span>平台阶段</span><h2>M3 销售工作台</h2><p>客户、跟进、待办与商机</p></section></div><section className="notice"><h2>平台正在分阶段建设</h2><p>数据中心支持客户、商品、销售和财务文件导入。管理员负责导入，老板可查看月度核对。</p><button onClick={() => setView("crm")}>进入客户与待办 →</button></section></>}
      {view === "account" && <><p className="eyebrow">工作空间 / 我的账号</p><h1>我的账号</h1><section className="card account"><dl><dt>登录账号</dt><dd>{user.username}</dd><dt>姓名</dt><dd>{user.display_name}</dd><dt>角色</dt><dd>{roles[user.role_code]}</dd><dt>最近登录</dt><dd>{user.last_login_at ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(user.last_login_at)) : "—"}</dd><dt>显示时区</dt><dd>Asia/Shanghai</dd></dl></section></>}
      {view === "system" && <SystemStatus />}{view === "data" && <DataCenter role={user.role_code} />}
      {view === "bi" && <BI role={user.role_code} userId={user.id} openCRM={() => setView("crm")} />}
      {view === "crm" && <CRM role={user.role_code} userId={user.id} />}
    </main><footer>松茂经营管理平台 · v0.4.0</footer></div></div>;
}

function SystemStatus() {
  const [status, setStatus] = useState("正在检查…");
  useEffect(() => { fetch("/api/admin/status").then(r => setStatus(r.ok ? "系统接口正常" : r.status === 401 ? "会话已过期，请重新登录" : "无权访问系统状态")).catch(() => setStatus("无法连接服务")); }, []);
  return <><p className="eyebrow">工作空间 / 系统状态</p><h1>系统状态</h1><section className="card"><h2>{status}</h2><p>当前版本 v0.4.0 · M3</p></section></>;
}
