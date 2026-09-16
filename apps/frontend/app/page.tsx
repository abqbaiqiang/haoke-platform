"use client";

import { FormEvent, useEffect, useState } from "react";
import DataCenter from "./data-center";
import CRM from "./crm";
import BI from "./bi";
import Overview from "./overview";
import Staff from "./staff";
import SalesWorkspace from "./sales";
import LoginIllustration from "./login-illustration";
import { dateTime } from "./lib/format";
import type { CRMEntry } from "./crm-navigation";

type Role = "owner" | "manager" | "sales" | "finance" | "admin";
type User = { id: string; username: string; display_name: string; role_code: Role; last_login_at: string | null };
type Identity = { user: User; scope_type: string; member_ids: string[]; timezone: string };
const roles: Record<Role, string> = { owner: "老板", manager: "销售经理", sales: "销售业务员", finance: "财务", admin: "系统管理员" };

export default function Home() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("home");
  const [biEntry, setBiEntry] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [crmEntry, setCRMEntry] = useState<CRMEntry | undefined>();
  const [remember, setRemember] = useState(false);
  const [preset, setPreset] = useState("");
  const [hint, setHint] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem("hqkl_remember");
    if (saved) { setRemember(true); setPreset(saved); }
  }, []);
  function navigate(next: string, tab = "", entry?: CRMEntry) {
    setView(next); setBiEntry(tab); setCRMEntry(entry); setMenuOpen(false);
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (entry) params.set("crm", JSON.stringify(entry));
    window.history.pushState(null, "", `#${next}${params.size ? "?" + params : ""}`);
  }
  function openCRM(entry?: CRMEntry) { navigate("crm", "", entry); }
  function openBI(tab = "") { navigate("bi", tab); }
  useEffect(() => {
    function restore() {
      const [next, query = ""] = window.location.hash.slice(1).split("?");
      if (!["home", "bi", "crm", "account", "staff", "system", "data"].includes(next)) return;
      const params = new URLSearchParams(query);
      setView(next); setBiEntry(params.get("tab") || ""); setMenuOpen(false);
      try { const entry = params.get("crm"); setCRMEntry(entry ? JSON.parse(entry) : undefined); } catch { setCRMEntry(undefined); }
    }
    restore(); window.addEventListener("popstate", restore); window.addEventListener("hashchange", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, []);

  async function refresh() {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (response.status === 401) { setIdentity(null); return; }
    if (!response.ok) throw new Error("服务暂时不可用，请稍后重试");
    const current: Identity = await response.json();
    setIdentity(current);
    if (!window.location.hash) setView(current.user.role_code === "sales" ? "crm" : "home");
  }
  useEffect(() => { refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error?.message || "登录失败"); }
      const remembered = data.get("username");
      if (remember && typeof remembered === "string") window.localStorage.setItem("hqkl_remember", remembered); else window.localStorage.removeItem("hqkl_remember");
      form.reset(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "网络连接失败"); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok && response.status !== 401) throw new Error("退出失败，请重试");
      setIdentity(null); setView("home"); setCRMEntry(undefined); setBiEntry(""); window.history.replaceState(null, "", window.location.pathname);
    } catch (e) { setError(e instanceof Error ? e.message : "网络连接失败"); }
    finally { setBusy(false); }
  }
  if (loading) return <main className="loading" aria-live="polite">正在连接平台…</main>;
  if (!identity) return <main className="login-page">
    <div className="login-sheen" aria-hidden="true" />
    <aside className="login-side" aria-hidden="true">
      <p className="login-side-cn">数据<br />连接业务<br />成就更好的<br />好客齐鲁</p>
      <span className="login-side-bar" />
      <p className="login-side-en">BETTER<br />OPERATION<br />BRIGHTER<br />TOGETHER</p>
    </aside>
    <header className="login-topbar">
      <div className="login-brand">
        <img src="/logo-mark.png" alt="好客齐鲁" className="login-logo" />
        <div className="login-brand-name"><strong>好客齐鲁</strong><small>HAO KE QI LU</small></div>
        <span className="login-divider" aria-hidden="true" />
        <div className="login-brand-sub"><strong>经营管理平台</strong><small>Management Platform</small></div>
      </div>
      <span className="login-lang" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" /></svg>
        <span>简体中文</span>
        <svg className="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </span>
    </header>
    <div className="login-body">
      <section className="login-hero">
        <p className="login-eyebrow">数字化 · 精细化 · 高效协同</p>
        <h1 className="login-slogan">让日常工作有序，<br />让经营决策有据。</h1>
        <p className="login-hero-sub">好客齐鲁 · 经营管理平台</p>
        <LoginIllustration />
      </section>
      <section className="login-card">
        <form onSubmit={signIn}>
          <h2>欢迎登录</h2>
          <p className="login-desc">使用您的账号访问好客齐鲁经营管理平台</p>
          <div className="login-field">
            <label htmlFor="username">账号</label>
            <div className="login-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              <input id="username" name="username" autoComplete="username" maxLength={64} required placeholder="请输入账号" defaultValue={preset} />
            </div>
          </div>
          <div className="login-field">
            <label htmlFor="password">密码</label>
            <div className="login-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" maxLength={128} required placeholder="请输入密码" />
              <button type="button" className="login-reveal" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>
                {showPassword
                  ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" /><circle cx="12" cy="12" r="3" /></svg>
                  : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7a11 11 0 0 1-2.4 3.6" /><path d="M6.2 6.6A11.4 11.4 0 0 0 3 12c0 2.5 4 7 9 7a9.6 9.6 0 0 0 4.2-.9" /></svg>}
              </button>
            </div>
          </div>
          <div className="login-row">
            <label className="login-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />记住我</label>
            <button type="button" className="login-forgot" onClick={() => setHint("请联系系统管理员重置密码。")}>忘记密码?</button>
          </div>
          {hint && !error && <p className="login-hint">{hint}</p>}
          {error && <p role="alert" className="error">{error}</p>}
          <button className="primary login-submit" disabled={busy} type="submit"><span>{busy ? "正在登录…" : "登录"}</span><span className="login-arrow" aria-hidden="true">→</span></button>
        </form>
        <p className="login-internal">仅限公司内部人员使用</p>
      </section>
    </div>
    <footer className="login-footer">
      <span className="login-footer-group"><span>© 2024 好客齐鲁经营管理平台</span><i className="login-footer-sep" aria-hidden="true" /><span>公司内部平台</span></span>
      <span className="login-footer-group"><span>Asia / Shanghai</span><i className="login-footer-sep" aria-hidden="true" /><span>帮助与支持</span></span>
    </footer>
  </main>;
  const user = identity.user;
  if (user.role_code === "sales") return <SalesWorkspace user={user} onSignOut={signOut} />;
  function nav(label: string, next: string, tab = "", entry?: CRMEntry) {
    const active = view === next && (next !== "bi" || (biEntry || "workbench") === (tab || "workbench")) && (next !== "crm" || (crmEntry?.tab || "customers") === (entry?.tab || "customers"));
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    if (entry) params.set("crm", JSON.stringify(entry));
    return <a href={`#${next}${params.size ? "?" + params : ""}`} aria-label={["销售分析","客户分析","团队执行","日历与分析设置","CRM 设置"].includes(label) ? "打开" + label : undefined} aria-current={active ? "page" : undefined} onClick={e => { e.preventDefault(); navigate(next, tab, entry); }}><NavIcon label={label} />{label}</a>;
  }
  return <div className={`workspace dash-root${menuOpen ? " navigation-open" : ""}`}><aside>
    <div className="brand"><div className="brand-mark small">齐</div><div><strong>好客齐鲁</strong><small>经营管理平台</small></div><button className="mobile-menu" aria-label="展开主导航" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>菜单</button></div>
    <nav aria-label="主导航"><p className="nav-label">工作台</p>{nav("销售工作台", "bi")}
      <p className="nav-label">客户管理</p>{nav("客户管理", "crm")}{nav("客户公海", "crm", "", {tab:"pool"})}{nav("商机管理", "crm", "", {tab:"opportunities"})}{nav("待办与跟进", "crm", "", {tab:"tasks"})}
      <p className="nav-label">业绩管理</p>{nav("经营总览", "home")}{nav("销售分析", "bi", "sales")}{nav("客户分析", "bi", "customers")}{["owner","manager"].includes(user.role_code) && nav("团队执行", "bi", "team")}
      <p className="nav-label">管理与设置</p>{["owner","admin","finance"].includes(user.role_code) && nav("数据中心", "data")}{user.role_code === "owner" && nav("人员管理", "staff")}{["owner","admin"].includes(user.role_code) && nav("日历与分析设置", "bi", "settings")}{["owner","admin"].includes(user.role_code) && nav("CRM 设置", "crm", "", {tab:"settings"})}{nav("我的账号", "account")}{["owner","admin"].includes(user.role_code) && nav("系统状态", "system")}
    </nav><div className="sidebar-bottom">{roles[user.role_code]}工作空间</div></aside>
    <div className="content"><header><span>{roles[user.role_code]}工作空间</span><div><span>{user.display_name}</span><button onClick={signOut} disabled={busy}>退出登录</button></div></header><main className="dashboard">{error && <p role="alert" className="error">{error}</p>}
      {view === "home" && (user.role_code === "admin"
        ? <><p className="eyebrow">工作空间 / 首页</p><h1>欢迎，{user.display_name}</h1><p className="muted">系统管理员不直接查看经营数据；请从下方进入管理功能。</p><div className="cards"><section className="card"><span>当前身份</span><h2>{roles[user.role_code]}</h2><p>权限由服务器校验</p></section><section className="card"><span>数据导入</span><h2>数据中心</h2><p>数据源、人员映射、导入历史</p><button onClick={() => navigate("data")}>进入数据中心 →</button></section><section className="card"><span>系统状态</span><h2>运行状况</h2><p>服务与数据库健康检查</p><button onClick={() => navigate("system")}>查看系统状态 →</button></section></div></>
        : <Overview role={user.role_code} openBI={openBI} openCRM={openCRM} />)}
      {view === "account" && <><p className="eyebrow">工作空间 / 我的账号</p><h1>我的账号</h1><section className="card account"><dl><dt>登录账号</dt><dd>{user.username}</dd><dt>姓名</dt><dd>{user.display_name}</dd><dt>角色</dt><dd>{roles[user.role_code]}</dd><dt>最近登录</dt><dd>{dateTime(user.last_login_at, "—", "medium")}</dd><dt>显示时区</dt><dd>Asia/Shanghai</dd></dl></section></>}
      {view === "system" && <SystemStatus />}{view === "data" && <DataCenter role={user.role_code} />}
      {view === "staff" && user.role_code === "owner" && <Staff />}
      {view === "bi" && <BI entryTab={biEntry} onTabChange={openBI} role={user.role_code} userId={user.id} openCRM={openCRM} />}
      {view === "crm" && <CRM key={JSON.stringify(crmEntry)} role={user.role_code} userId={user.id} entry={crmEntry} />}
    </main><footer>好客齐鲁经营管理平台 · v0.5.0</footer></div></div>;
}

