import { test, expect, request as pwRequest } from "@playwright/test";

// 客户位置卡（Web 端客户位置功能）：无 Key 环境验证降级路径与已定位展示；
// 真实地图交互（搜索/点选/拖拽）依赖腾讯 Key，为人工验收项。
test("customer location card: unset, degraded editor, api save then located card", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill("demo_sales");
  await page.getByLabel("密码", { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "主导航" });
  await expect(nav.getByRole("link", { name: "客户", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "客户", exact: true }).click();
  await expect(page.getByRole("button", { name: "我的客户", exact: true })).toHaveAttribute("aria-pressed", "true");

  const suffix = Date.now().toString();
  const headers = { origin: new URL(page.url()).origin };
  const base = process.env.E2E_BASE_URL || "http://localhost:3000";
  const tmp = await pwRequest.newContext({ baseURL: base });
  expect((await tmp.post("/api/auth/login", { headers: { Origin: base }, data: { username: "demo_owner", password: process.env.DEMO_PASSWORD! } })).ok()).toBeTruthy();
  const oh = { Origin: base };
  const source = await (await tmp.post("/api/data/sources", { headers: oh, data: { source_code: `loc_${suffix}`, source_name: `客户位置验收源 ${suffix}`, entity_name: "人工客户位置测试" } })).json();
  const csv = `客户编码,客户名称\nLOC${suffix},客户位置验收 ${suffix}\n`;
  const uploaded = await tmp.post(`/api/data/imports?source_id=${source.id}&kind=customer&filename=loc.csv`, { headers: { ...oh, "Content-Type": "application/octet-stream" }, data: Buffer.from(csv, "utf-8") });
  expect(uploaded.status()).toBe(201);
  const batch = await uploaded.json();
  expect((await tmp.post(`/api/data/imports/${batch.id}/confirm`, { headers: oh, data: { acknowledge_warnings: true } })).ok()).toBeTruthy();
  await tmp.dispose();
  const pool = await (await page.request.get(`/api/crm/customers?pool=1&q=${encodeURIComponent("客户位置验收 " + suffix)}`, { headers })).json();
  expect(pool.total).toBe(1);
  const customer = pool.rows[0];
  expect((await page.request.post(`/api/crm/customers/${customer.id}/claim`, { headers })).status()).toBe(200);

  const mapConfig = await (await page.request.get("/api/map/config", { headers })).json();
  // 顶栏与列表工具栏都是 search 表单；列表内搜索用带 aria-label 的输入框回车提交。
  const listSearch = page.getByLabel("搜索客户", { exact: true });
  await listSearch.fill(suffix);
  await listSearch.press("Enter");
  await page.getByRole("row").filter({ hasText: customer.customer_name }).getByRole("button", { name: "查看客户", exact: true }).click();
  await expect(page.getByRole("heading", { name: customer.customer_name, exact: true })).toBeVisible();

  // Case 1：无坐标客户显示“尚未设置”。
  const card = page.getByRole("region", { name: "客户位置" });
  await expect(card).toBeVisible();
  await expect(card.getByText("尚未设置", { exact: true })).toBeVisible();

  // Case 2：设置位置弹窗打开；无 Key 时明确降级提示，不得白屏。
  await card.getByRole("button", { name: "设置位置", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "设置客户位置" });
  await expect(editor).toBeVisible();
  if (mapConfig.enabled) {
    await expect(editor.getByLabel("地址搜索")).toBeVisible();
  } else {
    await expect(editor.getByText("地图暂时无法加载，请稍后重试。", { exact: true })).toBeVisible();
  }
  await editor.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await expect(editor).toBeHidden();

  // Case 7/8/10：保存后（此处经同一 PUT API，模拟地图端保存）卡片立即显示“已定位”，刷新仍在。
  const saved = await page.request.put(`/api/crm/customers/${customer.id}/location`, {
    headers,
    data: { latitude: 36.675278, longitude: 117.120389, coordinate_system: "GCJ-02", location_source: "map_drag" },
  });
  expect(saved.status()).toBe(200);
  await page.reload();
  const cardAfter = page.getByRole("region", { name: "客户位置" });
  await expect(cardAfter.getByText("已定位", { exact: true })).toBeVisible();
  await expect(cardAfter.getByText(/最后更新/)).toBeVisible();
  await cardAfter.getByRole("button", { name: "查看位置", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: customer.customer_name });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText(/经纬度：36\.6752780, 117\.1203890/)).toBeVisible();
  await viewer.getByRole("button", { name: "关闭窗口", exact: true }).click();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});
