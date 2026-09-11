import { test, expect, Page } from "@playwright/test";

const password = process.env.DEMO_PASSWORD!;
async function login(page: Page, role: string) {
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(`demo_${role}`);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("button", { name: "退出登录", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "数据中心", exact: true }).click();
}
async function createSource(page: Page) {
  await page.getByRole("button", { name: "数据源与人员映射" }).click();
  const code = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await page.getByLabel("数据源编码").fill(code);
  await page.getByLabel("显示名称").fill(code);
  await page.getByLabel("公司全称").fill("测试公司");
  await page.getByRole("button", { name: "创建数据源", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已创建");
  return code;
}
async function upload(page: Page, kind: string, name: string, body: string) {
  await page.getByRole("button", { name: "文件导入与历史" }).click();
  await page.getByLabel("文件类型", { exact: true }).selectOption(kind);
  await page.getByLabel("选择文件").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(body, "utf-8") });
  await page.getByRole("button", { name: "上传并预检", exact: true }).click();
  await expect(page.getByRole("region", { name: "预检结果" })).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText("预检完成");
  await page.getByLabel("已核对本次预检提示与金额").check();
  await page.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("导入完成");
}

test("M1 admin upload, duplicate, raw trace and owner reconciliation", async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await login(page, "admin");
  const code = await createSource(page);
  await upload(page, "customer", "customers.csv", "客户编号,客户名称\n001,演示客户\n");
  await upload(page, "product", "products.csv", "商品编号,商品名称\nP001,演示商品\n");
  const data = "单据编号,单据日期,客户编码,销售金额,商品编码,数量,金额,最后修改时间\nE2E001,2026-08-01,001,0.30,P001,1,0.10,2026-08-01 10:00:00\n,,,,P001,1,0.20,\n,,,,合计:,,0.30,\n";
  await upload(page, "sales", "sales.csv", data);
  await upload(page, "sales", "sales.csv", data);
  await expect(page.getByRole("region", { name: "预检结果" })).toContainText("未变化 1");
  await page.getByRole("button", { name: "查看原始行追溯" }).click();
  await expect(page.getByText("CSV / 1", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "owner");
  await page.getByLabel("数据源", { exact: true }).selectOption({ label: code });
  await expect(page.getByRole("cell", { name: "0.30", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看订单", exact: true }).click();
  await page.getByRole("button", { name: "E2E001", exact: true }).click();
  await expect(page.getByRole("heading", { name: "E2E001 · 演示客户" })).toBeVisible();
  await page.screenshot({ path: `../../.tools/m1-sales-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "关闭订单窗口" }).click();
  await page.getByRole("button", { name: "文件导入与历史" }).click();
  await expect(page.getByRole("button", { name: "上传并预检", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("M1 finance files, period confirmation and owner view", async ({ page }) => {
  test.setTimeout(90000);
  await login(page, "admin");
  const code = await createSource(page);
  for (const kind of ["profit", "balance_sheet"]) {
    await page.getByRole("button", { name: "文件导入与历史" }).click();
    await page.getByLabel("文件类型", { exact: true }).selectOption(kind);
    await page.getByLabel("选择文件").setInputFiles(`${process.env.E2E_FINANCE_FIXTURES}/${kind}.xlsx`);
    await page.getByRole("button", { name: "上传并预检", exact: true }).click();
    await expect(page.getByRole("status").first()).toContainText("预检完成");
    await page.getByLabel("已核对本次预检提示与金额").check();
    await page.getByRole("button", { name: "确认导入", exact: true }).click();
    await expect(page.getByRole("status").first()).toContainText("导入完成");
  }
  await page.getByRole("button", { name: "财务期间确认", exact: true }).click();
  await page.getByRole("button", { name: "确认财务期间", exact: true }).click();
  await expect(page.getByRole("button", { name: "解除期间确认" })).toBeVisible();
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "owner");
  await page.getByLabel("数据源", { exact: true }).selectOption({ label: code });
  await expect(page.getByRole("heading", { name: "2026-08 · 期间已确认" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "营业收入", exact: true })).toBeVisible();
  await page.screenshot({ path: `../../.tools/m1-finance-${test.info().project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("M1 invalid columns show readable precheck errors", async ({ page }) => {
  await login(page, "admin");
  await createSource(page);
  await page.getByRole("button", { name: "文件导入与历史" }).click();
  await page.getByLabel("文件类型", { exact: true }).selectOption("customer");
  await page.getByLabel("选择文件").setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from("foo,bar\n1,2\n") });
  await page.getByRole("button", { name: "上传并预检", exact: true }).click();
  await expect(page.getByRole("region", { name: "预检结果" })).toContainText("缺少关键列");
  await expect(page.getByRole("button", { name: "确认导入", exact: true })).toHaveCount(0);
});

test("M1 long monthly table opens visible orders, pagination and detail", async ({ page }) => {
  await page.route("**/api/data/sources", route => route.fulfill({ json: [{ id: "source-ui", source_name: "窗口测试", staff: {} }] }));
  await page.route("**/api/data/finance/periods?*", route => route.fulfill({ json: [] }));
  await page.route("**/api/data/finance/monthly?*", route => route.fulfill({ json: { rows: [] } }));
  await page.route("**/api/data/sales/monthly?*", route => route.fulfill({ json: { rows: Array.from({ length: 9 }, (_, i) => ({ month: `2026-0${i+1}`, orders: 30, amount: "3.00", through: `2026-0${i+1}-01` })) } }));
  await page.route("**/api/data/sales/orders?*", route => {
    const query = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: Number(query.get("offset")) ? [] : Array.from({ length: 30 }, (_, i) => ({ id: `order-${i}`, order_no: `TEST-${i}`, date: `${query.get("month")}-01`, amount: "0.10", version: 1 })) });
  });
  await page.route("**/api/data/sales/orders/order-*", route => route.fulfill({ json: { order_no: "TEST-0", customer: "测试客户", lines: [{ line_no: 1, quantity: "1", amount: "0.10" }] } }));
  await login(page, "owner");
  const trigger = page.getByRole("button", { name: "查看订单", exact: true }).first();
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "2026-01 订单", exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("heading", { name: "2026-01 订单", exact: true })).toBeInViewport();
  await modal.getByRole("button", { name: "TEST-0", exact: true }).click();
  await expect(page.getByRole("heading", { name: "TEST-0 · 测试客户" })).toBeInViewport();
  await page.getByRole("button", { name: "返回订单列表" }).click();
  await modal.getByRole("button", { name: "后 30 单" }).click();
  await expect(modal.getByText("本页暂无订单。", { exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "前 30 单" }).click();
  await expect(modal.getByRole("button", { name: "TEST-0", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "查看订单", exact: true }).nth(1).click();
  await expect(page.getByRole("dialog", { name: "2026-02 订单", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2026-02-01", exact: true }).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `../../.tools/m1-orders-dialog-${test.info().project.name}.png` });
  await page.getByRole("button", { name: "关闭订单窗口" }).click();
});

test("M1 order window exposes loading, failure and retry", async ({ page }) => {
  await page.route("**/api/data/sources", route => route.fulfill({ json: [{ id: "source-ui", source_name: "错误测试", staff: {} }] }));
  await page.route("**/api/data/finance/periods?*", route => route.fulfill({ json: [] }));
  await page.route("**/api/data/finance/monthly?*", route => route.fulfill({ json: { rows: [] } }));
  await page.route("**/api/data/sales/monthly?*", route => route.fulfill({ json: { rows: [{ month: "2026-08", orders: 1, amount: "0.10", through: "2026-08-01" }] } }));
  let fail = true;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/data/sales/orders?*", async route => {
    if (fail) { await pending; await route.fulfill({ status: 503, json: { error: { message: "测试服务暂不可用" } } }); }
    else await route.fulfill({ json: [] });
  });
  await login(page, "owner");
  await page.getByRole("button", { name: "查看订单", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("status")).toHaveText("正在加载订单列表…");
  release();
  await expect(modal.getByRole("alert")).toHaveText("测试服务暂不可用");
  fail = false;
  await modal.getByRole("button", { name: "重新加载" }).click();
  await expect(modal.getByText("本页暂无订单。", { exact: true })).toBeVisible();
  await modal.getByRole("button", { name: "关闭订单窗口" }).click();
  await expect(modal).toHaveCount(0);
});

test("M1 owner previews pending financial files without confirming or filling blanks", async ({ page }) => {
  test.setTimeout(90000);
  await login(page, "admin");
  const code = await createSource(page);
  for (const [kind, filename] of [["profit", "profit_blank.xlsx"], ["balance_sheet", "balance_sheet.xlsx"]]) {
    await page.getByRole("button", { name: "文件导入与历史" }).click();
    await page.getByLabel("文件类型", { exact: true }).selectOption(kind);
    await page.getByLabel("选择文件").setInputFiles(`${process.env.E2E_FINANCE_FIXTURES}/${filename}`);
    await page.getByRole("button", { name: "上传并预检", exact: true }).click();
    await expect(page.getByRole("status").first()).toContainText("预检完成");
    await page.getByRole("button", { name: "查看财务预览", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("待确认，尚未导入");
    await page.getByRole("button", { name: "关闭财务预览" }).click();
  }
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "owner");
  await page.getByLabel("数据源", { exact: true }).selectOption({ label: code });
  await page.getByRole("button", { name: "预览 profit_blank.xlsx", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "财务报表预览" });
  await expect(modal.getByRole("heading", { name: "财务报表预览" })).toBeInViewport();
  await expect(modal.getByRole("columnheader", { name: "本月金额（元）", exact: true })).toBeVisible();
  await expect(modal.getByRole("cell", { name: "未填报（空白）", exact: true })).toHaveCount(1);
  await expect(modal).toContainText("空白核对策略尚未确认");
  await expect(modal.getByRole("button", { name: "确认导入", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `../../.tools/m1-finance-preview-${test.info().project.name}.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "预览 balance_sheet.xlsx", exact: true }).click();
  await expect(modal.getByRole("columnheader", { name: "年初余额（元）", exact: true })).toBeVisible();
  await expect(modal).toContainText("年初不是上月");
  await page.getByRole("button", { name: "关闭财务预览" }).click();
  const source = await page.getByLabel("数据源", { exact: true }).inputValue();
  const result = await page.request.get(`/api/data/finance/monthly?source_id=${source}`);
  expect((await result.json()).rows).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
