import { expect, test } from "@playwright/test";

test("annotator workspace and admin stats", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  // 用 API 创建一个全新的空任务，保证拖拽测试不依赖 seed 的片段状态。
  const adminLogin = await request.post("/api/auth/login", {
    data: { email: "admin.alpha@example.com", password: "Admin123!" },
  });
  expect(adminLogin.ok()).toBeTruthy();
  const videosResponse = await request.get("/api/admin/videos");
  expect(videosResponse.ok()).toBeTruthy();
  const videos = (await videosResponse.json()) as { id: string }[];
  expect(videos.length).toBeGreaterThan(0);
  const title = `E2E 标注任务 ${Date.now()}`;
  const createTask = await request.post("/api/admin/tasks", {
    data: { video_id: videos[0].id, title },
  });
  expect(createTask.ok()).toBeTruthy();

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await page.getByLabel("邮箱").fill("ann.alpha1@example.com");
  await page.getByLabel("密码").fill("Annotator123!");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole("heading", { name: "我的任务" })).toBeVisible();

  const card = page.locator("article").filter({ hasText: title });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "领取任务" }).click();

  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]+$/);
  await expect(page.getByTestId("video-player")).toBeVisible();
  await expect(page.getByText("时间轴", { exact: true })).toBeVisible();
  await expect(page.getByText("片段列表", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "提交任务" }),
  ).toBeVisible();

  const track = page.getByTestId("timeline-track");
  await expect(track).toBeVisible();
  const box = await track.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.4, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1800);
  }
  await expect(page.getByTestId("timeline-segment")).toHaveCount(1);
  await page.screenshot({
    path: "e2e-artifacts/workspace.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "提交任务" }).click();
  await expect(page.getByRole("dialog", { name: "提交任务" })).toBeVisible();
  await page.getByRole("button", { name: "确认提交" }).click();
  await expect(page.getByRole("button", { name: "提交任务" })).toHaveCount(0);
  await expect(page.getByText(/已提交 ·/)).toBeVisible();

  await page.getByRole("button", { name: /退出/ }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("邮箱").fill("admin.alpha@example.com");
  await page.getByLabel("密码").fill("Admin123!");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin\/tasks$/);
  await expect(page.getByRole("heading", { name: "任务管理" })).toBeVisible();

  await page.getByRole("link", { name: "工作量统计" }).click();
  await expect(page.getByRole("heading", { name: "工作量统计" })).toBeVisible();
  await expect(page.getByText("区间有效时长")).toBeVisible();
  await expect(page.getByText("每日有效时长")).toBeVisible();
  await page.screenshot({
    path: "e2e-artifacts/stats.png",
    fullPage: true,
  });

  // 未登录时探测 /auth/me 会返回 401，浏览器会把它记为资源加载错误，这是预期行为。
  const unexpectedErrors = consoleErrors.filter(
    (message) => !message.includes("401 (Unauthorized)"),
  );
  expect(unexpectedErrors).toEqual([]);
});
