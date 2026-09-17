"use client";

import { FormEvent, Fragment, ReactNode, useEffect, useRef, useState } from "react";
import CRM from "./crm";
import { currentMonth, longDate, money as baseMoney, stamp } from "./lib/format";
import { api, useData } from "./lib/api";
import {
  customerStatusLabels as statusLabels,
  interactionMethodLabels as methodLabels,
  opportunityStageLabels as oppStageLabels,
  taskSourceLabels as sourceLabels,
  taskTypeLabels as taskTypes,
} from "./lib/labels";
import type { AttentionPage, CustomerRow as Customer, FollowupRow as Follow, Metric, OrderRow as Order, Page, TaskPage, TaskRow as Task, User } from "./lib/types";
import { Empty, Icon, Modal, Panel, Pager, yoySpan } from "./sales/ui";
import { PerfChart } from "./sales/perf-chart";
import { QuickFollow } from "./sales/quick-follow";
import type { Data, DialogState, Route, Screen, TrendPoint } from "./sales/types";
import { TasksScreen } from "./sales/tasks-screen";
import { SalesDialog } from "./sales/sales-dialog";

/** 销售员端金额统一带 ¥ 前缀。 */
const money = (v: string | null | undefined) => baseMoney(v, { yuan: true });

type Work = { metrics: Metric[]; through: string; warnings: string[] };
type OrderDetail = {order_no:string;customer:string;amount:string;lines:{line_no:number;quantity:string;amount:string}[]};
type PerfPreset = "this"|"last"|"quarter"|"year";
type TopCustomer={id:string;name:string;amount:string|null;last_year:string|null;yoy:string|null};
type ProductRow={name:string;amount:string|null;yoy:string|null;customers:number|null};
type FunnelStage={stage:string;current:number|null;prev:number|null};
type RiskCount={kind:string;count:number};
type Performance={through:string|null;verified:boolean;warnings:string[];month_amount:string|null;target_amount:string|null;completion:string|null;last_year_amount:string|null;yoy:string|null;remaining:string|null;workdays_remaining:number|null;daily_required:string|null;risks:RiskCount[];trend:TrendPoint[];key_metrics:Record<string,string|null>;top_customers:TopCustomer[];structure:Record<string,string|number|null>;products:ProductRow[];funnel:FunnelStage[]};
type Source = {id:string;name:string};
type Analysis = {basis:string; through:string; warnings:string[]; trend:{date:string;value:string}[]; rows:{id:string;name:string;current:string}[];total_rows:number};
type OppRow = {id:string;customer_id:string;customer_name:string;opportunity_name:string;stage:string;estimated_amount:string|null;expected_close_date:string|null;created_at:string;products:{id:string;name:string}[]};
const titles:Record<Screen,string> = {workbench:"工作台",customers:"客户",tasks:"待办",performance:"我的业绩"};
function perfRange(preset:PerfPreset,month:string):{from:string;to:string;label:string} {const [y,m]=month.split("-").map(Number);const pad=(n:number)=>String(n).padStart(2,"0");const ym=(yy:number,mm:number)=>`${yy}-${pad(mm)}-01`;if(preset==="last"){const yy=m===1?y-1:y,mm=m===1?12:m-1;return {from:ym(yy,mm),to:ym(yy,mm),label:"上月"};}if(preset==="quarter")return {from:ym(y,Math.floor((m-1)/3)*3+1),to:ym(y,m),label:"本季度"};if(preset==="year")return {from:ym(y,1),to:ym(y,m),label:"今年"};return {from:ym(y,m),to:ym(y,m),label:"本月"};}
function readRoute():Route {const [path,query=""]=window.location.hash.slice(1).split("?");const p=new URLSearchParams(query);if(path==="sales"){const s=p.get("view") as Screen;return {screen:s in titles?s:"workbench",pool:p.get("pool")==="1",customerId:p.get("customer")||undefined,q:p.get("q")||undefined,taskView:p.get("tasks")||undefined};}if(path==="crm"){try{const e=JSON.parse(p.get("crm")||"{}");return {screen:e.tab==="tasks"?"tasks":"customers",pool:e.tab==="pool",customerId:e.customerId,taskView:e.taskView};}catch{return {screen:"customers"};}}if(path==="bi"&&p.get("tab")&&p.get("tab")!=="workbench")return {screen:"performance"};return {screen:"workbench"};}
function href(r:Route) {const p=new URLSearchParams({view:r.screen});if(r.pool)p.set("pool","1");if(r.customerId)p.set("customer",r.customerId);if(r.q)p.set("q",r.q);if(r.taskView)p.set("tasks",r.taskView);return "#sales?"+p;}

