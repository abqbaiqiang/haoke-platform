import { test, expect } from "@playwright/test";

const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("DEMO_PASSWORD is required; seed isolated demo accounts first");

for (const role of ["owner", "manager", "sales", "finance", "admin"]) {
  test(`${role}: login, account, refresh and logout`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/");
    await page.getByLabel("账号", { exact: true }).fill(`demo_${role}`);
    await page.getByLabel("密码", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("heading", { name: `欢迎，demo_${role}` })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: `欢迎，demo_${role}` })).toBeVisible();
    await page.getByRole("button", { name: "我的账号", exact: true }).click();
    await expect(page.getByRole("heading", { name: "我的账号", exact: true })).toBeVisible();
    await expect(page.getByText("Asia/Shanghai", { exact: true })).toBeVisible();
    if (role === "owner" || role === "admin") {
      await page.getByRole("button", { name: "系统状态", exact: true }).click();
      await expect(page.getByRole("heading", { name: "系统接口正常" })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: "系统状态", exact: true })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page.getByRole("heading", { name: "登录工作空间" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "登录工作空间" })).toBeVisible();
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
