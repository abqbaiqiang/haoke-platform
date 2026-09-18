"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { CRMEntry } from "./crm-navigation";
import { dateTime, dayDiff } from "./lib/format";
import { api } from "./crm/api";
import { Editor } from "./crm/editor";
import { TagManager, TagPicker } from "./crm/tags";
import { TaskList, OppList, FollowList } from "./crm/lists";
import { DetailSummary } from "./crm/detail/summary";
import { DetailOverview } from "./crm/detail/overview";
import { DetailSections } from "./crm/detail/sections";
import { money, relLabel, text } from "./crm/shared";
import type { Detail, Field, Profile, Value } from "./crm/types";
import type { Contact, CrmPerson as Person, CrmSettings as Settings, Customer, Followup as Follow, Opportunity, Role, Tag, Task } from "./lib/types";
import {
  contactResultOptions as results,
  crmActivityLabels,
  decisionRoleOptions as decisionRoles,
  interactionMethodOptions as methods,
  lifecycleOptions as lifecycle,
  opportunityStageFlowOptions as stageFlow,
  opportunityStageOptions as stages,
} from "./lib/labels";



export default function CRM({role, userId, entry, embedded=false}: {role: Role; userId: string; entry?: CRMEntry; embedded?:boolean}) {
  const [workOffset,setWorkOffset]=useState(0), [historyOffset,setHistoryOffset]=useState(0);
  const [personFilter,setPersonFilter]=useState(entry?.personId||""), [openOnly,setOpenOnly]=useState(entry?.openOnly||false), [quickFollowup,setQuickFollowup]=useState(false);
  const [tab,setTab]=useState<string>(entry?.tab||"customers"), [rows,setRows]=useState<Customer[]>([]), [total,setTotal]=useState(0), [q,setQ]=useState(""), [search,setSearch]=useState(""), [offset,setOffset]=useState(0), [tagFilter,setTagFilter]=useState(""), [levelFilter,setLevelFilter]=useState(""), [pageSize,setPageSize]=useState(30);
  const [people,setPeople]=useState<Person[]>([]), [tags,setTags]=useState<Tag[]>([]), [config,setConfig]=useState<Settings|null>(null), [selected,setSelected]=useState<string|null>(entry?.customerId||null), [detail,setDetail]=useState<Detail|null>(null);
  const [tasks,setTasks]=useState<Task[]>([]), [view,setView]=useState<string>(entry?.taskView||"today"), [opps,setOpps]=useState<Opportunity[]>([]), [follows,setFollows]=useState<Follow[]>([]), [edit,setEdit]=useState<{kind:string; id?:string}|null>(null);
  const [summary,setSummary]=useState<{open_count:number;open_amount:string;weighted_amount:string;expected_this_month:number;stagnant_count:number}|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null), [error,setError]=useState(""), [notice,setNotice]=useState(""), [loading,setLoading]=useState(false), [busy,setBusy]=useState(false), [revision,setRevision]=useState(0), [candidates,setCandidates]=useState<Customer[]>([]);
  const [detailTab,setDetailTab]=useState<string>("overview");
  const [poolBulk,setPoolBulk]=useState(""), [tagMgr,setTagMgr]=useState(false);
  const processWrite = ["manager","sales"].includes(role), manage = ["owner","manager","admin"].includes(role), customerWrite=role!=="finance";
  const personOptions: [string,string][] = people.map(p=>[p.id,p.display_name]);
  const name = (id: string | null) => people.find(p=>p.id===id)?.display_name || (id === userId ? "我" : id ? "历史负责人" : "未分配");
  const refresh = () => setRevision(x=>x+1);
  const [ownership,setOwnership]=useState("");
  const [batchIds,setBatchIds]=useState<string[]>([]);
  const [batchOwner,setBatchOwner]=useState("");
  const [batchReason,setBatchReason]=useState("");
  const [selecting,setSelecting]=useState(false);
  const selectionVersion=useRef(0);
  const [claimFilter,setClaimFilter]=useState("");
  const [poolIds,setPoolIds]=useState<string[]>([]);
  const canAssign = ["owner","admin"].includes(role);
  const assigning = canAssign && tab==="customers" && ["unassigned","public_pool"].includes(ownership) && !selected;
  const claiming = processWrite && tab==="pool" && !selected;
  function customerQuery(start:number,limit:number=pageSize) {
    return new URLSearchParams({q:search,pool:String(tab==="pool"),offset:String(start),limit:String(limit),
      ...(tagFilter?{tag_id:tagFilter}:{}),...(levelFilter?{level:levelFilter}:{}),
      ...(tab==="customers"&&ownership?{ownership}: {}),
      ...(tab==="pool"&&claimFilter?{claim:claimFilter}:{})});
  }
  useEffect(()=>{selectionVersion.current++;setBatchIds([]);setSelecting(false);setPoolIds([]);},[search,tagFilter,levelFilter,ownership,claimFilter,tab,selected,revision]);
  const claimable=(c:Customer)=>!c.claims?.some(x=>x.user_id===userId);
  const pageClaimable=rows.filter(claimable);
  async function claimBatch() {
    await act(async()=>{
      const r=await api<{claimed_count:number;skipped:string[]}>("/customers/batch-claim","POST",{customer_ids:poolIds});
      setPoolIds([]);
      setNotice(`已认养 ${r.claimed_count} 个客户${r.skipped.length?`；跳过 ${r.skipped.length} 个（已被你认养或不在公海）`:""}，可在“我的客户”查看。`);
    },"");
  }
  const assignable=(rows:Customer[])=>rows.filter(c=>!c.claims?.length);
  const pageAssignable=assignable(rows);
  async function selectAllResults() {
    const version=selectionVersion.current;
    setSelecting(true);setError("");
    try {
      const ids=new Set<string>();
      for(let start=0;;start+=100) {
        const data=await api<{rows:Customer[];total:number}>(`/customers?${customerQuery(start,100)}`);
        if(version!==selectionVersion.current)return;
        if(data.total>1000)throw new Error("单次最多分配 1000 个客户，请缩小筛选范围。");
        assignable(data.rows).forEach(c=>ids.add(c.id));
        if(start+data.rows.length>=data.total || !data.rows.length)break;
      }
      setBatchIds([...ids]);
    }catch(e){if(version===selectionVersion.current)setError((e as Error).message);}
    finally{if(version===selectionVersion.current)setSelecting(false);}
  }
  async function assignBatch(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await act(async()=>{
      const result=await api<{assigned_count:number}>("/customers/batch-assign","POST",{customer_ids:batchIds,owner_user_id:batchOwner,reason:batchReason});
      setBatchIds([]);setBatchReason("");setOffset(0);
      setNotice(`已将 ${result.assigned_count} 个客户分配给 ${name(batchOwner)}，销售可在“我的客户”查看。`);
    }, "");
  }

  useEffect(()=>{if(detail&&quickFollowup){setEdit({kind:"followup"});setQuickFollowup(false);}},[detail,quickFollowup]);
  function rememberCustomer(id: string | null) {
    if (embedded) return;
    const params = new URLSearchParams();
    if (id) params.set("crm", JSON.stringify({tab:"customers",customerId:id}));
    window.history.pushState(null, "", `#crm${params.size ? "?" + params : ""}`);
  }
  function open(id: string, followup=false) { rememberCustomer(id); if(selected===id&&historyOffset===0)refresh(); setQuickFollowup(followup); setHistoryOffset(0); setSelected(id); setDetail(null); setProfile(null); setEdit(null); setNotice(""); window.scrollTo({top:0,behavior:"instant"}); }
  useEffect(()=>{ let live=true; setLoading(true); setError("");
    async function load() {
      const [p,t,c]=await Promise.all([api<Person[]>("/people"),api<Tag[]>("/tags"),api<Settings>("/settings")]);
      if (!live) return; setPeople(p); setTags(t); setConfig(c);
      if (selected) { const d=await api<Detail>(`/customers/${selected}?history_offset=${historyOffset}`); if(live)setDetail(d); const pr=await fetch(`/api/bi/customer-profile/${selected}`,{cache:"no-store"}); if(live){setProfile(pr.ok? await pr.json(): null);} }
      else if(tab==="customers" || tab==="pool") { const data=await api<{rows:Customer[];total:number}>(`/customers?${customerQuery(offset)}`); if(live){setRows(data.rows);setTotal(data.total);} }
      else if(tab==="tasks") {const data=await api<Task[]>(`/tasks?view=${view}&offset=${workOffset}${personFilter?"&assignee_user_id="+encodeURIComponent(personFilter):""}`);if(live)setTasks(data);}
      else if(tab==="opportunities") {const [data,sum]=await Promise.all([api<Opportunity[]>(`/opportunities?offset=${workOffset}${personFilter?"&owner_user_id="+encodeURIComponent(personFilter):""}${openOnly?"&status=open":""}`),api<{open_count:number;open_amount:string;weighted_amount:string;expected_this_month:number;stagnant_count:number}>("/opportunities/summary")]);if(live){setOpps(data);setSummary(sum);}}
      else if(tab==="followups") {const data=await api<Follow[]>(`/followups?offset=${workOffset}`);if(live)setFollows(data);}
    }
    load().catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);}); return ()=>{live=false;};
  },[tab,selected,search,offset,view,revision,tagFilter,levelFilter,claimFilter,workOffset,historyOffset,personFilter,openOnly,ownership,pageSize]);
  async function act(run:()=>Promise<unknown>, message="已保存") {setBusy(true);setError("");setNotice("");try{await run();if(message)setNotice(message);refresh();}catch(e){setError(e instanceof Error?e.message:"操作失败");}finally{setBusy(false);}}
  async function save(path:string,method:string,data:unknown) {await api(path,method,data);setEdit(null);setNotice("已保存，操作历史已保留");refresh();}
  const customer = detail?.customer;
  return <section className="crm"><p className="eyebrow">工作空间 / 轻量 CRM</p><h1>{selected ? "客户 360" : "客户与待办"}</h1><p className="muted">记录客户关系和下一步安排。正式交易以精斗云为准。</p>
    <div className="data-tabs">{[["customers",role==="sales"?"我的客户":"客户列表"],...(role!=="finance"?[["pool","客户公海"],["opportunities","项目列表"],["followups","跟进记录"],["tasks","我的待办"]]:[]),...(["owner","admin"].includes(role)?[["settings","CRM 设置"]]:[])].map(([key,label])=><button key={key} aria-pressed={tab===key&&!selected} onClick={()=>{setTab(key);setQuickFollowup(false);setWorkOffset(0);setHistoryOffset(0);setSelected(null);rememberCustomer(null);setDetail(null);setEdit(null);setOffset(0);setNotice("");}}>{label}</button>)}</div>
    {error && <p role="alert" className="error">{error}<button onClick={refresh}>重试</button></p>}{notice && <p role="status" className="data-success">{notice}</p>}{loading && <p role="status">正在加载…</p>}
    {!selected && tab==="customers" && canAssign && <section className="assignment-help"><strong>导入客户无需重建</strong><p>导入的客户已自动进入“客户公海”，销售可在公海自行认养（同一客户允许多位同事认养，认养人可见）。也可按“公海／未分配”筛选后，在下方勾选客户直接指定负责人。</p><label>客户归属<select value={ownership} disabled={busy} onChange={e=>{setOwnership(e.target.value);setOffset(0);}}><option value="">全部归属</option><option value="unassigned">未分配</option><option value="owned">已分配</option><option value="public_pool">公海</option></select></label></section>}
    {assigning && <form className="batch-assignment" aria-label="批量分配客户" onSubmit={assignBatch}><div className="crm-actions"><button type="button" disabled={busy||loading||selecting||!assignable(rows).length} onClick={()=>setBatchIds(ids=>[...new Set([...ids,...assignable(rows).map(c=>c.id)])])}>选择本页</button><button type="button" disabled={busy||loading||selecting||!total||total>1000} onClick={selectAllResults}>{selecting?"正在选择…":`选择全部筛选结果（${total}）`}</button><button type="button" disabled={busy||selecting||!batchIds.length} onClick={()=>setBatchIds([])}>清空选择</button><strong aria-live="polite">已选 {batchIds.length} 个客户</strong></div>{total>1000&&<p>单次最多分配 1000 个客户，请按名称、等级或标签缩小范围。</p>}<p className="muted">已被认养的客户不在勾选范围，如需调整请打开客户使用“分配／转交／公海”。</p><div className="crm-fields"><label>分配给销售<select required value={batchOwner} disabled={busy} onChange={e=>setBatchOwner(e.target.value)}><option value="">请选择负责人</option>{personOptions.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>分配说明<input required maxLength={500} value={batchReason} disabled={busy} onChange={e=>setBatchReason(e.target.value)} placeholder="例如：现有客户首次分配"/></label></div><p>本次将 {batchIds.length} 个公海／未分配客户交给 {batchOwner?name(batchOwner):"待选择的负责人"}；已有的认养记录与分配历史都会保留。</p><button className="primary" disabled={busy||selecting||loading||!batchIds.length||!batchOwner||!batchReason.trim()}>{busy?"正在分配…":"确认批量分配"}</button></form>}
    {!selected && tab==="customers" && role==="sales" && !loading && !rows.length && !search && <p className="assignment-help">还没有分配给你的客户。请到“客户公海”认养已导入的精斗云客户。</p>}
    {!selected && (tab==="customers" || tab==="pool") && <><div className="crm-search"><form onSubmit={e=>{e.preventDefault();setSearch(q);setOffset(0);}}><label>搜索客户<input value={q} onChange={e=>setQ(e.target.value)} placeholder="名称或客户编码" maxLength={100}/></label><button type="submit">搜索</button></form><label>客户等级<select value={levelFilter} onChange={e=>{setLevelFilter(e.target.value);setOffset(0);}}><option value="">全部等级</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option><option value="none">未评级</option></select></label><label>筛选标签<select value={tagFilter} onChange={e=>{setTagFilter(e.target.value);setOffset(0);}}><option value="">全部标签</option>{tags.map(t=><option key={t.id} value={t.id}>{t.tag_name}</option>)}</select></label>{claiming&&<label>认养状态<select value={claimFilter} onChange={e=>{setClaimFilter(e.target.value);setOffset(0);}}><option value="">全部</option><option value="unclaimed">未认养</option><option value="claimed">已认养</option></select></label>}{processWrite && tab==="customers" && config?.allow_prospect_create && <button disabled={loading} onClick={()=>setEdit({kind:"prospect"})}>新增潜客</button>}{manage && tab==="pool" && <button disabled={loading} onClick={()=>setEdit({kind:"pool"})}>录入公海客户</button>}{claiming&&<button className="primary" disabled={busy||loading||!poolIds.length} onClick={claimBatch}>一键认养（{poolIds.length}）</button>}</div>
      {edit?.kind==="prospect" && <Editor title="新增潜客" fields={[{key:"customer_name",label:"潜客名称",required:true},{key:"mobile",label:"联系电话",maxLength:32},{key:"remark",label:"客户备注",type:"textarea"}]} submit="创建潜客" cancel={()=>setEdit(null)} save={async d=>{const r=await api<{customer:Customer;duplicate_warning:boolean}>("/customers","POST",d);open(r.customer.id);setNotice(r.duplicate_warning?"已创建。存在名称或电话相同的客户，请核实；系统未自动合并。":"潜客已创建");}} />}
      {edit?.kind==="pool" && <Editor title="录入公海客户" fields={[{key:"customer_name",label:"客户名称",required:true},{key:"mobile",label:"联系电话",maxLength:32},{key:"remark",label:"客户备注",type:"textarea"}]} submit="录入公海" cancel={()=>setEdit(null)} save={async d=>{const r=await api<{customer:Customer;duplicate_warning:boolean}>("/customers/pool","POST",d);setEdit(null);setNotice(r.duplicate_warning?"已录入公海。存在名称或电话相同的客户，请核实；系统未自动合并。":"已录入公海，销售可立即认养");refresh();}} />}
      {!selected && tab==="pool" && manage && <section className="card data-section" aria-label="批量录入公海客户"><h2>批量录入公海客户</h2><p className="muted">每行一个客户：名称,电话,备注（电话、备注可省略）。与现有客户同名或同电话的行会自动跳过。精斗云正式客户请走“数据中心”按数据源导入，导入后自动进入公海。</p><form onSubmit={e=>{e.preventDefault();const items=poolBulk.split(/\n+/).map(l=>l.split(/[,，]/)).filter(p=>p[0]?.trim()).map(p=>({customer_name:p[0].trim(),mobile:(p[1]||"").trim()||null,remark:p.slice(2).join(",").trim()||null}));if(items.length)act(async()=>{const r=await api<{created_count:number;duplicate_names:string[]}>("/customers/pool-import","POST",{items});setPoolBulk("");setNotice(`已录入 ${r.created_count} 个公海客户${r.duplicate_names.length?`；跳过重复 ${r.duplicate_names.length} 个：${r.duplicate_names.slice(0,10).join("、")}${r.duplicate_names.length>10?"等":""}`:""}；销售可在本页认养。`);},"");}}><textarea value={poolBulk} onChange={e=>setPoolBulk(e.target.value)} rows={5} maxLength={20000} aria-label="批量录入列表" placeholder={"山东鲁锦集团有限公司,0531-8888888,老客户介绍\n济南锦礼商贸"} /><button className="primary" disabled={busy||loading||!poolBulk.trim()}>{busy?"正在录入…":`解析并录入（${poolBulk.split(/\n+/).filter(l=>l.split(/[,，]/)[0]?.trim()).length} 行）`}</button></form></section>}
      {tab==="pool" && <p className="muted">认养后客户进入“我的客户”；同一客户允许多位同事认养，认养人相互可见，记录完整保留。自动回收未启用。</p>}<div className="customer-table-wrap"><table className="customer-table"><thead><tr>{assigning&&<th><input type="checkbox" aria-label="全选本页客户" checked={pageAssignable.length>0?pageAssignable.every(c=>batchIds.includes(c.id)):false} disabled={busy||selecting||loading} onChange={e=>setBatchIds(ids=>e.target.checked?[...new Set([...ids,...pageAssignable.map(c=>c.id)])]:ids.filter(id=>!pageAssignable.some(c=>c.id===id)))}/></th>}{claiming&&<th><input type="checkbox" aria-label="全选本页可认养客户" checked={pageClaimable.length>0&&pageClaimable.every(c=>poolIds.includes(c.id))} disabled={busy||loading} onChange={e=>setPoolIds(ids=>e.target.checked?[...new Set([...ids,...pageClaimable.map(c=>c.id)])]:ids.filter(id=>!pageClaimable.some(c=>c.id===id)))}/></th>}<th>客户名称</th><th>客户编码</th><th>负责人</th><th>认养人</th><th>等级</th><th>操作</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}>{assigning&&<td><input className="customer-select" type="checkbox" aria-label={`选择客户 ${c.customer_name}`} checked={batchIds.includes(c.id)} disabled={busy||selecting||loading||(c.claims?.length||0)>0} onChange={e=>setBatchIds(ids=>e.target.checked?[...new Set([...ids,c.id])]:ids.filter(id=>id!==c.id))}/></td>}{claiming&&<td><input type="checkbox" aria-label={`认养客户 ${c.customer_name}`} checked={poolIds.includes(c.id)} disabled={busy||loading||!claimable(c)} onChange={e=>setPoolIds(ids=>e.target.checked?[...new Set([...ids,c.id])]:ids.filter(id=>id!==c.id))}/></td>}<td><strong>{c.customer_name}</strong></td><td>{c.customer_code||"CRM 潜客"}</td><td>{name(c.owner_user_id)}</td><td>{(c.claims||[]).map(x=>x.display_name+(x.user_id===userId?"（我）":"")).join("、")||"未认养"}</td><td><span className="level-tag">{c.customer_level||"未评级"}</span></td><td>{tab==="pool"&&processWrite?(c.claims?.some(x=>x.user_id===userId)?<span className="muted">已认养</span>:<button disabled={busy} onClick={()=>act(async()=>{await api(`/customers/${c.id}/claim`,"POST");open(c.id);},"认养成功，客户已进入“我的客户”")}>认养客户</button>):<button className="text-button" onClick={()=>open(c.id)}>查看客户</button>}</td></tr>)}</tbody></table>{!loading&&rows.length===0&&<p className="muted">暂无符合条件的客户。</p>}</div><div className="crm-actions"><button disabled={offset===0||loading} onClick={()=>setOffset(Math.max(0,offset-pageSize))}>上一页</button><span>共 {total} 个客户 · 第 {Math.floor(offset/pageSize)+1} 页</span><label>每页显示<select value={pageSize} disabled={loading} onChange={e=>{setPageSize(Number(e.target.value));setOffset(0);}}>{[10,20,30,50,100].map(n=><option key={n} value={n}>{n} 行</option>)}</select></label><button disabled={offset+pageSize>=total||loading} onClick={()=>setOffset(offset+pageSize)}>下一页</button></div></>}
    {!selected&&["tasks","opportunities"].includes(tab)&&<div className="crm-search"><label>筛选负责人<select value={personFilter} onChange={e=>{setPersonFilter(e.target.value);setWorkOffset(0);}}><option value="">全部授权人员</option>{people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>{tab==="opportunities"&&<label><input type="checkbox" checked={openOnly} onChange={e=>{setOpenOnly(e.target.checked);setWorkOffset(0);}}/>仅显示开放项目</label>}</div>}
    {!selected&&tab==="tasks"&&<><div className="data-tabs">{[["today","今天"],["week","本周"],["overdue","逾期"],["future","未来"],["done","已完成"]].map(([v,label])=><button key={v} aria-pressed={view===v} onClick={()=>{setView(v);setWorkOffset(0);setEdit(null);}}>{label}</button>)}</div><p className="muted">按北京时间显示，可按页查看全部待办。</p>{["owner","manager","sales"].includes(role)&&<button disabled={loading} onClick={()=>setEdit({kind:"newtask"})}>新增待办</button>}<TaskList data={tasks} name={name} selected={selected} processWrite={processWrite} role={role} busy={busy} act={act} open={open} edit={edit} setEdit={setEdit} save={save}/></>}
    {!selected&&tab==="followups"&&<><p className="muted">按沟通时间排序，可翻页查看历史跟进。</p><FollowList data={follows} name={name} selected={selected} processWrite={processWrite} role={role} edit={edit} setEdit={setEdit} save={save} open={open}/></>}
    {!selected&&tab==="opportunities"&&<><p className="muted">按更新时间排序，可翻页查看历史项目。预计金额与加权金额不计入实际销售额；开放项目必须始终有下一步（下一步推进或关联待办）。</p>{summary&&<div className="cards proj-kpis" aria-label="项目指标"><section className="card kpi-card"><span>开放项目数</span><strong>{summary.open_count}</strong><p className="kpi-sub">个 · 含未挂项目主档的推荐记录</p></section><section className="card kpi-card"><span>有效项目金额</span><strong>{money(summary.open_amount)}<small> 元</small></strong><p className="kpi-sub">开放项目预计金额合计</p></section><section className="card kpi-card"><span>加权金额</span><strong>{money(summary.weighted_amount)}<small> 元</small></strong><p className="kpi-sub">按成交概率加权，部分为预测</p></section><section className="card kpi-card"><span>本月预计成交</span><strong>{summary.expected_this_month}</strong><p className="kpi-sub">个 · 预计成交日期在本月</p></section><section className="card kpi-card"><span>停滞项目</span><strong className={summary.stagnant_count?"kpi-risk":""}>{summary.stagnant_count}</strong><p className="kpi-sub">无下一步且超阈值未更新，需处理</p></section></div>}<OppList data={opps} name={name} selected={selected} processWrite={processWrite} open={open} setEdit={setEdit}/></>}
    {!selected&&["tasks","followups","opportunities"].includes(tab)&&<div className="crm-actions"><button disabled={workOffset===0||loading} onClick={()=>setWorkOffset(Math.max(0,workOffset-100))}>上一页记录</button><span>第 {workOffset/100+1} 页</span><button disabled={loading||(tab==="tasks"?tasks:tab==="followups"?follows:opps).length<100} onClick={()=>setWorkOffset(workOffset+100)}>下一页记录</button></div>}
    {selected&&detail&&customer&&<div className="cd">{!embedded&&<div className="cd-topline"><button onClick={()=>{setSelected(null);rememberCustomer(null);setDetail(null);setEdit(null);}}>← 返回客户列表</button></div>}
      <DetailSummary detail={detail} customer={customer} tags={tags} config={config} role={role} userId={userId} processWrite={processWrite} manage={manage} customerWrite={customerWrite} busy={busy} name={name} tagMgr={tagMgr} onTagMgr={setTagMgr} detailTab={detailTab} onDetailTab={setDetailTab} edit={edit} setEdit={setEdit} candidates={candidates} setCandidates={setCandidates} personOptions={personOptions} selected={selected} act={act} save={save} refresh={refresh} open={open} setNotice={setNotice} onCloseDetail={()=>{setSelected(null);rememberCustomer(null);setDetail(null);setEdit(null);}}/>
      {detailTab==="overview"&&<DetailOverview detail={detail} profile={profile} role={role} processWrite={processWrite} customerWrite={customerWrite} busy={busy} name={name} edit={edit} setEdit={setEdit} onDetailTab={setDetailTab} selected={selected} act={act} save={save} setNotice={setNotice}/>}
      <DetailSections detail={detail} customer={customer} profile={profile} role={role} userId={userId} processWrite={processWrite} customerWrite={customerWrite} busy={busy} loading={loading} name={name} detailTab={detailTab} edit={edit} setEdit={setEdit} personOptions={personOptions} selected={selected} act={act} save={save} open={open} historyOffset={historyOffset} onHistoryOffset={setHistoryOffset} config={config}/>
    </div>}
    {edit?.kind==="newtask"&&<section className="card data-section"><Editor title="新建待办" fields={[{key:"title",label:"待办标题",required:true},{key:"assignee_user_id",label:"执行人",required:true,options:personOptions},{key:"due_at",label:"截止时间（北京时间）",type:"datetime-local",required:true},{key:"priority",label:"优先级",options:[["normal","普通"],["high","高"],["urgent","紧急"],["low","低"]]}]} initial={{assignee_user_id:customer?.owner_user_id||userId}} submit="创建待办" cancel={()=>setEdit(null)} save={d=>save("/tasks","POST",{...d,customer_id:selected})}/></section>}
    {!selected&&tab==="settings"&&["owner","admin"].includes(role)&&config&&<section className="card data-section"><Editor title="CRM 参数" fields={[{key:"sales_create_tags",label:"允许销售和经理自建标签",type:"checkbox"},{key:"public_pool_claim_enabled",label:"允许公海领取",type:"checkbox"},{key:"allow_prospect_create",label:"允许新增潜客（默认关闭：客户以精斗云导入为准）",type:"checkbox"},{key:"followup_edit_hours",label:"销售跟进修改时限（小时，0—720）",type:"number",required:true,min:"0",max:"720",step:"1"},{key:"stagnant_warn_days",label:"项目停滞标黄阈值（天）",type:"number",required:true,min:"1",max:"365",step:"1"},{key:"stagnant_risk_days",label:"项目停滞标红阈值（天）",type:"number",required:true,min:"1",max:"365",step:"1"},{key:"sp_contact",label:"默认成交概率：接触客户（%）",type:"percent",step:"0.0001",min:"0",max:"100"},{key:"sp_recommend",label:"默认成交概率：推荐产品（%）",type:"percent",step:"0.0001",min:"0",max:"100"},{key:"sp_selection",label:"默认成交概率：选品（%）",type:"percent",step:"0.0001",min:"0",max:"100"},{key:"sp_bidding",label:"默认成交概率：招投标（%）",type:"percent",step:"0.0001",min:"0",max:"100"},{key:"sp_negotiation",label:"默认成交概率：大单议价（%）",type:"percent",step:"0.0001",min:"0",max:"100"},{key:"sp_delivery",label:"默认成交概率：交付（%）",type:"percent",step:"0.0001",min:"0",max:"100"}]} initial={({...config, stage_probability: undefined, sp_contact:String(Math.round((config.stage_probability?.contact??0.1)*100)), sp_recommend:String(Math.round((config.stage_probability?.recommend??0.25)*100)), sp_selection:String(Math.round((config.stage_probability?.selection??0.4)*100)), sp_bidding:String(Math.round((config.stage_probability?.bidding??0.55)*100)), sp_negotiation:String(Math.round((config.stage_probability?.negotiation??0.7)*100)), sp_delivery:String(Math.round((config.stage_probability?.delivery??0.9)*100))}) as unknown as Record<string, Value>} submit="保存 CRM 参数" save={d=>save("/settings","PUT",{...d,followup_edit_hours:Number(d.followup_edit_hours),stagnant_warn_days:Number(d.stagnant_warn_days),stagnant_risk_days:Number(d.stagnant_risk_days),stage_probability:{contact:Number(d.sp_contact)/100,recommend:Number(d.sp_recommend)/100,selection:Number(d.sp_selection)/100,bidding:Number(d.sp_bidding)/100,negotiation:Number(d.sp_negotiation)/100,delivery:Number(d.sp_delivery)/100,won:1,lost:0}})}/>
        <p className="muted">各阶段默认成交概率用于新建/推进项目时自动带出（界面按百分比，存储 0—1）；停滞阈值：开放项目无下一步且超过 N 天未更新即标黄/标红。</p><p>公海自动回收未启用；跟进、转交和配置变更均保留操作历史。</p></section>}
    {!selected&&((["owner","admin"].includes(role)&&tab==="settings")||(processWrite&&config?.sales_create_tags&&tab==="customers"))&&<section className="card data-section"><Editor title="维护公共标签" fields={[{key:"tag_name",label:"标签名称",required:true,maxLength:100},{key:"tag_group",label:"标签组",maxLength:32}]} submit="新增标签" save={d=>save("/tags","POST",d)}/>{["owner","admin"].includes(role)&&tags.map(t=><p key={t.id}>{t.tag_name} · {t.is_active?"启用":"停用"}<button disabled={busy} onClick={()=>act(()=>api(`/tags/${t.id}`,"PUT",{tag_name:t.tag_name,tag_group:t.tag_group,is_active:!t.is_active}))}>{t.is_active?"停用标签":"启用标签"}</button></p>)}</section>}
  </section>;
}
