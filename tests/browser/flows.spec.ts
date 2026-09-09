import { test, expect, type Page } from "@playwright/test";
test("landing, responsive layout, registration, social, parties and both sports", async ({
  browser,
}) => {
  const one = await browser.newContext(),
    two = await browser.newContext();
  const a = await one.newPage(),
    b = await two.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  b.on("pageerror", (e) => errors.push(e.message));
  await a.goto("/");
  await expect(
    a.getByRole("heading", { name: "Good games. Great company." }),
  ).toBeVisible();
  await expect(a.locator("canvas")).toHaveCount(3);
  await a.screenshot({
    path: "test-results/clubhouse-desktop.png",
    fullPage: true,
  });
  await a.setViewportSize({ width: 390, height: 844 });
  expect(
    await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await a.screenshot({
    path: "test-results/clubhouse-mobile.png",
    fullPage: true,
  });
  await a.setViewportSize({ width: 1440, height: 1000 });
  const name = `alpha${Date.now().toString().slice(-7)}`,
    name2 = `bravo${Date.now().toString().slice(-7)}`;
  async function register(page: Page, username: string) {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .first()
      .click();
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page
      .getByLabel("Password", { exact: true })
      .fill("correct horse staple");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create account" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Save your recovery code." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "I’ve saved it" }).click();
    await expect(page.locator(".connection-banner")).toHaveCount(0);
    return (await page.request.get("/api/session")).json();
  }
  const ua = await register(a, name),
    ub = await register(b, name2);
  await a.getByRole('navigation').getByRole("button", { name: "Friends", exact: true }).click();
  await a.getByRole("button", { name: "Add friend", exact: true }).click();
  await a.getByLabel("Full username and tag").fill(ub.profile.handle);
  await a.getByRole("button", { name: "Send friend request" }).click();
  await b.getByRole('navigation').getByRole("button", { name: "Friends", exact: true }).click();
  await b.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(a.locator(".friend-row")).toHaveCount(1);
  await a.getByRole("button", { name: "Message", exact: true }).click();
  await a
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("You on? Meet me at the court.");
  await a.getByRole("button", { name: "Send", exact: true }).click();
  await expect(a.locator(".message").last()).toContainText("You on?");
  await b.locator(".rail").getByTitle("Messages").click();
  await b.locator(".conversation").first().click();
  await expect(b.locator(".message").last()).toContainText(
    "Meet me at the court.",
  );
  await a.getByRole("button", { name: "New group" }).click();
  await a.getByLabel("Group name").fill("After school crew");
  await a.getByRole("dialog").getByRole("checkbox").check();
  await a.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(a.locator(".conversation-header")).toContainText(
    "After school crew",
  );
  await a.locator(".rail").getByTitle("Your party").click();
  await a.getByRole("button", { name: "Create party", exact: true }).click();
  await a
    .getByRole("button", { name: ub.profile.handle, exact: false })
    .click();
  await b.locator(".rail").getByTitle("Your party").click();
  await b.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(a.locator(".count")).toContainText("2/8");
  await a.getByRole("button", { name: "Pick a game" }).click();
  await a.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(
    a.getByRole("heading", { name: "Rooftop hoops", exact: true }),
  ).toBeVisible();
  const code = (
    await a.locator(".play-heading .button").first().innerText()
  ).trim();
  await b.getByRole("button", { name: "Play", exact: true }).click();
  await b
    .getByRole("button", { name: "Join with a code", exact: true })
    .click();
  await b.getByLabel("Room code", { exact: true }).fill(code);
  await b
    .getByRole("dialog")
    .getByRole("button", { name: "Join room" })
    .click();
  await a.getByRole("button", { name: "Ready up" }).click();
  await b.getByRole("button", { name: "Ready up" }).click();
  await a.getByRole("button", { name: "Start match" }).click();
  await expect(a.locator(".countdown")).toBeVisible();
  await expect(a.locator(".countdown")).toHaveCount(0);
  await expect(a.locator(".scoreboard")).toContainText("SHOT CLOCK");
  await a.locator(".arena canvas").click({ position: { x: 200, y: 200 } });
  await a.keyboard.down("KeyW");
  await a.waitForTimeout(500);
  await a.keyboard.up("KeyW");
  await a.keyboard.down("Space");
  await a.waitForTimeout(650);
  await a.keyboard.up("Space");
  await a.screenshot({
    path: "test-results/basketball-match.png",
    fullPage: true,
  });
  await b.reload();
  await expect(
    b.getByRole("heading", { name: 'Rooftop hoops', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const s = (await b.request.get("/api/session")).status();
      return s;
    })
    .toBe(200);
  await a.getByRole("button", { name: "Enable voice chat" }).click();
  await expect(a.getByRole("alert")).toContainText("Voice is unavailable");
  await a.getByRole("button", { name: "Dismiss error" }).click();
  await a.getByRole("button", { name: "Leave court", exact: true }).click();
  await a.getByRole("button", { name: /Pocket pitch/ }).click();
  await a.getByRole("button", { name: "Create room", exact: true }).click();
  const soccerCode = (
    await a.locator(".play-heading .button").first().innerText()
  ).trim();
  await b.getByRole('navigation').getByRole('button',{name:'Play',exact:true}).click();
  await b
    .getByRole("button", { name: "Join with a code", exact: true })
    .click();
  await b.getByLabel("Room code", { exact: true }).fill(soccerCode);
  await b
    .getByRole("dialog")
    .getByRole("button", { name: "Join room" })
    .click();
  await a.getByRole("button", { name: "Ready up" }).click();
  await b.getByRole("button", { name: "Ready up" }).click();
  await a.getByRole("button", { name: "Start match" }).click();
  await expect(a.locator(".countdown")).toHaveCount(0);
  await expect(
    a.getByRole("heading", { name: "Pocket pitch", exact: true }),
  ).toBeVisible();
  await a.screenshot({ path: "test-results/soccer-match.png", fullPage: true });
  expect(errors).toEqual([]);
  expect(ua.profile.handle).toMatch(/#\d{4}$/);
  await one.close();
  await two.close();
});
