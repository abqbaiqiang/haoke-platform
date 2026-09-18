import { test, expect, Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill("demo_owner");
  await page.getByLabel("密码", { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "经营驾驶舱", exact: true })).toBeVisible();
}

test("Cockpit real imports, chart switch, customer drilldown and responsive layout", async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await login(page);
  const headers = { Origin: new URL(page.url()).origin };
  const code = `cockpit_${Date.now()}`;
  const created = await page.request.post("/api/data/sources", { headers, data: { source_code: code, source_name: code, entity_name: "驾驶舱人工测试" } });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  for (const [kind, csv] of [
    ["customer", "客户编码,客户名称\nC1,驾驶舱人工客户\n"],
    ["product", "商品编码,商品名称\nP1,驾驶舱人工商品\n"],
    ["sales", `单据编号,单据日期,客户编码,销售人员,销售金额,商品编码,数量,金额\nD1,${today},C1,未映射人工销售,328600.00,P1,1,328600.00\n,,,,,合计:,,328600.00\n`],
  ]) {
    const upload = await page.request.post(`/api/data/imports?source_id=${id}&kind=${kind}&filename=cockpit.csv`, { headers: { ...headers, "Content-Type": "application/octet-stream" }, data: Buffer.from(csv) });
    expect(upload.status()).toBe(201);
    const batch = await upload.json();
    expect(batch.preview?.errors || [], JSON.stringify(batch.preview)).toEqual([]);
    expect((await page.request.post(`/api/data/imports/${batch.id}/confirm`, { headers, data: { acknowledge_warnings: true } })).ok()).toBeTruthy();
  }
  await page.reload();
  // 新导入后至少有两个数据源，下拉必然渲染；显式等待避免与首屏加载竞态。
  const sourceSelect = page.getByRole("combobox", { name: "数据源", exact: true });
  await expect(sourceSelect).toBeVisible({ timeout: 20000 });
  await sourceSelect.selectOption(id);
  await expect(page.locator(".cockpit-hero")).toContainText("328,600.00");
  await expect(page.locator(".cockpit-chart svg")).toBeVisible();
  await page.getByRole("button", { name: "成交客户", exact: true }).click();
  await expect(page.getByRole("img", { name: /近\s*\d+\s*个月成交客户数/ })).toBeVisible();
  await page.getByRole("button", { name: "销售额", exact: true }).click();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `../../.tools/qa/cockpit-${info.project.name}-${width}.png`, fullPage: true });
  }
  // 改版后客户贡献面板默认展开（overview.tsx 无 .fold 折叠结构），无需再点击展开。
  await page.getByRole("button", { name: "驾驶舱人工客户", exact: true }).click();
  await expect(page.getByRole("heading", { name: "驾驶舱人工客户", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "驾驶舱人工客户", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "打开客户分析", exact: true }).click();
  await page.getByLabel("分析数据源").selectOption(id);
  const analytics = page.getByRole("region", { name: "客户分析", exact: true });
  await expect(analytics.getByRole("heading", { name: "客户分层（RFM）" })).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const toolbar = await page.locator(".bi-toolbar").boundingBox();
    const body = await analytics.boundingBox();
    expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(body!.y);
  }
  await page.screenshot({ path: `../../.tools/qa/analytics-fixed-${info.project.name}.png`, fullPage: true });
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "打开销售分析", exact: true }).click();
  await expect(page).toHaveURL(/#bi\?tab=sales$/);
  await page.reload();
  await expect(page.getByLabel("分析维度")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("region", { name: "客户分析", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Owner can maintain RFM parameters and CRM settings through real navigation", async ({ page }) => {
  await login(page);
  const nav = page.getByRole("navigation", { name: "主导航" });
  await nav.getByRole("link", { name: "打开目标与日历", exact: true }).click();
  const form = page.getByRole("form", { name: "工作日历与指标参数" });
  await form.getByLabel("RFM 近期成交阈值（天）").fill("75");
  await form.getByLabel("RFM 高频成交阈值（单）").fill("4");
  await form.getByRole("button", { name: "保存日历与参数" }).click();
  await expect(page.getByRole("status").filter({ hasText: "设置已保存" })).toBeVisible();
  const settings = await (await page.request.get("/api/bi/settings")).json();
  expect(settings.rfm_recent_days).toBe(75); expect(settings.rfm_freq_orders).toBe(4);
  await page.reload();
  await expect(form.getByLabel("RFM 高频成交阈值（单）")).toHaveValue("4");
  await nav.getByRole("link", { name: "打开CRM 设置", exact: true }).click();
  await expect(page.getByRole("form", { name: "CRM 参数" })).toBeVisible();
  await expect(page.getByRole("form", { name: "维护公共标签" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("Cockpit reference layout keeps truthful missing values and owner-scoped work links", async ({ page }) => {
  test.setTimeout(90000);
  await page.route("**/api/bi/product-margins?**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "测试成本服务不可用" } }) }));
  await page.route("**/api/crm/tasks?**", route => route.fulfill({ json: Array.from({ length: 100 }, (_, i) => ({ id: `task-${i}` })) }));
  await login(page);
  await expect(page.locator(".dc-kpis > section")).toHaveCount(5);
  await expect(page.locator(".dc-kpi").filter({ hasText: "销售毛利" })).toContainText("毛利加载失败");
  await expect(page.locator(".dc-kpi").filter({ hasText: "销售毛利" }).locator(".dc-kpi-number")).toHaveText("—");
  await expect(page.locator(".dc-chart svg")).toBeVisible();
  const work = page.getByRole("region", { name: "我的待办", exact: true });
  await expect(work.getByRole("button", { name: /100\+.*逾期待办/ })).toBeVisible();
  await expect(work).toContainText("100+ 表示至少 100 条");
  const me = await (await page.request.get("/api/auth/me")).json();
  await work.getByRole("button", { name: /100\+.*逾期待办/ }).click();
  const entry = JSON.parse(new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("crm")!);
  expect(entry).toMatchObject({ tab: "tasks", personId: me.user.id, taskView: "overdue" });
});

test("Cockpit source changes clear supplementary KPIs and allow independent retry", async ({ page }) => {
  test.setTimeout(90000);
  let marginCalls = 0;
  await page.route("**/api/bi/product-margins?**", route => {
    marginCalls++;
    if (marginCalls === 1) return route.fulfill({ status: 503, json: { error: { message: "暂时不可用" } } });
    return route.fulfill({ json: { metrics: [{ code: "SALE_GROSS_PROFIT", label: "销售毛利", value: "1234.56", unit: "元", reason: null, definition: "测试口径", source: "固定样本" }], total_profit: "1234.56", cost_coverage: "50", warnings: [] } });
  });
  await login(page);
  const gross = page.locator(".dc-kpi").filter({ hasText: "销售毛利" });
  await expect(gross).toContainText("毛利加载失败");
  await gross.getByRole("button", { name: "重试 →" }).click();
  await expect(gross).toContainText("1,234.56");
  await expect(gross).toContainText("成本覆盖 50.0%");
  expect(marginCalls).toBe(2);
  // A newly selected source must never retain a previous source's successfully loaded profit.
  const select = page.getByRole("combobox", { name: "数据源", exact: true });
  const next = await select.locator("option").evaluateAll(options => options.map(o => (o as HTMLOptionElement).value));
  if (next.length > 1) {
    await page.unroute("**/api/bi/product-margins?**");
    await page.route("**/api/bi/product-margins?**", route => route.fulfill({ status: 503, json: { error: { message: "新来源不可用" } } }));
    await select.selectOption(next[1]);
    await expect(gross).toContainText("毛利加载失败");
    await expect(gross.locator(".dc-kpi-number")).toHaveText("—");
  }
});