function SystemStatus() {
  const [status, setStatus] = useState("正在检查…");
  useEffect(() => { fetch("/api/admin/status").then(r => setStatus(r.ok ? "系统接口正常" : r.status === 401 ? "会话已过期，请重新登录" : "无权访问系统状态")).catch(() => setStatus("无法连接服务")); }, []);
  return <><p className="eyebrow">工作空间 / 系统状态</p><h1>系统状态</h1><section className="card"><h2>{status}</h2><p>当前版本 v0.5.0</p></section></>;
}

const navIconPaths: Record<string, string[]> = {
  "销售工作台": ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  "客户管理": ["M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  "客户公海": ["M12 2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"],
  "商机管理": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z", "M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"],
  "待办与跟进": ["M9 11.5l2 2 4.5-4.5", "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"],
  "经营总览": ["M21.2 15.9A10 10 0 1 1 8 2.8", "M22 12A10 10 0 0 0 12 2v10z"],
  "销售分析": ["M18 20V10", "M12 20V4", "M6 20v-6"],
  "客户分析": ["M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M20 21v-2a4 4 0 0 0-3-3.9", "M15.5 3.1a4 4 0 0 1 0 7.8"],
  "团队执行": ["M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2", "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M21 21v-2a4 4 0 0 0-3-3.9"],
  "数据中心": ["M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z", "M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6", "M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"],
  "人员管理": ["M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M16 8l2 2 4-4"],
  "日历与分析设置": ["M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M16 2v4", "M8 2v4", "M4 10h16"],
  "CRM 设置": ["M4 21v-6", "M4 11V3", "M12 21v-9", "M12 8V3", "M20 21v-4", "M20 13V3", "M2 13h4", "M10 10h4", "M18 15h4"],
  "我的账号": ["M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  "系统状态": ["M22 12h-4l-3 9L9 3l-3 9H2"],
};
function NavIcon({ label }: { label: string }) {
  const paths = navIconPaths[label] || navIconPaths["销售工作台"];
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths.map(d => <path key={d} d={d} />)}</svg>;
}
