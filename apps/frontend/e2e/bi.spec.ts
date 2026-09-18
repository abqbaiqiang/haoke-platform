import { test, expect, Page, request as pwRequest } from "@playwright/test";

// 销售工作台的退出入口折叠在侧边栏账户菜单 details 中。
async function openAccountMenu(page: Page, role: string) {
  if (role === "sales") await page.locator("details.sales-account summary").click();
  await expect(page.getByRole("button", { name: "退出登录", exact: true })).toBeVisible();
}

// 显示名可被管理端修改，用例一律按 username 定位人员，再取当前显示名。
async function findStaff(page: Page, username: string, headers?: Record<string, string>) {
  const list = await (await page.request.get("/api/staff", { headers })).json();
  const staff = list.find((u: { username: string }) => u.username === username);
  expect(staff, `staff ${username} should exist`).toBeTruthy();
  return staff as { id: string; display_name: string };
}

async function login(page: Page, role: string) {
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(`demo_${role}`);
  await page.getByLabel("密码", { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await openAccountMenu(page, role);
}
const origin = () => ({ Origin: process.env.E2E_BASE_URL || "http://localhost:3000" });

async function sample(page: Page) {
  const code = `bi_${Date.now()}`;
  const source = await page.request.post("/api/data/sources", { headers: origin(), data: { source_code: code, source_name: code, entity_name: "人工BI测试公司" } });
  expect(source.status()).toBe(201);
  const { id } = await source.json();
  // demo_sales 的显示名可能被改过；用独立会话按登录名解析其账号 id。
  const tmp = await pwRequest.newContext({ baseURL: process.env.E2E_BASE_URL || "http://localhost:3000" });
  expect((await tmp.post("/api/auth/login", { headers: { Origin: process.env.E2E_BASE_URL || "http://localhost:3000" }, data: { username: "demo_sales", password: process.env.DEMO_PASSWORD! } })).ok()).toBeTruthy();
  const staffId = (await (await tmp.get("/api/auth/me")).json()).user.id as string;
  await tmp.dispose();
  expect((await page.request.put(`/api/data/sources/${id}/staff`, { headers: origin(), data: { staff: { "测试业务员": staffId } } })).ok()).toBeTruthy();
  for (const [kind, csv] of [
    ["customer", "客户编码,客户名称\n001,BI测试客户\n"],
    ["product", "商品编码,商品名称\nP001,BI测试商品\n"],
    ["sales", "单据编号,单据日期,客户编码,销售人员,销售金额,商品编码,数量,金额,最后修改时间\nBI001,2026-08-01,001,测试业务员,0.30,P001,1,0.10,2026-08-01 10:00:00\n,,,,,P001,1,0.20,\n,,,,,合计:,,0.30,\n"],
  ]) {
    const uploaded = await page.request.post(`/api/data/imports?source_id=${id}&kind=${kind}&filename=bi.csv`, { headers: { ...origin(), "Content-Type": "application/octet-stream" }, data: Buffer.from(csv) });
    expect(uploaded.status()).toBe(201);
    const batch = await uploaded.json();
    expect((await page.request.post(`/api/data/imports/${batch.id}/confirm`, { headers: origin(), data: { acknowledge_warnings: true } })).ok()).toBeTruthy();
  }
  return { id, code };
}

test("M3 target save, workbench, team and CRM navigation", async ({ page }) => {
  // 团队页按人×数据源逐个计算工作台指标；开发库累积历史 E2E 样例源后单请求约 7 秒（生产规模 P95 待优化项）。
  test.setTimeout(90000);
  await login(page, "owner");
  const salesStaff = await findStaff(page, "demo_sales");
  // 个人工作台不再有左侧一级入口（导航 4 组收敛）：经“团队执行”点人员名进入。
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "打开团队执行", exact: true }).click();
  await page.getByRole("button", { name: salesStaff.display_name, exact: true }).click();
  await page.getByLabel("查看人员").selectOption(salesStaff.id);
  await page.getByLabel("统计月份").fill("2026-08");
  const form = page.getByRole("form", { name: "设置销售目标" });
  await form.getByLabel("月目标金额（元）").fill("123.45");
  await form.getByLabel("调整说明").fill("人工浏览器测试");
  await form.getByRole("button", { name: "保存月目标" }).click();
  await expect(page.getByRole("status").filter({ hasText: "目标已保存" })).toBeVisible();
  const card = page.locator(".bi-metrics .card").filter({ has: page.locator("span", { hasText: /^月销售目标$/ }) });
  await expect(card.locator("strong")).toContainText("123.45");
  await card.getByText("口径说明", { exact: true }).click();
  await expect(card).toContainText("sales_target.sales_amount_target");
  await expect(page.getByText("统计截至", { exact: false }).first()).toBeVisible();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "打开团队执行", exact: true }).click();
  const salesRow = page.getByRole("row").filter({ has: page.getByRole("button", { name: salesStaff.display_name, exact: true }) });
  await expect(salesRow.getByRole("cell").nth(1)).toHaveText("123.45", { timeout: 30000 });
  await page.getByRole("button", { name: salesStaff.display_name, exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `../../.tools/m3-workbench-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "进入客户与待办", exact: true }).click();
  await expect(page.getByRole("heading", { name: "客户与待办", exact: true })).toBeVisible();
});

test("M3 imported sales chart, drilldown and explicit source review", async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await login(page, "admin");
  const src = await sample(page);
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "owner");
  await page.getByRole("link", { name: "打开销售分析", exact: true }).click();
  await page.getByLabel("分析数据源").selectOption(src.id);
  await page.getByLabel("统计月份").fill("2026-08");
  await expect(page.getByRole("heading", { name: "已确认经营销售 · 2026-08" })).toBeVisible();
  await expect(page.locator(".bi-chart svg")).toBeVisible();
  await page.getByRole("button", { name: "查看源订单", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "查看明细", exact: true }).click();
  await expect(modal.getByRole("heading", { name: "BI001", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await page.getByLabel("数据口径").selectOption("verified");
  await expect(page.getByRole("cell", { name: "BI测试客户", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "admin");
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "打开目标与日历", exact: true }).click();
  await page.getByLabel("分析数据源").selectOption(src.id);
  const review = page.getByRole("form", { name: "销售数据核实" });
  await review.getByLabel("完整覆盖起日").fill("2026-08-01");
  await review.getByLabel("完整覆盖止日").fill("2026-08-31");
  await review.getByLabel("有效单据状态值（逗号分隔）").fill("unverified");
  await review.getByLabel("核实依据").fill("仅人工夹具核实，非真实公司数据");
  await review.getByLabel("销售人员映射已完整核实").check();
  await review.getByLabel("已人工核实有效单据、退货/作废和导出期间").check();
  await expect(page.getByLabel("分析数据源")).toHaveValue(src.id);
  const savedResponse = page.waitForResponse(r => r.url().endsWith(`/api/bi/reviews/${src.id}`) && r.request().method() === "PUT");
  await review.getByRole("button", { name: "保存人工核实结论" }).click();
  expect((await savedResponse).status()).toBe(200);
  expect(await (await page.request.get(`/api/bi/reviews/${src.id}`)).json()).not.toBeNull();
  await expect(page.getByRole("status").filter({ hasText: "设置已保存" })).toBeVisible();
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "owner");
  await page.getByRole("link", { name: "打开销售分析", exact: true }).click();
  await page.getByLabel("分析数据源").selectOption(src.id);
  await page.getByLabel("统计月份").fill("2026-08");
  await page.getByLabel("数据口径").selectOption("verified");
  await page.getByLabel("分析维度").selectOption("product");
  // 商品毛利区块与销售变化贡献表会出现同名商品单元格，取第一个即可。
  await expect(page.getByRole("cell", { name: "BI测试商品", exact: true }).first()).toBeVisible();
  const amount = page.locator(".bi-metrics .card").filter({ has: page.locator("span", { hasText: /^经营销售额$/ }) });
  await expect(amount.locator("strong")).toContainText("0.30");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `../../.tools/m3-analysis-${test.info().project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("M3 admin calendar persists and sales request retries", async ({ page }) => {
  await login(page, "admin");
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "打开目标与日历", exact: true }).click();
  await page.getByLabel("例外日期").fill("2026-09-12");
  await page.getByLabel("该日安排").selectOption("work");
  await page.getByRole("button", { name: "加入日历例外" }).click();
  await page.getByRole("button", { name: "保存日历与参数" }).click();
  await expect(page.getByRole("status").filter({ hasText: "设置已保存" })).toBeVisible();
  const saved = await (await page.request.get("/api/bi/settings")).json();
  expect(saved.calendar["2026-09-12"]).toBe(true);
  await page.getByRole("button", { name: "退出登录" }).click();
  let failing = true;
  await page.route("**/api/bi/workbench/**", route => failing ? route.fulfill({ status: 503, json: { error: { message: "测试暂时不可用" } } }) : route.continue());
  await login(page, "sales");
  await expect(page.getByRole("alert").filter({ hasText: "测试暂时不可用" })).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  // 工作台已重构为"今日行动页"（2026-09-16）：只保留行动与任务内容，业绩 KPI 移至我的业绩页。
  await expect(page.locator(".wb-root")).toBeVisible();
  await expect(page.locator(".wb-kpis")).toBeVisible();
  await expect(page.locator(".sales-kpis")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "保存月目标" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "团队执行" })).toHaveCount(0);
  const settings = await page.request.get("/api/bi/settings");
  expect(settings.status()).toBe(403);
});
