import { expect, test } from "@playwright/test";

test("capture seed screenshots", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill("ann.alpha1@example.com");
  await page.getByLabel("密码").fill("Annotator123!");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "我的任务" })).toBeVisible();

  await page.getByRole("button", { name: /进行中/ }).click();
  await page.getByRole("button", { name: "继续标注" }).first().click();
  await expect(page.getByTestId("video-player")).toBeVisible();
  await expect(page.getByText("片段列表", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "e2e-artifacts/workspace-clean.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: /退出/ }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("邮箱").fill("admin.alpha@example.com");
  await page.getByLabel("密码").fill("Admin123!");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin\/tasks$/);

  await page.getByRole("link", { name: "工作量统计" }).click();
  await expect(page.getByText("每日有效时长")).toBeVisible();
  await page.screenshot({
    path: "e2e-artifacts/stats-clean.png",
    fullPage: true,
  });
});
