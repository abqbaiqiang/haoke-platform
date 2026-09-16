import {test,expect,Page} from '@playwright/test';

async function login(page:Page,role:string) {
  await page.goto('/');
  await page.getByLabel('账号',{exact:true}).fill(`demo_${role}`);
  await page.getByLabel('密码',{exact:true}).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  if (role.startsWith('sales')) { // demo_sales / demo_sales2 都是销售工作台
    const account=page.locator('details.sales-account');
    await account.locator('summary').click();
    await expect(account.getByRole('button',{name:'退出登录',exact:true})).toBeVisible();
    await account.locator('summary').click(); // 展开后收起，避免菜单遮挡页面按钮
    await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'客户',exact:true}).click();
  } else {
    await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'客户管理',exact:true}).click();
  }
}
async function logout(page:Page) {
  const account=page.locator('details.sales-account');
  if(await account.count() && await account.getAttribute('open')===null) await account.locator('summary').click();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await expect(page.getByRole('heading',{name:'欢迎登录'})).toBeVisible();
}

test('Imported customers can be selected across pages and assigned without duplicate records',async({page},info)=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await login(page,'owner');
  const headers={Origin:new URL(page.url()).origin};
  const unique=`分配样本${Date.now()}`;
  const created=await page.request.post('/api/data/sources',{headers,data:{source_code:`assign_${Date.now()}`,source_name:unique,entity_name:'人工分配测试'}});
  expect(created.status()).toBe(201);
  const {id}=await created.json();
  const csv='客户编码,客户名称\n'+Array.from({length:65},(_,i)=>`C${i},${unique}-${String(i).padStart(2,'0')}`).join('\n')+'\n';
  const uploaded=await page.request.post(`/api/data/imports?source_id=${id}&kind=customer&filename=assign.csv`,{headers:{...headers,'Content-Type':'application/octet-stream'},data:Buffer.from(csv)});
  expect(uploaded.status()).toBe(201);
  const batch=await uploaded.json();
  expect((await page.request.post(`/api/data/imports/${batch.id}/confirm`,{headers,data:{acknowledge_warnings:true}})).status()).toBe(200);
  await page.reload();
  await page.getByRole('combobox',{name:'客户归属',exact:true}).selectOption('public_pool');
  await page.getByLabel('搜索客户',{exact:true}).fill(unique);
  await page.getByRole('button',{name:'搜索',exact:true}).click();
  const form=page.getByRole('form',{name:'批量分配客户'});
  await expect(form.getByRole('button',{name:'选择全部筛选结果（65）',exact:true})).toBeEnabled();
  await form.getByRole('button',{name:'选择本页',exact:true}).click();
  await expect(form).toContainText('已选 30 个客户');
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(page.getByLabel(`选择客户 ${unique}-30`,{exact:true})).toBeEnabled();
  await form.getByRole('button',{name:'选择本页',exact:true}).click();
  await expect(form).toContainText('已选 60 个客户');
  await form.getByRole('button',{name:'选择全部筛选结果（65）',exact:true}).click();
  await expect(form).toContainText('已选 65 个客户');
  const staff=await (await page.request.get('/api/staff',{headers})).json();
  const assignee=staff.find((u:{username:string})=>u.username==='demo_sales');
  expect(assignee,'demo_sales should exist').toBeTruthy();
  await form.getByLabel('分配给销售').selectOption(assignee.id);
  await form.getByLabel('分配说明').fill('人工导入客户首次分配');
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:960});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.screenshot({path:`../../.tools/qa/batch-assignment-${info.project.name}-${width}.png`,fullPage:false});
  }
  await form.getByRole('button',{name:'确认批量分配',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:`已将 65 个客户分配给 ${assignee.display_name}`})).toBeVisible();
  await expect(form).toContainText('已选 0 个客户');
  const filter=`q=${encodeURIComponent(unique)}`;
  expect((await (await page.request.get(`/api/crm/customers?${filter}&ownership=public_pool`)).json()).total).toBe(0);
  expect((await (await page.request.get(`/api/crm/customers?${filter}`)).json()).total).toBe(65);
  await logout(page);await login(page,'sales');
  await expect(page.getByRole('combobox',{name:'客户归属',exact:true})).toHaveCount(0);
  // 销售工作台的列表搜索由输入框回车提交；顶栏搜索按钮属于另一张表单。
  const salesSearch=page.getByLabel('搜索客户',{exact:true});
  await salesSearch.fill(unique);
  await salesSearch.press('Enter');
  await expect(page.getByText(`${unique}-00`,{exact:true})).toBeVisible();
  const listed=await (await page.request.get(`/api/crm/customers?${filter}`)).json();
  expect(listed.total).toBe(65);
  const customerId=listed.rows[0].id;
  await logout(page);await login(page,'sales2');
  expect((await (await page.request.get(`/api/crm/customers?${filter}`)).json()).total).toBe(0);
  expect((await page.request.get(`/api/crm/customers/${customerId}`)).status()).toBe(404);
  expect(errors).toEqual([]);
});
