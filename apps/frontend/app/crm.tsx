"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { CRMEntry } from "./crm-navigation";

type Role = "owner" | "manager" | "sales" | "finance" | "admin";
type Person = { id: string; display_name: string; username: string };
type Customer = { id: string; source_system: string; customer_code: string | null; customer_name: string; owner_user_id: string | null; ownership_status: string; customer_level: string | null; customer_type: string | null; lifecycle_status: string; remark: string | null; bound_customer_id: string | null; bound_at: string | null; claims: {user_id: string; display_name: string; claimed_at: string}[] };
type Contact = { id: string; customer_id: string; name: string; role_label: string | null; decision_role: string | null; mobile: string | null; wechat: string | null; email: string | null; is_primary: boolean; relationship_note: string | null; is_active: boolean };
type Follow = { id: string; customer_id: string; owner_user_id: string; occurred_at: string; interaction_method: string; contact_result: string; summary: string | null; material_sent: boolean; material_note: string | null; quotation_sent: boolean; next_action: string | null; next_followup_at: string | null; contact_id: string | null; is_active: boolean };
type Task = { id: string; customer_id: string | null; title: string; status: string; assignee_user_id: string; due_at: string; source_type: string; completed_at: string | null; completion_result: string | null };
type Opportunity = { id: string; customer_id: string; opportunity_name: string; owner_user_id: string; stage: string; status: string; estimated_amount: string | null; probability: string | null; weighted_amount: string | null; expected_close_date: string | null; need_summary: string | null; lost_reason: string | null; closed_at: string | null };
 type Tag = { id: string; tag_name: string; tag_group: string | null; is_active: boolean; created_by?: string | null };
type Settings = { sales_create_tags: boolean; followup_edit_hours: number; public_pool_claim_enabled: boolean; allow_prospect_create: boolean };
type Detail = { has_more_history: boolean; sales_summary: { order_count: number; total_amount: string; year_amount: string; last_order_date: string | null; top_products: {name: string; amount: string}[] }; customer: Customer; contacts: Contact[]; followups: Follow[]; tasks: Task[]; opportunities: Opportunity[]; tags: Tag[]; events: { id: string; activity_type: string; occurred_at: string; user_id: string; details: { after?: { reason?: string; owner_user_id?: string } } | null }[]; orders: { id: string; order_no: string; order_date: string; sales_amount: string }[] };
type Profile = { customer_id: string; name: string; layer: string | null; days_since: number | null; last_order_date: string | null; orders: number; amount: string; aov: string | null; is_repeat: boolean; convert_days: number | null; warnings: string[] };
type Value = string | boolean | number | null;
type Field = { key: string; label: string; type?: string; required?: boolean; options?: [string, string][]; step?: string; maxLength?: number; min?: string; max?: string };
const methods: [string, string][] = [["phone","电话"],["wechat","微信"],["visit","拜访"],["meeting","面谈"],["quote","报价"],["other","其他"]];
const results: [string, string][] = [["good","有明确需求"],["normal","已沟通"],["no_answer","未接通"],["no_need","暂无需求"],["waiting","等待回复"],["rejected","明确拒绝"],["won","已成交"],["other","其他"]];
const stages: [string, string][] = [["initial","初步沟通"],["demand","需求确认"],["quoted","已报价"],["negotiating","谈判"],["won","赢单"],["lost","流失"]];
const text = (options: [string,string][], value: string) => options.find(x => x[0] === value)?.[1] || value;
const fmt = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",dateStyle:"short",timeStyle:"short"}).format(new Date(value)) : "—";
function localTime(value: string) { const date = new Date(value); return new Date(date.getTime()+8*3600000).toISOString().slice(0,16); }
function money(value: string | null) { if (value === null) return "未填写"; const [a,b=""] = value.split("."); return a.replace(/\B(?=(\d{3})+(?!\d))/g,",")+"."+b.padEnd(2,"0"); }
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(`/api/crm${path}`,{method,headers:{"Content-Type":"application/json"},body:body === undefined ? undefined : JSON.stringify(body),cache:"no-store"});
  const data = await r.json(); if (!r.ok) throw new Error(data.error?.message || "操作失败，请重试"); return data;
}

function Editor({title, fields, initial = {}, submit, save, cancel}: {title: string; fields: Field[]; initial?: Record<string, Value>; submit: string; save: (data: Record<string, Value>) => Promise<void>; cancel?: () => void}) {
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const formRef=useRef<HTMLFormElement>(null);
  useEffect(()=>{
    if(!cancel)return;
    const frame=requestAnimationFrame(()=>{
      formRef.current?.querySelector('h3')?.focus({preventScroll:true});
      formRef.current?.scrollIntoView({block:'start',behavior:'instant'});
    });
    return()=>cancelAnimationFrame(frame);
  },[title,!!cancel]);
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form=e.currentTarget, fd=new FormData(form); setBusy(true); setError("");
    const data: Record<string,Value> = {};
    for (const f of fields) {
      const raw=fd.get(f.key)?.toString() || "";
      data[f.key]=f.type === "checkbox" ? fd.has(f.key) : f.type === "datetime-local" && raw ? new Date(raw+":00+08:00").toISOString() : raw || null;
    }
    try { await save(data); form.reset(); } catch(e) { setError(e instanceof Error ? e.message : "保存失败"); } finally { setBusy(false); }
  }
  return <form ref={formRef} className="crm-form" aria-label={title} onSubmit={handle}><h3 tabIndex={-1}>{title}</h3><div className="crm-fields">{fields.map(f => <label key={f.key}>{f.label}{f.type === "checkbox" ? <input name={f.key} type="checkbox" defaultChecked={!!initial[f.key]} /> : f.options ? <select name={f.key} required={f.required} defaultValue={String(initial[f.key] ?? f.options[0]?.[0] ?? "")}>{f.options.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select> : f.type === "textarea" ? <textarea name={f.key} maxLength={f.maxLength || 4000} defaultValue={String(initial[f.key] ?? "")} /> : <input name={f.key} type={f.type || "text"} required={f.required} maxLength={f.maxLength || 255} step={f.step} min={f.min} max={f.max} defaultValue={f.type === "datetime-local" && initial[f.key] ? localTime(String(initial[f.key])) : String(initial[f.key] ?? "")} />}</label>)}</div>{error && <p role="alert" className="error">{error}</p>}<div className="crm-actions"><button className="primary" disabled={busy} type="submit">{busy ? "保存中…" : submit}</button>{cancel && <button type="button" onClick={cancel} disabled={busy}>取消编辑</button>}</div></form>;
}

