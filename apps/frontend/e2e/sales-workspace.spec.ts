import {test,expect,request as pwRequest} from "@playwright/test";
import path from "node:path";

test("sales reference design: customer, task, followup, next step and role navigation",async({page},info)=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto('/');
 await page.getByLabel('账号',{exact:true}).fill('demo_sales');
 await page.getByLabel('密码',{exact:true}).fill(process.env.DEMO_PASSWORD!);
 await page.getByRole('button',{name:'登录',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'主导航'});
 await expect(nav.getByRole('link')).toHaveCount(4);
 await expect(page.getByRole('heading',{name:'工作台',exact:true})).toBeVisible();
 const me=(await (await page.request.get('/api/auth/me')).json()).user;
 const suffix=Date.now().toString();
 const headers={origin:new URL(page.url()).origin};
 // 新增潜客已按产品决策关闭（CHANGELOG 2026-09-15）：由老板导入客户档案进入公海，销售认养。
 const base=process.env.E2E_BASE_URL||"http://localhost:3000";
 const tmp=await pwRequest.newContext({baseURL:base});
 expect((await tmp.post('/api/auth/login',{headers:{Origin:base},data:{username:'demo_owner',password:process.env.DEMO_PASSWORD!}})).ok()).toBeTruthy();
 const oh={Origin:base};
 const source=await (await tmp.post('/api/data/sources',{headers:oh,data:{source_code:`sw_${suffix}`,source_name:`销售工作台验收源 ${suffix}`,entity_name:'人工销售工作台测试'}})).json();
 const csv=`客户编码,客户名称
SW${suffix},销售工作台验收 ${suffix}
`;
 const uploaded=await tmp.post(`/api/data/imports?source_id=${source.id}&kind=customer&filename=sw.csv`,{headers:{...oh,'Content-Type':'application/octet-stream'},data:Buffer.from(csv,'utf-8')});
 expect(uploaded.status()).toBe(201);
 const batch=await uploaded.json();
 expect((await tmp.post(`/api/data/imports/${batch.id}/confirm`,{headers:oh,data:{acknowledge_warnings:true}})).ok()).toBeTruthy();
 await tmp.dispose();
 const pool=await (await page.request.get(`/api/crm/customers?pool=1&q=${encodeURIComponent('销售工作台验收 '+suffix)}`,{headers})).json();
 expect(pool.total).toBe(1);
 const customer=pool.rows[0];
 expect((await page.request.post(`/api/crm/customers/${customer.id}/claim`,{headers})).status()).toBe(200);
 const due=new Date(Date.now()+3600000).toISOString();
 const t=await page.request.post('/api/crm/tasks',{headers,data:{title:'确认礼盒数量 '+suffix,customer_id:customer.id,assignee_user_id:me.id,due_at:due,task_type:'followup'}});
 expect(t.status()).toBe(201);
 const task=(await t.json());
 await page.reload();
 await expect(page.locator('.sales-main')).not.toContainText('请求失败');
 await nav.getByRole('link',{name:'待办',exact:true}).click();
 const row=page.getByRole('row').filter({hasText:'确认礼盒数量 '+suffix});
 await expect(row).toBeVisible();
 await row.getByRole('button',{name:'记录跟进',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'记录跟进',exact:true});
 await expect(dialog).toContainText(customer.customer_name);
 await dialog.getByLabel('沟通摘要',{exact:true}).fill('已确认数量，明天发送最终方案');
 await dialog.getByLabel('下一步动作',{exact:true}).fill('发送最终方案 '+suffix);
 const tomorrow=new Date(Date.now()+86400000+8*3600000).toISOString().slice(0,16);
 await dialog.getByLabel('下次联系时间（北京时间）',{exact:true}).fill(tomorrow);
 await expect(dialog.getByLabel('同时完成当前待办')).toBeChecked();
 await page.screenshot({path:path.resolve('../../.tools/qa/sales-new-'+info.project.name+'-followup.png'),fullPage:true});
 await dialog.getByRole('button',{name:'保存跟进与下一步'}).click();
 await expect(dialog).not.toBeVisible();
 await expect(page.getByRole('status')).toContainText('跟进已保存');
 const done=(await (await page.request.get('/api/sales/tasks?view=done&limit=100')).json()).rows;
 expect(done.some((x:{id:string})=>x.id===task.id)).toBeTruthy();
 const future=(await (await page.request.get('/api/sales/tasks?view=future&limit=100')).json()).rows;
 expect(future.filter((x:{title:string})=>x.title==='发送最终方案 '+suffix)).toHaveLength(1);
 await nav.getByRole('link',{name:'客户',exact:true}).click();
 // 顶栏与列表工具栏都是 search 表单；列表内搜索用带 aria-label 的输入框回车提交。
 const listSearch=page.getByLabel('搜索客户',{exact:true});
 await listSearch.fill(suffix);
 await listSearch.press('Enter');
 await expect(page.getByRole('row').filter({hasText:customer.customer_name})).toContainText('发送最终方案');
 await page.getByRole('row').filter({hasText:customer.customer_name}).getByRole('button',{name:'查看客户'}).click();
 await expect(page.getByRole('heading',{name:customer.customer_name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'← 返回客户列表',exact:true}).click();
 await page.getByRole('button',{name:'客户公海',exact:true}).click();
 await expect(nav.getByRole('link',{name:'客户',exact:true})).toHaveAttribute('aria-current','page');
 await page.goBack();
 await expect(page.getByRole('button',{name:'我的客户',exact:true})).toHaveAttribute('aria-pressed','true');
 for(const [name,key] of [['工作台','workbench'],['客户','customers'],['待办','tasks'],['我的业绩','performance']]){
  await nav.getByRole('link',{name,exact:true}).click();
  await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await expect(page.locator('.sales-main')).not.toContainText('正在加载');
  await page.screenshot({path:path.resolve('../../.tools/qa/sales-new-'+info.project.name+'-'+key+'.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
 }
 expect(errors).toEqual([]);
 // 打开一次账户菜单（点两次会开又关，导致退出按钮不可见）。
 await page.locator('details.sales-account summary').click();
 await page.getByRole('button',{name:'退出登录',exact:true}).click();
 await expect(page.getByLabel('账号',{exact:true})).toBeVisible();
 await page.getByLabel('账号',{exact:true}).fill('demo_owner');
 await page.getByLabel('密码',{exact:true}).fill(process.env.DEMO_PASSWORD!);
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'人员管理',exact:true})).toBeVisible();
});
