import { test, expect } from "@playwright/test";

const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("DEMO_PASSWORD is required; seed isolated demo accounts first");

// 侧边栏导航是链接而非按钮；销售工作台的退出入口折叠在账户菜单 details 中。
async function openSignOut(page: import("@playwright/test").Page, role: string) {
  if (role === "sales") await page.locator("details.sales-account summary").click();
  await expect(page.getByRole("button", { name: "退出登录", exact: true })).toBeVisible();
}

for (const role of ["owner", "manager", "sales", "finance", "admin"]) {
  test(`${role}: login, account, refresh and logout`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/");
    await page.getByLabel("账号", { exact: true }).fill(`demo_${role}`);
    await page.getByLabel("密码", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await openSignOut(page, role);
    await page.reload();
    await openSignOut(page, role);
    if (role === "sales") {
      // 销售工作台没有“我的账号/系统状态”页面，账户信息就在侧边栏菜单里。
      await expect(page.getByRole("link", { name: "我的账号", exact: true })).toHaveCount(0);
      await expect(page.getByText("Asia/Shanghai", { exact: true })).toHaveCount(0);
    } else {
      await page.getByRole("link", { name: "我的账号", exact: true }).click();
      await expect(page.getByRole("heading", { name: "我的账号", exact: true })).toBeVisible();
      await expect(page.getByText("Asia/Shanghai", { exact: true })).toBeVisible();
      if (role === "owner" || role === "admin") {
        await page.getByRole("link", { name: "系统状态", exact: true }).click();
        await expect(page.getByRole("heading", { name: "系统接口正常" })).toBeVisible();
      } else {
        await expect(page.getByRole("link", { name: "系统状态", exact: true })).toHaveCount(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
    }
    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("invalid and disabled credentials are rejected", async ({ page }) => {
  await page.goto("/");
  for (const [username, value] of [["demo_sales", "Wrong-password!"], ["demo_disabled", password!]]) {
    await page.getByLabel("账号", { exact: true }).fill(username);
    await page.getByLabel("密码", { exact: true }).fill(value);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "用户名或密码错误" })).toBeVisible();
  }
});