function TagPicker({tags, selected, busy, canCreate, onCreate, onSave}: {tags: Tag[]; selected: string[]; busy: boolean; canCreate: boolean; onCreate: (name: string) => Promise<Tag | undefined>; onSave: (ids: string[]) => void}) {
  const [draft,setDraft]=useState<string[]>(selected);
  const [name,setName]=useState("");
  const toggle=(id:string)=>setDraft(d=>d.includes(id)?d.filter(x=>x!==id):[...d,id]);
  async function create() {
    const trimmed=name.trim();
    if (!trimmed) return;
    const tag=await onCreate(trimmed);
    setName("");
    if (tag) setDraft(d=>d.includes(tag.id)?d:[...d,tag.id]);
  }
  return <div className="tag-picker">{tags.filter(t=>t.is_active||draft.includes(t.id)).map(t=><button key={t.id} type="button" aria-pressed={draft.includes(t.id)} disabled={busy} onClick={()=>toggle(t.id)}>{t.tag_name}{!t.is_active?"（已停用）":""}</button>)}{canCreate&&<span className="tag-create"><input aria-label="新建标签名称" value={name} maxLength={100} placeholder="新建标签" onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();create();}}}/><button type="button" disabled={busy||!name.trim()} onClick={create}>添加</button></span>}<button className="primary tag-save" disabled={busy} onClick={()=>onSave(draft)}>保存标签</button></div>;
}

function TagManager({tags, busy, run, role, userId}: {tags: Tag[]; busy: boolean; run: (fn: () => Promise<unknown>) => void; role: Role; userId: string}) {
  const [name,setName]=useState(""), [group,setGroup]=useState(""), [edits,setEdits]=useState<Record<string,{tag_name:string;tag_group:string}>>({});
  const row=(t:Tag)=>edits[t.id]||{tag_name:t.tag_name,tag_group:t.tag_group||""};
  const update=(t:Tag,patch:Partial<{tag_name:string;tag_group:string}>)=>setEdits(s=>({...s,[t.id]:{...row(t),...patch}}));
  const manageAll=["owner","admin"].includes(role);
  const editable=(t:Tag)=>manageAll||t.created_by===userId;
  return <div className="tag-manager">
    <form className="tag-add" onSubmit={e=>{e.preventDefault();const n=name.trim();if(!n)return;run(async()=>{await api("/tags","POST",{tag_name:n,tag_group:group.trim()||null});setName("");setGroup("");});}}>
      <input aria-label="新标签名称" value={name} maxLength={100} onChange={e=>setName(e.target.value)} placeholder="新标签名称"/>
      <input aria-label="新标签分组" value={group} maxLength={32} onChange={e=>setGroup(e.target.value)} placeholder="分组（可选）"/>
      <button className="primary" disabled={busy||!name.trim()}>添加标签</button>
    </form>
    <ul>{tags.map(t=>{const d=row(t);const mine=editable(t);return <li key={t.id}>
      {mine?<><input aria-label={`改名：${t.tag_name}`} value={d.tag_name} maxLength={100} disabled={busy} onChange={e=>update(t,{tag_name:e.target.value})}/>
      <input aria-label={`分组：${t.tag_name}`} value={d.tag_group} maxLength={32} disabled={busy} onChange={e=>update(t,{tag_group:e.target.value})}/>
      <button disabled={busy||!d.tag_name.trim()} onClick={()=>run(()=>api(`/tags/${t.id}`,"PUT",{tag_name:d.tag_name.trim(),tag_group:d.tag_group.trim()||null,is_active:t.is_active}))}>保存修改</button>
      <button disabled={busy||!d.tag_name.trim()} onClick={()=>run(()=>api(`/tags/${t.id}`,"PUT",{tag_name:d.tag_name.trim(),tag_group:d.tag_group.trim()||null,is_active:!t.is_active}))}>{t.is_active?"删除":"恢复标签"}</button></>
      :<><strong>{t.tag_name}</strong>{t.tag_group&&<span className="muted">{t.tag_group}</span>}<span className="muted">他人创建，仅老板／管理员可改</span></>}
      {!t.is_active&&<span className="muted">已删除（停用），历史保留</span>}
    </li>;})}</ul>
    <p className="muted">删除=停用：已打此标签的客户保留历史，仅从点选与筛选中隐藏；改名立即生效。标签由大家自行创建和维护：你只能修改自己创建的标签{manageAll?"；你是老板／管理员，可管理全部标签":""}。</p>
  </div>;
}

