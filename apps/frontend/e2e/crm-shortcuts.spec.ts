import {test,expect,Page} from '@playwright/test';

async function login(page:Page,role:string) {
  await page.goto('/');
  await page.getByLabel('账号',{exact:true}).fill(`demo_${role}`);
  await page.getByLabel('密码',{exact:true}).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  if (role==='sales') await page.locator('details.sales-account summary').click();
  await expect(page.getByRole('button',{name:'退出登录',exact:true})).toBeVisible();
}

// FIXME(2026-09-15 验收同步)：新增潜客已按产品决策关闭、销售端迁移到销售工作台（sales.tsx），
// 本用例的潜客创建/CRM 工作台路径不复存在；待按“导入→公海→认养”与销售工作台重写。
test.fixme('workbench preserves CRM view and person, open status and quick followup',async({page})=>{
  test.setTimeout(60000);
  await login(page,'sales');
  const headers={Origin:new URL(page.url()).origin};
  const uid=(await (await page.request.get('/api/auth/me')).json()).user.id;
  const suffix=Date.now();
  const created=await page.request.post('/api/crm/customers',{headers,data:{customer_name:`快捷客户 ${suffix}`}});
  expect(created.status()).toBe(201);
  const cid=(await created.json()).customer.id;
  const title=`快捷待办 ${suffix}`;
  const task=await page.request.post('/api/crm/tasks',{headers,data:{title,customer_id:cid,assignee_user_id:uid,due_at:new Date().toISOString()}});
  expect(task.status()).toBe(201);
  for(const stage of ['initial','won']){
    const r=await page.request.post(`/api/crm/customers/${cid}/opportunities`,{headers,data:{opportunity_name:`快捷商机 ${stage} ${suffix}`,owner_user_id:uid,stage}});
    expect(r.status()).toBe(201);
  }
  await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'销售工作台',exact:true}).click();
  await page.getByRole('button',{name:/^今日待办/}).click();
  await expect(page.getByRole('button',{name:'今天',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByLabel('筛选负责人')).toHaveValue(uid);
  await page.locator('article').filter({has:page.getByText(title,{exact:true})}).getByRole('button',{name:'快速记录跟进'}).click();
  const form=page.getByRole('form',{name:'记录跟进'});
  await expect(form.getByRole('heading')).toBeInViewport();
  await form.getByLabel('沟通摘要').fill('从工作台继续跟进');
  await form.getByRole('button',{name:'保存跟进与下一步'}).click();
  await expect(page.getByText('从工作台继续跟进',{exact:true})).toBeVisible();
  expect((await (await page.request.get(`/api/crm/tasks?view=today&assignee_user_id=${uid}`)).json()).find((t:{title:string})=>t.title===title).status).toBe('todo');
  await page.locator('article').filter({has:page.getByText(title,{exact:true})}).getByRole('button',{name:'快速记录跟进'}).click();
  await expect(form.getByRole('heading')).toBeInViewport();
  await form.getByRole('button',{name:'取消编辑'}).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('button',{name:'退出登录'}).click();
  await login(page,'owner');
  for(const [button,view] of [['本周待办','本周'],['逾期待办','逾期'],['开放商机','']]){
    await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'销售工作台',exact:true}).click();
    await page.getByLabel('查看人员').selectOption(uid);
    await expect(page.locator('.bi-metrics')).toBeVisible();
    await page.getByRole('button',{name:new RegExp('^'+button)}).click();
    await expect(page.getByLabel('筛选负责人')).toHaveValue(uid);
    if(view) await expect(page.getByRole('button',{name:view,exact:true})).toHaveAttribute('aria-pressed','true');
    else {
      await expect(page.getByLabel('仅显示开放商机')).toBeChecked();
      await expect(page.getByText(`快捷商机 initial ${suffix}`,{exact:true})).toBeVisible();
      await expect(page.getByText(`快捷商机 won ${suffix}`,{exact:true})).toHaveCount(0);
      await page.getByLabel('仅显示开放商机').uncheck();
      await expect(page.getByText(`快捷商机 won ${suffix}`,{exact:true})).toBeVisible();
    }
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