export default function SalesWorkspace({user,onSignOut}:{user:User;onSignOut:()=>Promise<void>}) {
 const [route,setRoute]=useState<Route>({screen:"workbench"}),[revision,setRevision]=useState(0),[query,setQuery]=useState(""),[offset,setOffset]=useState(0),[taskOffset,setTaskOffset]=useState(0),[taskView,setTaskView]=useState("today"),[month,setMonth]=useState(currentMonth),[source,setSource]=useState(""),[recentOffset,setRecentOffset]=useState(0),[showRecent,setShowRecent]=useState(false),[dialog,setDialog]=useState<DialogState|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [pageSize,setPageSize]=useState(20),[claimFilter,setClaimFilter]=useState(""),[poolIds,setPoolIds]=useState<string[]>([]),[levelFilter,setLevelFilter]=useState(""),[tagFilter,setTagFilter]=useState(""),[searchInput,setSearchInput]=useState("");
 const [perfPreset,setPerfPreset]=useState<PerfPreset>("this"),[perfMonths,setPerfMonths]=useState<6|12>(6),[showAllCustomers,setShowAllCustomers]=useState(false),[showAllProducts,setShowAllProducts]=useState(false),[allCustomerOffset,setAllCustomerOffset]=useState(0);
 useEffect(()=>{setOffset(0);setPoolIds([]);},[pageSize,claimFilter,levelFilter,tagFilter]);
 const searchTimer=useRef(0);
 useEffect(()=>{const restore=()=>{const r=readRoute();setRoute(r);setQuery(r.q||"");setSearchInput(r.q||"");setOffset(0);setTaskOffset(0);setTaskView(r.taskView||"today");};restore();window.addEventListener("popstate",restore);window.addEventListener("hashchange",restore);return()=>{window.removeEventListener("popstate",restore);window.removeEventListener("hashchange",restore);};},[]);
 function go(next:Route) {window.history.pushState(null,"",href(next));setRoute(next);if(next.screen==="workbench")setMonth(currentMonth());setQuery(next.q||"");setSearchInput(next.q||"");clearTimeout(searchTimer.current);setOffset(0);setTaskOffset(0);setTaskView(next.taskView||"today");setNotice("");if((next.pool||false)!==(route.pool||false))setLevelFilter(""),setTagFilter("");window.scrollTo({top:0});}
 function liveSearch(q:string) {const next:Route={screen:"customers",pool:route.pool,q:q||undefined};window.history.replaceState(null,"",href(next));setRoute(next);setQuery(q);setOffset(0);}
 const screen=route.screen;
 const [orderOffset,setOrderOffset]=useState(0),[orderId,setOrderId]=useState("");
 useEffect(()=>{setOrderOffset(0);setOrderId("");},[source,month]);
 const work=useData<Work>(["workbench","performance"].includes(screen)?`/api/bi/workbench/${user.id}?month=${month}-01`:null,revision);
 const taskData=useData<TaskPage>(screen==="tasks"?`/api/sales/tasks?view=${taskView}&limit=20&offset=${taskOffset}`:null,revision);
 const focusToday=useData<TaskPage>(screen==="workbench"?"/api/sales/tasks?view=today&limit=10":null,revision);
 const focusOverdue=useData<TaskPage>(screen==="workbench"?"/api/sales/tasks?view=overdue&limit=10":null,revision);
 const customers=useData<Page<Customer>>(screen==="customers"&&!route.customerId?`/api/sales/customers?pool=${!!route.pool}&q=${encodeURIComponent(route.q||"")}&offset=${offset}&limit=${pageSize}${route.pool&&claimFilter?`&claim=${claimFilter}`:""}${!route.pool&&levelFilter?`&level=${levelFilter}`:""}${!route.pool&&tagFilter?`&tag_id=${tagFilter}`:""}`:null,revision);
 const recent=useData<Page<Follow>>(screen==="workbench"||showRecent?`/api/sales/recent?limit=${showRecent?20:3}&offset=${showRecent?recentOffset:0}`:null,revision);
 const sources=useData<Source[]>(["workbench","performance"].includes(screen)?"/api/bi/sources":null,revision);
 const tagList=useData<{id:string;tag_name:string}[]>(screen==="customers"&&!route.pool?"/api/crm/tags":null,revision);
 const currentSource=sources.data?.some(s=>s.id===source)?source:sources.data?.[0]?.id||"";
 const attention=useData<AttentionPage>(screen==="workbench"&&currentSource?`/api/bi/attention?source_id=${currentSource}`:null,revision);
 const perfRangeValue=perfRange(perfPreset,month);
 const perf=useData<Performance>(screen==="performance"&&currentSource?`/api/sales/performance?source_id=${currentSource}&from=${perfRangeValue.from}&to=${perfRangeValue.to}&months=${perfMonths}`:null,revision);
 const allCustomers=useData<Analysis>(showAllCustomers&&screen==="performance"&&currentSource?`/api/bi/sales?source_id=${currentSource}&month=${month}-01&dimension=customer&basis=verified&offset=${allCustomerOffset}`:null,revision);
 const orders=useData<Page<Order>>(screen==="performance"&&currentSource?`/api/bi/orders?source_id=${currentSource}&month=${month}-01&offset=${orderOffset}`:null,revision);
 const orderDetail=useData<OrderDetail>(orderId?`/api/data/sales/orders/${orderId}`:null,revision);
 const oppRecent=useData<{rows:OppRow[];total:number}>(screen==="workbench"?"/api/sales/opportunities?days=30&limit=10":null,revision);
 async function run(action:()=>Promise<unknown>,message:string) {setBusy(true);setError("");try{await action();setNotice(message);setRevision(n=>n+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function record(task?:Task,customer?:Customer) {setDialog({kind:"follow",task,customer});}
 function completeTask(t:Task) {setDialog({kind:"complete",task:t});}
 function status(t:Task) {return t.status==="done"?"已完成":new Date(t.due_at)<new Date()?"已逾期":"待处理";}
 function recentTable() {return recent.data?.rows.length?<div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>跟进时间</th><th>客户名称</th><th>沟通方式</th><th>沟通摘要</th><th>下一步时间</th></tr></thead><tbody>{recent.data.rows.map(f=><tr key={f.id}><td>{stamp(f.occurred_at)}</td><td><button className="sales-customer-link" onClick={()=>go({screen:"customers",customerId:f.customer_id})}>{f.customer_name}</button></td><td><span className="wb-method">{methodLabels[f.interaction_method]||"其他"}</span></td><td>{f.summary||"未填写摘要"}</td><td>{f.next_followup_at?stamp(f.next_followup_at,false):"未安排"}</td></tr>)}</tbody></table></div>:<Empty>{recent.loading?"正在加载跟进…":"还没有跟进记录，完成客户沟通后可以记录在这里。"}</Empty>;}
 const states=[work,focusToday,focusOverdue,attention,taskData,customers,recent,sources,perf,allCustomers,orders,oppRecent];
 return <div className="sales-shell"><aside className="sales-sidebar"><a className="sales-brand" href={href({screen:"workbench"})} onClick={e=>{e.preventDefault();go({screen:"workbench"});}}><span>齐</span><strong>好客齐鲁</strong></a><nav aria-label="主导航">{(Object.keys(titles) as Screen[]).map(key=><a key={key} href={href({screen:key})} aria-current={screen===key?"page":undefined} onClick={e=>{e.preventDefault();go({screen:key});}}><Icon name={key}/>{titles[key]}</a>)}</nav><details className="sales-account"><summary><span className="sales-avatar">{user.display_name.slice(0,1)}</span>{user.display_name} · 销售员</summary><p>{user.username}</p><button onClick={()=>run(onSignOut,"")} disabled={busy}>退出登录</button></details></aside>
 <div className="sales-content"><header className="sales-topbar"><form onSubmit={e=>{e.preventDefault();go({screen:"customers",q:query.trim()});}} role="search"><Icon name="search"/><input aria-label="搜索客户名称或联系人" placeholder="搜索客户名称或联系人" value={query} onChange={e=>setQuery(e.target.value)} maxLength={100}/><button>搜索</button></form><time>{longDate()}</time></header>
 <main className="sales-main"><div className="sales-heading"><div><h1>{route.customerId?"客户详情":titles[screen]}</h1><p>{route.customerId?"客户资料、沟通记录与下一步安排。":screen==="workbench"?"今天先处理该做的事，再看结果。":screen==="customers"?"跟进已有客户，或从公海认养客户。":screen==="tasks"?"安排下一步，处理到期任务。":"查看个人目标完成情况与实际成交。"}</p></div>{!route.customerId&&(screen==="workbench"?<button onClick={()=>go({screen:"performance"})}>我的业绩 →</button>:screen!=="performance"&&<button className="sales-primary" onClick={()=>setDialog({kind:screen==="tasks"?"task":"follow"})}>{screen==="tasks"?"新建待办":"记录跟进"}</button>)}</div>
 {(error||states.some(s=>s.error))&&<div role="alert" className="sales-alert">{error||states.find(s=>s.error)?.error}<button onClick={()=>{setError("");setRevision(n=>n+1);}}>重试</button></div>}{notice&&<p className="sales-notice" role="status">{notice}</p>}
 {screen==="workbench"&&(()=>{const c=focusToday.data?.counts;const done=c?.done_today??0,total=done+(c?.today??0),pct=total?Math.round(done/total*100):0;
  const merged=new Map<string,Task>();[...(focusOverdue.data?.rows||[]),...(focusToday.data?.rows||[])].forEach(t=>merged.set(t.id,t));
  const pri=(t:Task)=>new Date(t.due_at)<new Date()?"high":t.priority==="urgent"||t.priority==="high"?"high":t.priority==="low"?"low":"med";
  const rank={"high":0,"med":1,"low":2} as const;
  const focus=[...merged.values()].sort((a,b)=>pri(a)===pri(b)?(a.due_at<b.due_at?-1:1):rank[pri(a)]-rank[pri(b)]);
  const riskN:Record<string,number>={};(attention.data?.rows||[]).forEach(r=>riskN[r.kind]=(riskN[r.kind]||0)+1);
  const riskItems=[["去年同月成交、本月尚未复购","去年同期成交、本月尚未成交"],["疑似流失","疑似流失的重点客户"],["跟进超期","超过跟进阈值未跟进的重点客户"]].map(([key,label])=>({key,label,n:riskN[key]||0})).filter(x=>x.n>0);
  const metricOf=(code:string)=>work.data?.metrics.find(m=>m.code===code);
  return <div className="wb-root">
   <div className="wb-top">
    <section className="sales-panel wb-overview"><h2>今日待办概览</h2><div className="wb-tiles">{[["今日待办",c?`${c.today}`:"—","blue"],["已逾期",c?`${c.overdue}`:"—","red"],["今日已完成",c?`${c.done_today}`:"—","green"],["本周待跟进",c?`${c.week}`:"—","gray"]].map(([label,v,tone])=><div key={label} className="wb-tile"><i className={`wb-dot ${tone}`} aria-hidden/><div><span>{label}</span><strong>{v}<small> 项</small></strong></div></div>)}</div></section>
    <section className="sales-panel wb-risk"><div className="wb-panel-head"><h2>重点提醒</h2><button onClick={()=>go({screen:"customers"})}>查看全部 →</button></div>
     {riskItems.length?<ul className="wb-risk-list">{riskItems.map(r=><li key={r.key}><button onClick={()=>go({screen:"customers"})}><span>{r.label}</span><strong>{r.n} 家</strong></button></li>)}</ul>:<Empty>{attention.loading?"正在检查客户风险…":attention.data?.warnings.length?"销售口径未核实，暂不判定客户流失风险。":"暂无风险提醒，客户跟进节奏良好。"}</Empty>}
    </section>
   </div>
   <div className="wb-core">
    <section className="sales-panel wb-focus"><div className="wb-panel-head"><h2>今天最该做的事（{focus.length}）</h2><button onClick={()=>go({screen:"tasks",taskView:"today"})}>查看全部 →</button></div>
     {focus.length?<div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>优先级</th><th>客户名称</th><th>任务内容</th><th>截止时间</th><th>客户等级</th><th>操作</th></tr></thead><tbody>{focus.map(t=>{const p=pri(t),over=p==="high"&&new Date(t.due_at)<new Date(),sameDay=new Date(t.due_at).toDateString()===new Date().toDateString();return <tr key={t.id}><td><span className={`wb-pri ${p}`}>{p==="high"?"高":p==="med"?"中":"低"}</span></td><td><strong>{t.customer_name||"个人待办"}</strong></td><td className="sales-task-title">{t.title}</td><td><span className={over?"sales-danger":""}>{over?"已逾期 ":sameDay?"今天 ":""}{stamp(t.due_at)}</span></td><td>{t.customer_level?<span className="sales-level">{t.customer_level}</span>:<span className="sales-dim">—</span>}</td><td><div className="sales-row-actions">{t.customer_id?<><button className="sales-mini-primary" disabled={busy} onClick={()=>record(t)}>记录跟进</button><button onClick={()=>go({screen:"customers",customerId:t.customer_id!})}>去处理</button></>:<button onClick={()=>go({screen:"tasks",taskView:"today"})}>去处理</button>}</div></td></tr>;})}</tbody></table></div>:<Empty>{focusToday.loading||focusOverdue.loading?"正在加载今天的任务…":"今天暂无待办。从右侧快速记录一次跟进，安排第一个下一步。"}</Empty>}
    </section>
    <div className="wb-side">
     <QuickFollow saved={(m)=>{setNotice(m);setRevision(n=>n+1);}}/>
     <section className="sales-panel wb-progress"><h2>今日执行进度</h2>{total?<div className="wb-progress-body"><div className="wb-ring" style={{background:`conic-gradient(#0b62d8 ${pct*3.6}deg,#e6edf6 0deg)`}} role="img" aria-label={`今日执行进度 ${pct}%`}><span>{pct}%</span></div><div className="wb-progress-text"><strong>已完成 {done} / {total}</strong><span>还有 {total-done} 项待完成</span><div className="sales-progress"><i style={{width:`${pct}%`}}/></div></div></div>:<Empty>{focusToday.loading?"正在统计…":"今天还没有安排待办。"}</Empty>}</section>
    </div>
   </div>
   <div className="wb-bottom">
    <Panel title="最近跟进" action={<button onClick={()=>{setShowRecent(true);setRecentOffset(0);}}>查看更多 →</button>}>{recentTable()}</Panel>
    <Panel title="本周客户动态" action={<button onClick={()=>go({screen:"performance"})}>查看更多 →</button>}><div className="wb-dynamics">{[["新增客户","CRM_NEW_CUSTOMERS"],["已报价客户","CRM_QUOTED_CUSTOMERS"],["成交客户","CRM_DEAL_CUSTOMERS"],["7天未跟进","CRM_STALE_CUSTOMERS"]].map(([label,code])=>{const m=metricOf(code);return <div key={code} className="wb-dyn"><span>{label}</span><strong>{m?.value!=null?m.value:"—"}<small> 家</small></strong></div>;})}</div><p className="sales-note">按本月累计口径统计；成交客户仅统计已核实销售单。</p></Panel>
   </div>
   <Panel title="本月商机" action={<button onClick={()=>go({screen:"customers"})}>查看客户 →</button>}>
    {oppRecent.loading?<Empty>正在加载商机…</Empty>:oppRecent.data?.rows.length?<div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>客户名称</th><th>商机</th><th>推荐产品</th><th>阶段</th><th>预计金额</th><th>预计成交</th></tr></thead><tbody>{oppRecent.data.rows.map(o=><tr key={o.id}><td><button className="sales-customer-link" onClick={()=>go({screen:"customers",customerId:o.customer_id})}>{o.customer_name}</button></td><td>{o.opportunity_name}</td><td>{o.products.length?o.products.map(p=><span key={p.id} className="sales-tag-chip">{p.name}</span>):<span className="sales-dim">—</span>}</td><td><span className={`sales-status ${o.stage==="won"?"won":""}`}>{oppStageLabels[o.stage]||o.stage}</span></td><td>{money(o.estimated_amount)}</td><td>{stamp(o.expected_close_date,false)}</td></tr>)}</tbody></table></div>:<Empty>{oppRecent.data?"最近 30 天暂无新商机。在客户详情里新增商机后会显示在这里。":"正在加载商机…"}</Empty>}
   </Panel>
  </div>;})()}
 {screen==="customers"&&(route.customerId?<div className="sales-detail"><button onClick={()=>go({screen:"customers"})}>← 返回客户列表</button><button className="sales-primary" onClick={()=>record(undefined,{id:route.customerId!,customer_name:"当前客户"} as Customer)}>记录跟进</button><CRM key={`${route.customerId}-${revision}`} role="sales" userId={user.id} entry={{tab:"customers",customerId:route.customerId}} embedded/></div>:<Panel title={route.pool?"客户公海":"我的客户"} action={<div className="sales-tabs"><button aria-pressed={!route.pool} onClick={()=>go({screen:"customers",q:route.q})}>我的客户</button><button aria-pressed={!!route.pool} onClick={()=>go({screen:"customers",pool:true,q:route.q})}>客户公海</button></div>}><div className="sales-list-toolbar"><form role="search" onSubmit={e=>{e.preventDefault();liveSearch(searchInput.trim());}}><input aria-label="搜索客户" placeholder="搜索客户" value={searchInput} maxLength={100} onChange={e=>{setSearchInput(e.target.value);clearTimeout(searchTimer.current);searchTimer.current=window.setTimeout(()=>liveSearch(e.target.value.trim()),400);}}/></form>{!route.pool&&<><label>等级<select aria-label="按客户等级筛选" value={levelFilter} onChange={e=>setLevelFilter(e.target.value)}><option value="">全部</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option><option value="none">未评级</option></select></label><label>标签<select aria-label="按标签筛选" value={tagFilter} onChange={e=>setTagFilter(e.target.value)}><option value="">全部</option>{tagList.data?.map(x=><option key={x.id} value={x.id}>{x.tag_name}</option>)}</select></label></>}<span>{route.q?`搜索“${route.q}” · `:""}共 {customers.data?.total??"—"} 位客户</span>{route.q&&<button onClick={()=>{setSearchInput("");liveSearch("");}}>清除搜索</button>}<label>每页<select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[10,20,50].map(n=><option key={n} value={n}>{n} 行</option>)}</select></label>{route.pool&&<label>认养状态<select value={claimFilter} onChange={e=>setClaimFilter(e.target.value)}><option value="">全部</option><option value="unclaimed">未认养</option><option value="claimed">已认养</option></select></label>}{route.pool&&<button className="sales-primary" disabled={busy||!poolIds.length} onClick={()=>run(async()=>{const r=await api<{claimed_count:number;skipped:string[]}>("/api/crm/customers/batch-claim",{method:"POST",json:{customer_ids:poolIds}});setPoolIds([]);},`已认养成功，可在“我的客户”查看`)}>一键认养（{poolIds.length}）</button>}<p>{route.pool?"勾选未认养客户可一键认养；同一客户允许多位同事认养。":"客户状态与报价阶段分开管理；商机在客户详情中维护。"}</p></div>{customers.loading?<Empty>正在加载客户…</Empty>:customers.data?.rows.length?<div className="sales-table-scroll"><table className="sales-table"><thead><tr>{route.pool&&<th><input type="checkbox" aria-label="全选本页可认养客户" checked={(()=>{const rows=customers.data?.rows||[];const claimable=rows.filter(c=>!c.claims.some(x=>x.user_id===user.id));return claimable.length>0&&claimable.every(c=>poolIds.includes(c.id));})()} onChange={e=>{const rows=customers.data?.rows||[];setPoolIds(ids=>e.target.checked?[...new Set([...ids,...rows.filter(c=>!c.claims.some(x=>x.user_id===user.id)).map(c=>c.id)])]:ids.filter(id=>!rows.some(c=>c.id===id)));}}/></th>}<th>客户名称</th>{route.pool?<><th>客户编码</th><th>认养人</th></>:<><th>标签</th><th>联系人</th><th>最近跟进</th><th>下一步计划</th><th>客户状态</th></>}<th>操作</th></tr></thead><tbody>{customers.data.rows.map(c=><tr key={c.id}>{route.pool&&<td><input type="checkbox" aria-label={`认养客户 ${c.customer_name}`} checked={poolIds.includes(c.id)} disabled={busy||c.claims.some(x=>x.user_id===user.id)} onChange={e=>setPoolIds(ids=>e.target.checked?[...new Set([...ids,c.id])]:ids.filter(id=>id!==c.id))}/></td>}<td><strong>{c.customer_name}</strong>{!route.pool&&c.customer_level&&<span className="sales-level" aria-label={`客户等级 ${c.customer_level}`}>{c.customer_level}</span>}{!route.pool&&c.customer_status&&<span className={`sales-status ${c.customer_status==="won"?"won":""}`}>{statusLabels[c.customer_status]||c.customer_status}</span>}{!route.pool&&c.claims.length>1&&<small>共同认养：{c.claims.map(x=>x.display_name).join("、")}</small>}</td>{route.pool?<><td>{c.customer_code||"CRM 潜客"}</td><td>{c.claims.map(x=>x.display_name).join("、")||"暂无"}</td></>:<><td>{c.tags.length?<>{c.tags.slice(0,2).map(t=><span key={t} className="sales-tag-chip">{t}</span>)}{c.tags.length>2&&<span className="sales-tag-chip more">+{c.tags.length-2}</span>}</>:<span className="sales-dim">未打标签</span>}</td><td>{c.contact_name||"未填写"}</td><td>{stamp(c.last_followup)}</td><td>{c.next_action||"未安排下一步"}{c.next_due&&<small>{stamp(c.next_due)}</small>}</td></>}<td><div className="sales-row-actions">{!route.pool?<><button onClick={()=>go({screen:"customers",customerId:c.id})}>查看客户</button><button onClick={()=>record(undefined,c)}>记录跟进</button></>:c.claims.some(x=>x.user_id===user.id)?<button onClick={()=>go({screen:"customers",customerId:c.id})}>已认养 · 查看</button>:<button disabled={busy} onClick={()=>run(()=>api(`/api/crm/customers/${c.id}/claim`,{method:"POST"}),"认养成功，可在我的客户查看")}>认养客户</button>}</div></td></tr>)}</tbody></table></div>:<Empty>{route.q?"没有匹配客户，请调整搜索条件。":route.pool?"公海暂无客户。":"暂无客户，请到客户公海认养已导入的精斗云客户。"}</Empty>}<Pager offset={offset} total={customers.data?.total||0} size={pageSize} onChange={setOffset}/></Panel>)}
 {screen==="tasks"&&<TasksScreen taskData={taskData} taskOffset={taskOffset} onOffsetChange={setTaskOffset} taskView={taskView} onViewChange={key=>{setTaskView(key);setTaskOffset(0);window.history.replaceState(null,"",href({...route,taskView:key}));}} go={go} record={record} completeTask={completeTask} onDefer={t=>setDialog({kind:"defer",task:t})} run={run} busy={busy}/>}
 {screen==="performance"&&(()=>{const p=perf.data,st=p?.structure;const oldRatio=st?.old_ratio!=null?Number(st.old_ratio):null,newRatio=st?.new_ratio!=null?Number(st.new_ratio):null;
  return <div className="perf-root">
   <div className="perf-toolbar">
    <div className="perf-presets" role="group" aria-label="统计期间">{([["this","本月"],["last","上月"],["quarter","本季度"],["year","今年"]] as [PerfPreset,string][]).map(([k,label])=><button key={k} aria-pressed={perfPreset===k} onClick={()=>setPerfPreset(k)}>{label}</button>)}</div>
    <label>统计月份<input type="month" max={currentMonth()} value={perfPreset==="this"?month:perfRangeValue.from.slice(0,7)} disabled={perfPreset!=="this"} onChange={e=>{setMonth(e.target.value||currentMonth());setPerfPreset("this");}}/></label>
    {(sources.data?.length||0)>1&&<label>交易来源<select value={currentSource} onChange={e=>setSource(e.target.value)}>{sources.data?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
   </div>
   {!sources.loading&&!sources.data?.length&&<Panel title="交易数据"><Empty>暂无可见交易来源。CRM 客户与跟进仍可使用，请联系老板核实销售人员映射。</Empty></Panel>}
   <div className="perf-hero-row">
    <section className="sales-panel perf-hero">
     {p?<div className="perf-hero-main">
      <div className="perf-hero-primary">
       <span className="perf-hero-label">{perfRangeValue.label}销售额</span>
       <strong className="perf-hero-amount">{money(p.month_amount)}</strong>
       <div className="perf-hero-target"><span>目标 {money(p.target_amount)}</span><div className="sales-progress" role="img" aria-label={p.completion!=null?`目标完成率 ${p.completion}%`:"目标完成率暂不可用"}><i style={{width:`${p.completion!=null?Math.max(0,Math.min(100,Number(p.completion))):0}%`}}/></div><span>完成率 {p.completion!=null?`${p.completion}%`:"—"}</span></div>
      </div>
      <div className="perf-hero-yoy"><span>同比（较去年同期）</span><strong className={`perf-yoy-value${p.yoy==null?"":Number(p.yoy)>=0?" up":" down"}`}>{p.yoy==null?"—":`${Number(p.yoy)>=0?"+":""}${p.yoy}%`}</strong><span>去年同期 {money(p.last_year_amount)}</span></div>
      <div className="perf-hero-aux">
       <div><span>距目标还差</span><strong>{money(p.remaining)}</strong></div>
       <div><span>剩余工作日</span><strong>{p.workdays_remaining!=null?`${p.workdays_remaining} 天`:"—"}</strong></div>
       <div><span>日均需完成</span><strong>{money(p.daily_required)}</strong></div>
      </div>
     </div>:<Empty>{perf.loading?"正在加载业绩…":"暂无业绩数据。"}</Empty>}
     <details className="sales-definition"><summary>业绩口径与数据状态</summary>{p&&<><p>截至 {p.through??"—"}{p.verified?" · 数据已核实":" · 数据待核实"}。</p>{p.warnings.map(w=><p key={w}>{w}</p>)}{p.last_year_amount===null&&<p>导入历史不足去年同期，同比暂不可比。</p>}</>}</details>
    </section>
    <section className="sales-panel perf-risk">
     <div className="wb-panel-head"><h2>需要重点关注</h2><button onClick={()=>go({screen:"customers"})}>查看全部 →</button></div>
     {p?.risks.length?<ul className="perf-risk-list">{p.risks.map(r=><li key={r.kind}><button onClick={()=>go({screen:"customers"})}><span>{r.kind}</span><strong>{r.count} 家</strong></button></li>)}</ul>:<Empty>{perf.loading?"正在加载…":"暂无客户风险提醒。"}</Empty>}
    </section>
   </div>
   <div className="perf-mid">
    <section className="sales-panel perf-trend">
     <div className="wb-panel-head"><h2>销售趋势</h2><div className="perf-trend-toggle">{([6,12] as const).map(n=><button key={n} aria-pressed={perfMonths===n} onClick={()=>setPerfMonths(n)}>{n===6?"近 6 个月":"近 12 个月"}</button>)}</div></div>
     {p?<PerfChart points={p.trend}/>:<Empty>{perf.loading?"正在加载趋势…":"暂无趋势数据。"}</Empty>}
     <p className="sales-note">当前月截至 {p?.through??"—"}，未结束月份不与完整历史月直接比较。</p>
    </section>
    <section className="sales-panel perf-key">
     <div className="wb-panel-head"><h2>{perfRangeValue.label}关键数据</h2></div>
     <ul className="perf-key-list">{[["成交客户数","deal_customers"],["新客户数","new_customers"],["跟进客户数","followup_customers"],["有效沟通","effective"],["报价客户数","quoted_customers"],["老客户复购","repeat_customers"]].map(([label,k])=><li key={k}><span>{label}</span><strong>{p?.key_metrics[k]??"—"}</strong></li>)}</ul>
    </section>
    <section className="sales-panel perf-top">
     <div className="wb-panel-head"><h2>TOP 5 客户</h2><button onClick={()=>{setAllCustomerOffset(0);setShowAllCustomers(true);}}>查看全部 →</button></div>
     {p?.top_customers.length?<div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>#</th><th>客户名称</th><th>{perfRangeValue.label}销售额</th><th>去年同期</th><th>同比</th></tr></thead><tbody>{p.top_customers.map((t,i)=><tr key={t.id}><td>{i+1}</td><td><button className="sales-customer-link" onClick={()=>go({screen:"customers",customerId:t.id})}>{t.name}</button></td><td>{money(t.amount)}</td><td>{money(t.last_year)}</td><td>{yoySpan(t.yoy)}</td></tr>)}</tbody></table></div>:<Empty>{perf.loading?"正在加载客户…":"暂无成交客户。"}</Empty>}
    </section>
   </div>
   <div className="perf-bottom">
    <section className="sales-panel perf-structure">
     <h2>客户结构</h2>
     {st?<><div className="perf-structure-bar" role="img" aria-label={oldRatio!=null||newRatio!=null?`老客户销售额占比 ${st.old_ratio??"—"}%，新客户销售额占比 ${st.new_ratio??"—"}%`:"客户结构暂无数据"}>{oldRatio==null&&newRatio==null?<i style={{width:"100%",background:"#d8dee7"}}/>:<>{oldRatio!=null&&<i style={{width:`${oldRatio}%`,background:"#0b62d8"}}><span>{st.old_ratio}%</span></i>}{newRatio!=null&&<i style={{width:`${newRatio}%`,background:"#2fa46a"}}><span>{st.new_ratio}%</span></i>}{(oldRatio==null||newRatio==null)&&<i style={{width:`${100-(oldRatio??0)-(newRatio??0)}%`,background:"#d8dee7"}}/>}</>}</div>
      <div className="perf-structure-legend"><span><i style={{background:"#0b62d8"}} aria-hidden/>老客户销售额</span><span><i style={{background:"#2fa46a"}} aria-hidden/>新客户销售额</span></div>
      <div className="perf-structure-stats"><div><span>新增客户</span><strong>{st.new_customers??"—"}</strong></div><div><span>新客户成交</span><strong>{st.new_deals??"—"}</strong></div><div><span>老客户复购</span><strong>{st.repeat_customers??"—"}</strong></div><div><span>TOP5客户贡献</span><strong>{st.top5_share!=null?`${st.top5_share}%`:"—"}</strong></div></div></>:<Empty>{perf.loading?"正在加载客户结构…":"暂无客户结构数据。"}</Empty>}
    </section>
    <section className="sales-panel perf-products">
     <div className="wb-panel-head"><h2>商品销售 TOP 5</h2><button onClick={()=>setShowAllProducts(true)}>查看全部 →</button></div>
     {p?.products.length?<table className="sales-table"><thead><tr><th>#</th><th>商品</th><th>{perfRangeValue.label}销售额</th><th>同比</th><th>成交客户数</th></tr></thead><tbody>{p.products.map((pr,i)=><tr key={pr.name}><td>{i+1}</td><td>{pr.name}</td><td>{money(pr.amount)}</td><td>{yoySpan(pr.yoy)}</td><td>{pr.customers??"—"}</td></tr>)}</tbody></table>:<Empty>{perf.loading?"正在加载商品…":"暂无商品销售数据。"}</Empty>}
    </section>
    <section className="sales-panel perf-funnel">
     <div className="wb-panel-head"><h2>{perfRangeValue.label}销售动作转化</h2></div>
     {p?.funnel.length?<div className="perf-funnel-flow">{p.funnel.map((f,i)=><Fragment key={f.stage}>{i>0&&<span className="perf-funnel-arrow" aria-hidden>→</span>}<div className="perf-funnel-stage"><span>{f.stage}</span><strong>{f.current??"—"}</strong>{f.prev!=null&&f.prev>0&&f.current!=null?<small>较上月 {f.current>=f.prev?"+":""}{f.current-f.prev}</small>:null}</div></Fragment>)}</div>:<Empty>{perf.loading?"正在加载转化数据…":"暂无转化数据。"}</Empty>}
     <p className="sales-note">有需求＝本月沟通结果为“沟通顺利”的去重客户数。</p>
    </section>
   </div>
   <details className="sales-definition perf-orders"><summary>精斗云交易记录（原始单据）</summary><p className="sales-note">原始单据金额与状态，不等于核实后的业绩；跟进记录在工作台单独查看。</p>{orders.loading?<Empty>正在加载交易记录…</Empty>:orders.data?.rows.length?<div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>日期</th><th>单号</th><th>原始金额</th><th>来源状态</th><th>操作</th></tr></thead><tbody>{orders.data.rows.map(o=><tr key={o.id}><td>{o.date}</td><td>{o.number}</td><td>{money(o.amount)}</td><td>{o.status}</td><td><button className="sales-customer-link" onClick={()=>setOrderId(o.id)}>查看明细</button></td></tr>)}</tbody></table></div>:<Empty>该期间暂无可见交易记录。</Empty>}<Pager offset={orderOffset} total={orders.data?.total||0} size={30} onChange={setOrderOffset}/></details>
  </div>;})()}
 </main></div>{orderId&&<Modal title="交易明细" close={()=>setOrderId("")}><div className="sales-order-detail">{orderDetail.loading&&<Empty>正在加载明细…</Empty>}{orderDetail.error&&<p role="alert">{orderDetail.error}</p>}{orderDetail.data&&<><h3>{orderDetail.data.order_no}</h3><p>{orderDetail.data.customer} · 原始金额 {money(orderDetail.data.amount)}</p><table className="sales-table"><thead><tr><th>行号</th><th>数量</th><th>原始金额</th></tr></thead><tbody>{orderDetail.data.lines.map(l=><tr key={l.line_no}><td>{l.line_no}</td><td>{l.quantity}</td><td>{money(l.amount)}</td></tr>)}</tbody></table></>}</div></Modal>}{dialog&&<SalesDialog state={dialog} user={user} close={()=>setDialog(null)} saved={(message)=>{setDialog(null);setNotice(message);setRevision(n=>n+1);}} switchToFollow={(t)=>setDialog({kind:"follow",task:t})}/>}{showRecent&&<Modal title="我的跟进记录" close={()=>setShowRecent(false)}>{recent.error&&<p role="alert">{recent.error}</p>}{recentTable()}<Pager offset={recentOffset} total={recent.data?.total||0} onChange={setRecentOffset}/></Modal>}{showAllCustomers&&<Modal title="全部成交客户" close={()=>setShowAllCustomers(false)}><p className="sales-note">按已核实销售单口径统计，与 TOP 5 客户同一数据来源。</p>{allCustomers.error&&<p role="alert">{allCustomers.error}</p>}{allCustomers.loading?<Empty>正在加载客户…</Empty>:allCustomers.data?.rows.length?<div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>#</th><th>客户名称</th><th>{perfRangeValue.label}销售额</th></tr></thead><tbody>{allCustomers.data.rows.map((r,i)=><tr key={r.id}><td>{allCustomerOffset+i+1}</td><td><button className="sales-customer-link" onClick={()=>{setShowAllCustomers(false);go({screen:"customers",customerId:r.id});}}>{r.name}</button></td><td>{money(r.current)}</td></tr>)}</tbody></table></div>:<Empty>暂无已核实成交数据。不会用示例数字补齐。</Empty>}<Pager offset={allCustomerOffset} total={allCustomers.data?.total_rows||0} onChange={setAllCustomerOffset}/></Modal>}{showAllProducts&&<Modal title="商品销售排行" close={()=>setShowAllProducts(false)}><p className="sales-note">业绩接口仅返回前 5，此处仅展示前 5，不做数据补齐。</p>{perf.data?.products.length?<table className="sales-table"><thead><tr><th>#</th><th>商品</th><th>{perfRangeValue.label}销售额</th><th>同比</th><th>成交客户数</th></tr></thead><tbody>{perf.data.products.map((pr,i)=><tr key={pr.name}><td>{i+1}</td><td>{pr.name}</td><td>{money(pr.amount)}</td><td>{yoySpan(pr.yoy)}</td><td>{pr.customers??"—"}</td></tr>)}</tbody></table>:<Empty>暂无商品销售数据。</Empty>}</Modal>}</div>;
}