export default function CRM({role, userId, entry, embedded=false}: {role: Role; userId: string; entry?: CRMEntry; embedded?:boolean}) {
  const [workOffset,setWorkOffset]=useState(0), [historyOffset,setHistoryOffset]=useState(0);
  const [personFilter,setPersonFilter]=useState(entry?.personId||""), [openOnly,setOpenOnly]=useState(entry?.openOnly||false), [quickFollowup,setQuickFollowup]=useState(false);
  const [tab,setTab]=useState<string>(entry?.tab||"customers"), [rows,setRows]=useState<Customer[]>([]), [total,setTotal]=useState(0), [q,setQ]=useState(""), [search,setSearch]=useState(""), [offset,setOffset]=useState(0), [tagFilter,setTagFilter]=useState(""), [levelFilter,setLevelFilter]=useState(""), [pageSize,setPageSize]=useState(30);
  const [people,setPeople]=useState<Person[]>([]), [tags,setTags]=useState<Tag[]>([]), [config,setConfig]=useState<Settings|null>(null), [selected,setSelected]=useState<string|null>(entry?.customerId||null), [detail,setDetail]=useState<Detail|null>(null);
  const [tasks,setTasks]=useState<Task[]>([]), [view,setView]=useState<string>(entry?.taskView||"today"), [opps,setOpps]=useState<Opportunity[]>([]), [follows,setFollows]=useState<Follow[]>([]), [edit,setEdit]=useState<{kind:string; id?:string}|null>(null);
  const [profile,setProfile]=useState<Profile|null>(null), [error,setError]=useState(""), [notice,setNotice]=useState(""), [loading,setLoading]=useState(false), [busy,setBusy]=useState(false), [revision,setRevision]=useState(0), [candidates,setCandidates]=useState<Customer[]>([]);
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
      else if(tab==="opportunities") {const data=await api<Opportunity[]>(`/opportunities?offset=${workOffset}${personFilter?"&owner_user_id="+encodeURIComponent(personFilter):""}${openOnly?"&status=open":""}`);if(live)setOpps(data);}
      else if(tab==="followups") {const data=await api<Follow[]>(`/followups?offset=${workOffset}`);if(live)setFollows(data);}
    }
    load().catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);}); return ()=>{live=false;};
  },[tab,selected,search,offset,view,revision,tagFilter,levelFilter,workOffset,historyOffset,personFilter,openOnly,ownership,pageSize]);
  async function act(run:()=>Promise<unknown>, message="已保存") {setBusy(true);setError("");setNotice("");try{await run();if(message)setNotice(message);refresh();}catch(e){setError(e instanceof Error?e.message:"操作失败");}finally{setBusy(false);}}
  async function save(path:string,method:string,data:unknown) {await api(path,method,data);setEdit(null);setNotice("已保存，操作历史已保留");refresh();}
  const contactFields: Field[]=[{key:"name",label:"联系人姓名",required:true,maxLength:100},{key:"role_label",label:"关系角色（如老板、采购）",maxLength:64},{key:"mobile",label:"联系电话",maxLength:32},{key:"wechat",label:"微信",maxLength:100},{key:"email",label:"邮箱",maxLength:255},{key:"decision_role",label:"决策角色",options:[["","未指定"],["decision_maker","关键决策人"],["buyer","采购"],["finance","财务"],["influencer","影响人"],["other","其他"]]},{key:"is_primary",label:"主要联系人",type:"checkbox"},{key:"relationship_note",label:"关系备注",type:"textarea"},{key:"is_active",label:"联系人有效",type:"checkbox"}];
  const followFields: Field[]=[{key:"interaction_method",label:"跟进方式",options:methods},{key:"contact_result",label:"沟通结果",options:results},{key:"contact_id",label:"关联联系人",options:[["","未指定"],...(detail?.contacts.filter(c=>c.is_active).map(c=>[c.id,c.name] as [string,string]) || [])]},{key:"occurred_at",label:"沟通时间（北京时间）",type:"datetime-local"},{key:"summary",label:"沟通摘要",type:"textarea"},{key:"material_sent",label:"已发送资料",type:"checkbox"},{key:"material_note",label:"资料说明"},{key:"quotation_sent",label:"已报价",type:"checkbox"},{key:"next_action",label:"下一步动作"},{key:"next_followup_at",label:"下次跟进时间（北京时间）",type:"datetime-local"}];
  const oppFields: Field[]=[{key:"opportunity_name",label:"商机名称",required:true},{key:"owner_user_id",label:"商机负责人",required:true,options:personOptions},{key:"stage",label:"商机阶段",options:stages},{key:"estimated_amount",label:"预计金额（元）",type:"number",step:"0.01",min:"0"},{key:"probability",label:"成交概率（0—1，如 0.7）",type:"number",step:"0.0001",min:"0",max:"1"},{key:"expected_close_date",label:"预计成交日期",type:"date"},{key:"need_summary",label:"主要需求",type:"textarea"},{key:"lost_reason",label:"流失原因"}];
  function taskList(data:Task[]) {return <div className="crm-list">{data.length===0 && <p className="muted">暂无待办</p>}{data.map(t=><article key={t.id} className="crm-item"><strong>{t.title}</strong><p>{fmt(t.due_at)} · {name(t.assignee_user_id)} · {t.status==="done"?"已完成":t.status==="cancelled"?"已取消":new Date(t.due_at).getTime()<Date.now()?"已逾期":"待处理"} · {t.source_type==="followup"?"跟进生成":t.source_type==="manager"?"管理者分配":"手动创建"}</p><div className="crm-actions">{t.customer_id && !selected && <button onClick={()=>open(t.customer_id!)}>查看客户</button>}{t.customer_id && processWrite && <button onClick={()=>open(t.customer_id!,true)}>快速记录跟进</button>}{t.status==="todo" && ["owner","manager","sales"].includes(role) && <><button disabled={busy} onClick={()=>act(()=>api(`/tasks/${t.id}`,"PATCH",{status:"done"}),"待办已完成")}>完成待办</button><button onClick={()=>setEdit({kind:"task",id:t.id})}>延期／取消</button></>}</div>{edit?.kind==="task" && edit.id===t.id && <Editor title="调整待办" fields={[{key:"due_at",label:"延期至（北京时间）",type:"datetime-local"},{key:"status",label:"待办状态",options:[["todo","待处理"],["cancelled","取消"]]},{key:"completion_result",label:"简短结果",maxLength:100}]} initial={{}} submit="保存待办" cancel={()=>setEdit(null)} save={async d=>{if(d.status==="cancelled" || !d.due_at)delete d.due_at; await save(`/tasks/${t.id}`,"PATCH",d);}} />}</article>)}</div>;}
  function oppList(data:Opportunity[]) {return <div className="crm-list">{data.length===0 && <p className="muted">暂无商机</p>}{data.map(o=><article className="crm-item" key={o.id}><strong>{o.opportunity_name}</strong><p>{text(stages,o.stage)} · {name(o.owner_user_id)} · 预计 {money(o.estimated_amount)} 元 · 加权 {money(o.weighted_amount)} 元</p>{o.closed_at&&<p>关闭时间：{fmt(o.closed_at)}</p>}{o.lost_reason && <p>流失原因：{o.lost_reason}</p>}{!selected?<button onClick={()=>open(o.customer_id)}>查看客户与商机</button>:processWrite && <button onClick={()=>setEdit({kind:"opportunity",id:o.id})}>更新商机</button>}</article>)}</div>;}
  function followList(data:Follow[]) {return <div className="crm-list">{data.length===0 && <p className="muted">暂无跟进</p>}{data.map(f=><article className="crm-item" key={f.id}><strong>{text(methods,f.interaction_method)} · {text(results,f.contact_result)}</strong><p>{fmt(f.occurred_at)} · {name(f.owner_user_id)}</p><p>{f.summary || "未填写摘要"}{f.material_sent?" · 已发资料":""}{f.quotation_sent?" · 已报价":""}</p>{f.next_action && <p>下一步：{f.next_action} · {fmt(f.next_followup_at)}</p>}{!f.is_active&&<p className="data-warning">已作废，历史内容保留</p>}{!selected?<button onClick={()=>open(f.customer_id)}>查看客户与跟进</button>:processWrite && f.is_active && <button onClick={()=>setEdit({kind:"followup",id:f.id})}>修改跟进</button>}{selected&&f.is_active&&["owner","admin"].includes(role)&&<button onClick={()=>setEdit({kind:"void",id:f.id})}>作废跟进</button>}{edit?.kind==="void"&&edit.id===f.id&&<Editor title="作废跟进" fields={[{key:"reason",label:"作废原因",required:true,maxLength:500}]} submit="确认作废" cancel={()=>setEdit(null)} save={d=>save(`/customers/${selected}/followups/${f.id}/void`,"POST",d)}/>}</article>)}</div>;}
  const customer=detail?.customer;
  return <section className="crm"><p className="eyebrow">工作空间 / 轻量 CRM</p><h1>{selected ? "客户 360" : "客户与待办"}</h1><p className="muted">记录客户关系和下一步安排。正式交易以精斗云为准。</p>
    <div className="data-tabs">{[["customers",role==="sales"?"我的客户":"客户列表"],...(role!=="finance"?[["pool","客户公海"],["opportunities","商机列表"],["followups","跟进记录"],["tasks","我的待办"]]:[]),...(["owner","admin"].includes(role)?[["settings","CRM 设置"]]:[])].map(([key,label])=><button key={key} aria-pressed={tab===key&&!selected} onClick={()=>{setTab(key);setQuickFollowup(false);setWorkOffset(0);setHistoryOffset(0);setSelected(null);rememberCustomer(null);setDetail(null);setEdit(null);setOffset(0);setNotice("");}}>{label}</button>)}</div>
    {error && <p role="alert" className="error">{error}<button onClick={refresh}>重试</button></p>}{notice && <p role="status" className="data-success">{notice}</p>}{loading && <p role="status">正在加载…</p>}
    {!selected && tab==="customers" && canAssign && <section className="assignment-help"><strong>导入客户无需重建</strong><p>导入的客户已自动进入“客户公海”，销售可在公海自行认养（同一客户允许多位同事认养，认养人可见）。也可按“公海／未分配”筛选后，在下方勾选客户直接指定负责人。</p><label>客户归属<select value={ownership} disabled={busy} onChange={e=>{setOwnership(e.target.value);setOffset(0);}}><option value="">全部归属</option><option value="unassigned">未分配</option><option value="owned">已分配</option><option value="public_pool">公海</option></select></label></section>}
    {assigning && <form className="batch-assignment" aria-label="批量分配客户" onSubmit={assignBatch}><div className="crm-actions"><button type="button" disabled={busy||loading||selecting||!assignable(rows).length} onClick={()=>setBatchIds(ids=>[...new Set([...ids,...assignable(rows).map(c=>c.id)])])}>选择本页</button><button type="button" disabled={busy||loading||selecting||!total||total>1000} onClick={selectAllResults}>{selecting?"正在选择…":`选择全部筛选结果（${total}）`}</button><button type="button" disabled={busy||selecting||!batchIds.length} onClick={()=>setBatchIds([])}>清空选择</button><strong aria-live="polite">已选 {batchIds.length} 个客户</strong></div>{total>1000&&<p>单次最多分配 1000 个客户，请按名称、等级或标签缩小范围。</p>}<p className="muted">已被认养的客户不在勾选范围，如需调整请打开客户使用“分配／转交／公海”。</p><div className="crm-fields"><label>分配给销售<select required value={batchOwner} disabled={busy} onChange={e=>setBatchOwner(e.target.value)}><option value="">请选择负责人</option>{personOptions.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>分配说明<input required maxLength={500} value={batchReason} disabled={busy} onChange={e=>setBatchReason(e.target.value)} placeholder="例如：现有客户首次分配"/></label></div><p>本次将 {batchIds.length} 个公海／未分配客户交给 {batchOwner?name(batchOwner):"待选择的负责人"}；已有的认养记录与分配历史都会保留。</p><button className="primary" disabled={busy||selecting||loading||!batchIds.length||!batchOwner||!batchReason.trim()}>{busy?"正在分配…":"确认批量分配"}</button></form>}
    {!selected && tab==="customers" && role==="sales" && !loading && !rows.length && !search && <p className="assignment-help">还没有分配给你的客户。请到“客户公海”认养已导入的精斗云客户。</p>}
    {!selected && (tab==="customers" || tab==="pool") && <><div className="crm-search"><form onSubmit={e=>{e.preventDefault();setSearch(q);setOffset(0);}}><label>搜索客户<input value={q} onChange={e=>setQ(e.target.value)} placeholder="名称或客户编码" maxLength={100}/></label><button type="submit">搜索</button></form><label>客户等级<select value={levelFilter} onChange={e=>{setLevelFilter(e.target.value);setOffset(0);}}><option value="">全部等级</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option><option value="none">未评级</option></select></label><label>筛选标签<select value={tagFilter} onChange={e=>{setTagFilter(e.target.value);setOffset(0);}}><option value="">全部标签</option>{tags.map(t=><option key={t.id} value={t.id}>{t.tag_name}</option>)}</select></label>{claiming&&<label>认养状态<select value={claimFilter} onChange={e=>{setClaimFilter(e.target.value);setOffset(0);}}><option value="">全部</option><option value="unclaimed">未认养</option><option value="claimed">已认养</option></select></label>}{processWrite && tab==="customers" && config?.allow_prospect_create && <button disabled={loading} onClick={()=>setEdit({kind:"prospect"})}>新增潜客</button>}{manage && tab==="pool" && <button disabled={loading} onClick={()=>setEdit({kind:"pool"})}>录入公海客户</button>}{claiming&&<button className="primary" disabled={busy||loading||!poolIds.length} onClick={claimBatch}>一键认养（{poolIds.length}）</button>}</div>
      {edit?.kind==="prospect" && <Editor title="新增潜客" fields={[{key:"customer_name",label:"潜客名称",required:true},{key:"mobile",label:"联系电话",maxLength:32},{key:"remark",label:"客户备注",type:"textarea"}]} submit="创建潜客" cancel={()=>setEdit(null)} save={async d=>{const r=await api<{customer:Customer;duplicate_warning:boolean}>("/customers","POST",d);open(r.customer.id);setNotice(r.duplicate_warning?"已创建。存在名称或电话相同的客户，请核实；系统未自动合并。":"潜客已创建");}} />}
      {edit?.kind==="pool" && <Editor title="录入公海客户" fields={[{key:"customer_name",label:"客户名称",required:true},{key:"mobile",label:"联系电话",maxLength:32},{key:"remark",label:"客户备注",type:"textarea"}]} submit="录入公海" cancel={()=>setEdit(null)} save={async d=>{const r=await api<{customer:Customer;duplicate_warning:boolean}>("/customers/pool","POST",d);setEdit(null);setNotice(r.duplicate_warning?"已录入公海。存在名称或电话相同的客户，请核实；系统未自动合并。":"已录入公海，销售可立即认养");refresh();}} />}
      {!selected && tab==="pool" && manage && <section className="card data-section" aria-label="批量录入公海客户"><h2>批量录入公海客户</h2><p className="muted">每行一个客户：名称,电话,备注（电话、备注可省略）。与现有客户同名或同电话的行会自动跳过。精斗云正式客户请走“数据中心”按数据源导入，导入后自动进入公海。</p><form onSubmit={e=>{e.preventDefault();const items=poolBulk.split(/\n+/).map(l=>l.split(/[,，]/)).filter(p=>p[0]?.trim()).map(p=>({customer_name:p[0].trim(),mobile:(p[1]||"").trim()||null,remark:p.slice(2).join(",").trim()||null}));if(items.length)act(async()=>{const r=await api<{created_count:number;duplicate_names:string[]}>("/customers/pool-import","POST",{items});setPoolBulk("");setNotice(`已录入 ${r.created_count} 个公海客户${r.duplicate_names.length?`；跳过重复 ${r.duplicate_names.length} 个：${r.duplicate_names.slice(0,10).join("、")}${r.duplicate_names.length>10?"等":""}`:""}；销售可在本页认养。`);},"");}}><textarea value={poolBulk} onChange={e=>setPoolBulk(e.target.value)} rows={5} maxLength={20000} aria-label="批量录入列表" placeholder={"山东鲁锦集团有限公司,0531-8888888,老客户介绍\n济南锦礼商贸"} /><button className="primary" disabled={busy||loading||!poolBulk.trim()}>{busy?"正在录入…":`解析并录入（${poolBulk.split(/\n+/).filter(l=>l.split(/[,，]/)[0]?.trim()).length} 行）`}</button></form></section>}
      {tab==="pool" && <p className="muted">认养后客户进入“我的客户”；同一客户允许多位同事认养，认养人相互可见，记录完整保留。自动回收未启用。</p>}<div className="customer-table-wrap"><table className="customer-table"><thead><tr>{assigning&&<th><input type="checkbox" aria-label="全选本页客户" checked={pageAssignable.length>0?pageAssignable.every(c=>batchIds.includes(c.id)):false} disabled={busy||selecting||loading} onChange={e=>setBatchIds(ids=>e.target.checked?[...new Set([...ids,...pageAssignable.map(c=>c.id)])]:ids.filter(id=>!pageAssignable.some(c=>c.id===id)))}/></th>}{claiming&&<th><input type="checkbox" aria-label="全选本页可认养客户" checked={pageClaimable.length>0&&pageClaimable.every(c=>poolIds.includes(c.id))} disabled={busy||loading} onChange={e=>setPoolIds(ids=>e.target.checked?[...new Set([...ids,...pageClaimable.map(c=>c.id)])]:ids.filter(id=>!pageClaimable.some(c=>c.id===id)))}/></th>}<th>客户名称</th><th>客户编码</th><th>负责人</th><th>认养人</th><th>等级</th><th>操作</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}>{assigning&&<td><input className="customer-select" type="checkbox" aria-label={`选择客户 ${c.customer_name}`} checked={batchIds.includes(c.id)} disabled={busy||selecting||loading||(c.claims?.length||0)>0} onChange={e=>setBatchIds(ids=>e.target.checked?[...new Set([...ids,c.id])]:ids.filter(id=>id!==c.id))}/></td>}{claiming&&<td><input type="checkbox" aria-label={`认养客户 ${c.customer_name}`} checked={poolIds.includes(c.id)} disabled={busy||loading||!claimable(c)} onChange={e=>setPoolIds(ids=>e.target.checked?[...new Set([...ids,c.id])]:ids.filter(id=>id!==c.id))}/></td>}<td><strong>{c.customer_name}</strong></td><td>{c.customer_code||"CRM 潜客"}</td><td>{name(c.owner_user_id)}</td><td>{(c.claims||[]).map(x=>x.display_name+(x.user_id===userId?"（我）":"")).join("、")||"未认养"}</td><td><span className="level-tag">{c.customer_level||"未评级"}</span></td><td>{tab==="pool"&&processWrite?(c.claims?.some(x=>x.user_id===userId)?<span className="muted">已认养</span>:<button disabled={busy} onClick={()=>act(async()=>{await api(`/customers/${c.id}/claim`,"POST");open(c.id);},"认养成功，客户已进入“我的客户”")}>认养客户</button>):<button className="text-button" onClick={()=>open(c.id)}>查看客户</button>}</td></tr>)}</tbody></table>{!loading&&rows.length===0&&<p className="muted">暂无符合条件的客户。</p>}</div><div className="crm-actions"><button disabled={offset===0||loading} onClick={()=>setOffset(Math.max(0,offset-pageSize))}>上一页</button><span>共 {total} 个客户 · 第 {Math.floor(offset/pageSize)+1} 页</span><label>每页显示<select value={pageSize} disabled={loading} onChange={e=>{setPageSize(Number(e.target.value));setOffset(0);}}>{[10,20,30,50,100].map(n=><option key={n} value={n}>{n} 行</option>)}</select></label><button disabled={offset+pageSize>=total||loading} onClick={()=>setOffset(offset+pageSize)}>下一页</button></div></>}
    {!selected&&["tasks","opportunities"].includes(tab)&&<div className="crm-search"><label>筛选负责人<select value={personFilter} onChange={e=>{setPersonFilter(e.target.value);setWorkOffset(0);}}><option value="">全部授权人员</option>{people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>{tab==="opportunities"&&<label><input type="checkbox" checked={openOnly} onChange={e=>{setOpenOnly(e.target.checked);setWorkOffset(0);}}/>仅显示开放商机</label>}</div>}
    {!selected&&tab==="tasks"&&<><div className="data-tabs">{[["today","今天"],["week","本周"],["overdue","逾期"],["future","未来"],["done","已完成"]].map(([v,label])=><button key={v} aria-pressed={view===v} onClick={()=>{setView(v);setWorkOffset(0);setEdit(null);}}>{label}</button>)}</div><p className="muted">按北京时间显示，可按页查看全部待办。</p>{["owner","manager","sales"].includes(role)&&<button disabled={loading} onClick={()=>setEdit({kind:"newtask"})}>新增待办</button>}{taskList(tasks)}</>}
    {!selected&&tab==="followups"&&<><p className="muted">按沟通时间排序，可翻页查看历史跟进。</p>{followList(follows)}</>}
    {!selected&&tab==="opportunities"&&<><p className="muted">按更新时间排序，可翻页查看历史商机。预计金额与加权金额不计入实际销售额。</p>{oppList(opps)}</>}
    {!selected&&["tasks","followups","opportunities"].includes(tab)&&<div className="crm-actions"><button disabled={workOffset===0||loading} onClick={()=>setWorkOffset(Math.max(0,workOffset-100))}>上一页记录</button><span>第 {workOffset/100+1} 页</span><button disabled={loading||(tab==="tasks"?tasks:tab==="followups"?follows:opps).length<100} onClick={()=>setWorkOffset(workOffset+100)}>下一页记录</button></div>}
    {selected&&detail&&customer&&<><button onClick={()=>{setSelected(null);rememberCustomer(null);setDetail(null);setEdit(null);}}>← 返回列表</button><div className="customer-sections" aria-label="客户详情分区">{[["profile","概览"],["contacts","联系人"],["followups","跟进"],["tasks","待办与商机"],["transactions","交易"]].filter(([key])=>role!=="finance"||!["followups","tasks"].includes(key)).map(([key,label])=><button key={key} onClick={()=>document.getElementById("customer-"+key)?.scrollIntoView({block:"start",behavior:"smooth"})}>{label}</button>)}</div><section id="customer-profile" className="card data-section"><h2>{customer.customer_name}</h2><p>{customer.customer_code||"潜客，尚无精斗云编码"} · 负责人：{name(customer.owner_user_id)}{customer.claims?.length?` · 认养人：${customer.claims.map(x=>x.display_name+(x.user_id===userId?"（我）":"")).join("、")}`:""} · {customer.bound_at?"已绑定精斗云":""}</p><p>{customer.remark || "暂无客户备注"}</p><div className="crm-actions">{customerWrite&&<button onClick={()=>setEdit({kind:"customer"})}>编辑客户备注</button>}{manage&&<button onClick={()=>setEdit({kind:"transfer"})}>分配／转交／公海</button>}{manage&&customer.source_system==="crm"&&!customer.bound_customer_id&&<button onClick={()=>{setEdit({kind:"bind"});setCandidates([]);}}>绑定精斗云客户</button>}</div>
      {edit?.kind==="customer"&&<Editor title="客户扩展信息" initial={customer as unknown as Record<string,Value>} fields={[...(customer.source_system==="crm"&&!customer.bound_customer_id?[{key:"customer_name",label:"客户名称",required:true}]:[]),{key:"remark",label:"客户备注",type:"textarea"},...(customerWrite?[{key:"customer_level",label:"客户级别（A-D，销售可自行调整）",options:[["","未评级"],["A","A"],["B","B"],["C","C"],["D","D"]] as [string,string][]}]:[]),...(manage?[{key:"customer_type",label:"客户类型",maxLength:32},{key:"lifecycle_status",label:"客户状态",options:[["prospect","潜在"],["active","活跃"],["dormant","沉睡"],["lost","流失"]] as [string,string][]}]:[])]} submit="保存客户" cancel={()=>setEdit(null)} save={d=>save(`/customers/${selected}`,"PATCH",d)}/>}
      {edit?.kind==="transfer"&&<Editor title="客户归属调整" fields={[{key:"owner_user_id",label:"新负责人",options:[["","进入公海"],...personOptions]},{key:"reason",label:"转交原因",required:true,maxLength:500}]} initial={{owner_user_id:customer.owner_user_id}} submit="确认调整归属" cancel={()=>setEdit(null)} save={async d=>{await api(`/customers/${selected}/transfer`,"POST",d);setSelected(null);rememberCustomer(null);setDetail(null);setEdit(null);setNotice("归属已调整，历史记录保留");refresh();}}/>}
      {edit?.kind==="bind"&&<><Editor title="查找精斗云正式客户" fields={[{key:"q",label:"正式客户名称",required:true,maxLength:100}]} submit="查找可绑定客户" cancel={()=>setEdit(null)} save={async d=>setCandidates(await api<Customer[]>(`/binding-candidates?q=${encodeURIComponent(String(d.q))}`))}/><p>仅列出未分配、未管理的正式客户。绑定保留潜客历史和精斗云原始订单。</p>{candidates.map(c=><p key={c.id}>{c.customer_name} · {c.customer_code}<button disabled={busy} onClick={()=>act(async()=>{const bound=await api<Customer>(`/customers/${selected}/bind`,"POST",{target_id:c.id});open(bound.id);},"已绑定，潜客历史已保留")}>绑定此客户</button></p>)}</>}
      <h3>客户标签</h3>{customerWrite&&<button className="text-button" aria-expanded={tagMgr} onClick={()=>setTagMgr(v=>!v)}>{tagMgr?"收起标签管理":"管理标签（新增／改名／删除）"}</button>}{tagMgr&&customerWrite&&<TagManager tags={tags} busy={busy} run={act} role={role} userId={userId}/>}{customerWrite?<TagPicker key={detail.tags.map(t=>t.id).join(",")} tags={tags} selected={detail.tags.map(t=>t.id)} busy={busy} canCreate={!!processWrite&&!!config?.sales_create_tags} onCreate={async name=>{let t:Tag|undefined;await act(async()=>{t=await api<Tag>("/tags","POST",{tag_name:name,tag_group:null});},"");return t;}} onSave={ids=>act(()=>api(`/customers/${selected}/tags`,"PUT",{tag_ids:ids}))}/>:<div className="tag-picker">{detail.tags.map(t=><span key={t.id} className="tag-chip">{t.tag_name}</span>)}{!detail.tags.length&&<p className="muted">暂无标签</p>}</div>}</section>
      {role!=="finance"&&selected&&<section className="card data-section" aria-label="经营画像"><h2>经营画像</h2>
      {profile&&!profile.warnings.length?<div className="cards" style={{gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",marginTop:12,gap:12}}>
        <div><span>RFM 分层</span><h3>{profile.layer||"—"}</h3></div>
        <div><span>累计源销售金额</span><h3>{money(profile.amount)} 元</h3></div>
        <div><span>订单数 / 客单价</span><h3>{profile.orders} 单 · {money(profile.aov)} 元</h3></div>
        <div><span>最近成交</span><h3>{profile.days_since!==null?`${profile.days_since} 天前`:"—"}</h3><p>{profile.last_order_date||""}</p></div>
        <div><span>复购</span><h3>{profile.is_repeat?"已复购":"尚未复购"}</h3></div>
        <div><span>成交转化周期</span><h3>{profile.convert_days!==null?`${profile.convert_days} 天`:"—"}</h3></div>
      </div>:<p className="muted">{profile?.warnings?.join("；")||(loading?"正在加载经营画像…":"当前账号暂无可用经营画像")}</p>}
      <p className="muted">分层基于源销售历史（R=近期成交 · F=成交频次 · M=金额贡献），阈值由老板在销售工作台设置中调整。</p></section>}
      <section id="customer-contacts" className="card data-section"><h2>联系人与关系人</h2>{["owner","manager","sales"].includes(role)&&<button onClick={()=>setEdit({kind:"contact"})}>新增联系人</button>}{detail.contacts.map(c=><article className="crm-item" key={c.id}><strong>{c.name} · {c.role_label||"未指定角色"}{c.is_primary?" · 主要联系人":""}{!c.is_active?" · 已停用":""}</strong><p>{c.mobile||"无电话"} · 微信 {c.wechat||"未填写"}</p><p>{c.relationship_note}</p>{customerWrite&&<button onClick={()=>setEdit({kind:"contact",id:c.id})}>编辑联系人</button>}</article>)}{edit?.kind==="contact"&&<Editor key={edit.id||"new"} title="联系人信息" fields={contactFields} initial={(detail.contacts.find(c=>c.id===edit.id)||{is_active:true}) as unknown as Record<string,Value>} submit="保存联系人" cancel={()=>setEdit(null)} save={d=>save(`/customers/${selected}/contacts${edit.id?"/"+edit.id:""}`,edit.id?"PUT":"POST",d)} />}</section>
      {role!=="finance"&&<><section id="customer-followups" className="card data-section"><h2>跟进记录</h2>{processWrite&&<button onClick={()=>setEdit({kind:"followup"})}>新增跟进</button>}{edit?.kind==="followup"&&<Editor key={edit.id||"new"} title="记录跟进" fields={followFields} initial={(detail.followups.find(f=>f.id===edit.id)||{occurred_at:new Date().toISOString()}) as unknown as Record<string,Value>} submit="保存跟进与下一步" cancel={()=>setEdit(null)} save={d=>save(`/customers/${selected}/followups${edit.id?"/"+edit.id:""}`,edit.id?"PUT":"POST",d)}/>}<p className="muted">同时填写下一步动作和时间，将自动生成一条待办；修改保留历史。</p>{followList(detail.followups)}</section><section id="customer-tasks" className="card data-section"><h2>客户待办</h2>{["owner","manager","sales"].includes(role)&&<button onClick={()=>setEdit({kind:"newtask"})}>为客户安排待办</button>}{taskList(detail.tasks)}</section><section className="card data-section"><h2>客户商机</h2>{processWrite&&<button onClick={()=>setEdit({kind:"opportunity"})}>新增商机</button>}{edit?.kind==="opportunity"&&<Editor key={edit.id||"new"} title="商机信息" fields={oppFields} initial={(detail.opportunities.find(o=>o.id===edit.id)||{owner_user_id:customer.owner_user_id||userId}) as unknown as Record<string,Value>} submit="保存商机" cancel={()=>setEdit(null)} save={d=>save(`/customers/${selected}/opportunities${edit.id?"/"+edit.id:""}`,edit.id?"PUT":"POST",d)}/>}<p className="muted">商机预计金额用于销售过程管理，赢单不会生成正式销售订单。</p>{oppList(detail.opportunities)}</section></>}
      <section id="customer-transactions" className="card data-section"><h2>精斗云销售历史</h2><p>按销售数据权限显示导入记录；客户转交不改变历史业绩归属。以下为源销售核对值，退货和作废范围仍待业务确认。</p><div className="cards crm-summary"><div><span>累计源销售金额</span><h3>{money(detail.sales_summary.total_amount)} 元</h3></div><div><span>本年源销售金额</span><h3>{money(detail.sales_summary.year_amount)} 元</h3></div><div><span>授权订单 / 最近成交</span><h3>{detail.sales_summary.order_count} 单</h3><p>{detail.sales_summary.last_order_date||"暂无记录"}</p></div></div>{detail.sales_summary.top_products.length>0&&<><h3>主要购买商品（按源行金额）</h3>{detail.sales_summary.top_products.map((p,i)=><p key={i}>{p.name} · {money(p.amount)} 元</p>)}</>}{detail.orders.length===0?<p>暂无授权范围内的销售记录。</p>:<div className="table-scroll"><table><thead><tr><th>单号</th><th>日期</th><th>源销售金额（元）</th></tr></thead><tbody>{detail.orders.map(o=><tr key={o.id}><td>{o.order_no}</td><td>{o.order_date}</td><td>{money(o.sales_amount)}</td></tr>)}</tbody></table></div>}</section>
      {role!=="finance"&&<section className="card data-section"><h2>操作时间线</h2>{detail.events.length===0?<p>暂无 CRM 操作。</p>:detail.events.map(e=><p key={e.id}>{fmt(e.occurred_at)} · {name(e.user_id)} · {({customer_create:"创建潜客",customer_pool_backfill:"存量客户移入公海",customer_update:"修改客户",customer_transfer:"调整客户归属",customer_bind:"绑定正式客户",followup_create:"新增跟进",followup_update:"修改跟进",followup_void:"作废跟进",contact_create:"新增联系人",contact_update:"修改联系人",task_create:"创建待办",task_complete:"完成待办",task_update:"修改待办",task_transfer:"转交待办",opportunity_create:"创建商机",opportunity_update:"修改商机",opportunity_transfer:"转交商机",customer_tags_update:"调整客户标签"} as Record<string,string>)[e.activity_type]||"客户操作"}{e.details?.after?.reason?" · "+e.details.after.reason:""}</p>)}</section>}<div className="crm-actions"><button disabled={loading||historyOffset===0} onClick={()=>setHistoryOffset(Math.max(0,historyOffset-50))}>较新客户记录</button><span>客户历史第 {historyOffset/50+1} 页（跟进、待办、商机、订单、时间线各 50 条）</span><button disabled={loading||!detail.has_more_history} onClick={()=>setHistoryOffset(historyOffset+50)}>更早客户记录</button></div></>}
    {edit?.kind==="newtask"&&<section className="card data-section"><Editor title="新建待办" fields={[{key:"title",label:"待办标题",required:true},{key:"assignee_user_id",label:"执行人",required:true,options:personOptions},{key:"due_at",label:"截止时间（北京时间）",type:"datetime-local",required:true},{key:"priority",label:"优先级",options:[["normal","普通"],["high","高"],["urgent","紧急"],["low","低"]]}]} initial={{assignee_user_id:customer?.owner_user_id||userId}} submit="创建待办" cancel={()=>setEdit(null)} save={d=>save("/tasks","POST",{...d,customer_id:selected})}/></section>}
    {!selected&&tab==="settings"&&["owner","admin"].includes(role)&&config&&<section className="card data-section"><Editor title="CRM 参数" fields={[{key:"sales_create_tags",label:"允许销售和经理自建标签",type:"checkbox"},{key:"public_pool_claim_enabled",label:"允许公海领取",type:"checkbox"},{key:"allow_prospect_create",label:"允许新增潜客（默认关闭：客户以精斗云导入为准）",type:"checkbox"},{key:"followup_edit_hours",label:"销售跟进修改时限（小时，0—720）",type:"number",required:true,min:"0",max:"720",step:"1"}]} initial={{...config}} submit="保存 CRM 参数" save={d=>save("/settings","PUT",{...d,followup_edit_hours:Number(d.followup_edit_hours)})}/><p>公海自动回收未启用；跟进、转交和配置变更均保留操作历史。</p></section>}
    {!selected&&((["owner","admin"].includes(role)&&tab==="settings")||(processWrite&&config?.sales_create_tags&&tab==="customers"))&&<section className="card data-section"><Editor title="维护公共标签" fields={[{key:"tag_name",label:"标签名称",required:true,maxLength:100},{key:"tag_group",label:"标签组",maxLength:32}]} submit="新增标签" save={d=>save("/tags","POST",d)}/>{["owner","admin"].includes(role)&&tags.map(t=><p key={t.id}>{t.tag_name} · {t.is_active?"启用":"停用"}<button disabled={busy} onClick={()=>act(()=>api(`/tags/${t.id}`,"PUT",{tag_name:t.tag_name,tag_group:t.tag_group,is_active:!t.is_active}))}>{t.is_active?"停用标签":"启用标签"}</button></p>)}</section>}
  </section>;
}
