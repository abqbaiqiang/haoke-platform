import { test, expect, Page } from "@playwright/test";

async function login(page: Page, role: string) {
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(`demo_${role}`);
  await page.getByLabel("密码", { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  if (role === "sales") await page.locator("details.sales-account summary").click();
  await expect(page.getByRole("button", { name: "退出登录", exact: true })).toBeVisible();
  await page.getByRole("navigation", {name:"主导航"}).getByRole("link", { name: "客户管理", exact: true }).click();
}

// FIXME(2026-09-15 验收同步)：新增潜客已按产品决策关闭、销售端迁移到销售工作台（sales.tsx），
// 本用例的潜客创建/CRM 工作台路径不复存在；待按“导入→公海→认养”与销售工作台重写。
test.fixme("M2 binding navigates to canonical customer and keeps contact and followup history", async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const unique = Date.now().toString();
  const name = `绑定潜客 ${unique}`, official = `正式客户 ${unique}`;
  await login(page, "sales");
  const origin = new URL(page.url()).origin;
  const created = await page.request.post("/api/crm/customers", { headers: { Origin: origin }, data: { customer_name: name } });
  expect(created.status()).toBe(201);
  const cid = (await created.json()).customer.id;
  expect((await page.request.post(`/api/crm/customers/${cid}/contacts`, { headers: { Origin: origin }, data: { name: "绑定联系人", role_label: "采购" } })).status()).toBe(201);
  expect((await page.request.post(`/api/crm/customers/${cid}/followups`, { headers: { Origin: origin }, data: { interaction_method: "phone", contact_result: "good", summary: "绑定前沟通证据" } })).status()).toBe(201);
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible();
  await login(page, "admin");
  const source = await page.request.post("/api/data/sources", { headers: { Origin: origin }, data: { source_code: `bind_${unique}`, source_name: `绑定样本 ${unique}`, entity_name: "测试公司" } });
  expect(source.status()).toBe(201);
  const sourceId = (await source.json()).id;
  const upload = await page.request.post(`/api/data/imports?source_id=${sourceId}&kind=customer&filename=customer.csv`, { headers: { Origin: origin, "Content-Type": "application/octet-stream" }, data: Buffer.from(`客户编号,客户名称\nC001,${official}\n`) });
  expect(upload.status()).toBe(201);
  const batch = (await upload.json()).id;
  expect((await page.request.post(`/api/data/imports/${batch}/confirm`, { headers: { Origin: origin }, data: { acknowledge_warnings: true } })).status()).toBe(200);
  await page.getByLabel("搜索客户", { exact: true }).fill(name);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.getByRole('row').filter({ has: page.getByText(name, {exact:true}) }).getByRole("button", { name: "查看客户", exact: true }).click();
  await page.getByRole("button", { name: "绑定精斗云客户", exact: true }).click();
  const form = page.getByRole("form", { name: "查找精斗云正式客户" });
  await form.getByLabel("正式客户名称", { exact: true }).fill(official);
  await form.getByRole("button", { name: "查找可绑定客户" }).click();
  await page.getByRole("button", { name: "绑定此客户", exact: true }).click();
  await expect(page.getByRole("heading", { name: official, exact: true })).toBeVisible();
  await expect(page.getByText("绑定联系人 · 采购", { exact: true })).toBeVisible();
  await expect(page.getByText("绑定前沟通证据", { exact: true })).toBeVisible();
  await expect(page.locator('.crm [role="alert"]')).toHaveCount(0);
  await page.getByRole("button", { name: "作废跟进", exact: true }).click();
  const voidForm = page.getByRole("form", { name: "作废跟进" });
  await voidForm.getByLabel("作废原因").fill("验收样本作废");
  await voidForm.getByRole("button", { name: "确认作废" }).click();
  await expect(page.getByText("已作废，历史内容保留", { exact: true })).toBeVisible();
  await expect(page.getByText("绑定前沟通证据", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

// FIXME(2026-09-15 验收同步)：新增潜客已按产品决策关闭、销售端迁移到销售工作台（sales.tsx），
// 本用例的潜客创建/CRM 工作台路径不复存在；待按“导入→公海→认养”与销售工作台重写。
test.fixme("M2 history pagination and retry remain accessible", async ({ page }) => {
  await login(page, "sales");
  let failed = true;
  await page.route("**/api/crm/followups?**", async route => {
    if (failed) { failed = false; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "暂时无法获取跟进" } }) }); }
    else await route.continue();
  });
  await page.getByRole("button", { name: "跟进记录", exact: true }).click();
  await expect(page.locator('.crm [role="alert"]')).toContainText("暂时无法获取跟进");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator('.crm [role="alert"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "上一页记录", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
