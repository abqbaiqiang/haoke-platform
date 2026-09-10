import { test, expect, Page } from "@playwright/test";

async function login(page: Page, role: string) {
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(`demo_${role}`);
  await page.getByLabel("密码", { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: `欢迎，demo_${role}` })).toBeVisible();
  await page.getByRole("button", { name: "销售工作台", exact: true }).click();
}
const origin = () => ({ Origin: process.env.E2E_BASE_URL || "http://localhost:3000" });

async function sample(page: Page) {
  const code = `bi_${Date.now()}`;
  const source = await page.request.post("/api/data/sources", { headers: origin(), data: { source_code: code, source_name: code, entity_name: "人工BI测试公司" } });
  expect(source.status()).toBe(201);
  const { id } = await source.json();
  const people = await (await page.request.get("/api/bi/people")).json();
  const staff = people.find((p: {name: string}) => p.name === "demo_sales");
  expect((await page.request.put(`/api/data/sources/${id}/staff`, { headers: origin(), data: { staff: { "测试业务员": staff.id } } })).ok()).toBeTruthy();
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
  await login(page, "owner");
  await page.getByLabel("查看人员").selectOption({ label: "demo_sales" });
  await page.getByLabel("统计月份").fill("2026-08");
  const form = page.getByRole("form", { name: "设置月销售目标" });
  await form.getByLabel("月目标金额（元）").fill("123.45");
  await form.getByLabel("调整说明").fill("人工浏览器测试");
  await form.getByRole("button", { name: "保存月目标" }).click();
  await expect(page.getByRole("status").filter({ hasText: "目标已保存" })).toBeVisible();
  const card = page.locator(".bi-metrics .card").filter({ has: page.locator("span", { hasText: /^月销售目标$/ }) });
  await expect(card.locator("strong")).toContainText("123.45");
  await card.getByText("口径说明", { exact: true }).click();
  await expect(card).toContainText("sales_target.sales_amount_target");
  await expect(page.getByText("统计截至", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "团队执行", exact: true }).click();
  await expect(page.getByRole("cell", { name: "123.45", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "demo_sales", exact: true }).click();
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
  await page.getByRole("button", { name: "销售分析", exact: true }).click();
  await page.getByLabel("分析数据源").selectOption(src.id);
  await page.getByLabel("统计月份").fill("2026-08");
  await expect(page.getByRole("heading", { name: "源销售核对 · 2026-08" })).toBeVisible();
  await expect(page.locator(".bi-chart svg")).toBeVisible();
  await page.getByRole("button", { name: "查看源订单", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "查看明细", exact: true }).click();
  await expect(modal.getByRole("heading", { name: "BI001", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await page.getByLabel("数据口径").selectOption("verified");
  await expect(page.getByText("本口径暂无可用记录。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "admin");
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
  await expect(page.getByRole("status")).toContainText("设置已保存");
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "owner");
  await page.getByRole("button", { name: "销售分析", exact: true }).click();
  await page.getByLabel("分析数据源").selectOption(src.id);
  await page.getByLabel("统计月份").fill("2026-08");
  await page.getByLabel("数据口径").selectOption("verified");
  await page.getByLabel("分析维度").selectOption("product");
  await expect(page.getByRole("cell", { name: "BI测试商品", exact: true })).toBeVisible();
  const amount = page.locator(".bi-metrics .card").filter({ has: page.locator("span", { hasText: /^经营销售额$/ }) });
  await expect(amount.locator("strong")).toContainText("0.30");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `../../.tools/m3-analysis-${test.info().project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("M3 admin calendar persists and sales request retries", async ({ page }) => {
  await login(page, "admin");
  await page.getByLabel("例外日期").fill("2026-09-12");
  await page.getByLabel("该日安排").selectOption("work");
  await page.getByRole("button", { name: "加入日历例外" }).click();
  await page.getByRole("button", { name: "保存日历与参数" }).click();
  await expect(page.getByRole("status")).toContainText("设置已保存");
  const saved = await (await page.request.get("/api/bi/settings")).json();
  expect(saved.calendar["2026-09-12"]).toBe(true);
  await page.getByRole("button", { name: "退出登录" }).click();
  let failing = true;
  await page.route("**/api/bi/workbench/**", route => failing ? route.fulfill({ status: 503, json: { error: { message: "测试暂时不可用" } } }) : route.continue());
  await login(page, "sales");
  await expect(page.getByRole("alert").filter({ hasText: "测试暂时不可用" })).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".bi-metrics")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存月目标" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "团队执行" })).toHaveCount(0);
  const settings = await page.request.get("/api/bi/settings");
  expect(settings.status()).toBe(403);
});
