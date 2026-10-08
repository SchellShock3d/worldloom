import { expect, test, type Page } from "@playwright/test";

/**
 * The critical path from the brief, through the real UI:
 * account → world → campaign → entities → @mention link → search → session
 * notes → process session → approve proposals → advance world → approve →
 * clock and timeline reflect the approved changes.
 */
test.describe.configure({ mode: "serial" });

const email = `dm-${Date.now()}@example.com`;
const password = "dragons-are-real";
let worldUrl = "";
let campaignUrl = "";

async function expectNoErrorPage(page: Page) {
  await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
  await expect(page.getByText("This page could not be found")).toHaveCount(0);
  // Worldloom's own not-found and error pages.
  await expect(page.getByRole("heading", { name: /^(Nothing here|This thread leads nowhere|Something snapped)$/ })).toHaveCount(0);
}

test("sign up, create a world and its first campaign", async ({ page }) => {
  await page.goto("/signup");
  await page.locator("#name").fill("Test DM");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /create account|sign up/i }).click();
  await page.waitForURL(/\/onboarding/);

  await page.locator("#ob-name").fill("Vellmoor");
  await page.locator("#ob-tone").fill("Salt, smugglers and drowned gods");
  await page.getByRole("button", { name: "Create world" }).click();
  await page.getByRole("button", { name: /Start blank/ }).click();
  await page.waitForURL(/\/campaigns\/new/);

  await page.locator("#c-name").fill("The Salt Road");
  await page.locator("#c-party").fill("The Tidewardens");
  await page.getByRole("button", { name: "Create campaign" }).click();
  await page.waitForURL(/\/w\/[0-9a-f-]{36}\/campaigns\/[0-9a-f-]{36}$/);
  campaignUrl = new URL(page.url()).pathname;
  worldUrl = campaignUrl.split("/campaigns/")[0]!;
  await expect(page.getByRole("heading", { name: "The Salt Road" })).toBeVisible();
  await expectNoErrorPage(page);
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  });

  test("create a place and an NPC, link them with an @mention, and find them", async ({ page }) => {
    await page.goto(`${worldUrl}/new?type=settlement`);
    await page.getByLabel("Name").first().fill("Saltmarsh");
    await page.locator("#ef-summary").fill("A fishing town built on stilts above the tidal flats.");
    await page.getByRole("main").getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(/\/e\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Saltmarsh" })).toBeVisible();

    await page.goto(`${worldUrl}/new?type=npc`);
    await page.getByLabel("Name").first().fill("Captain Isolde");
    await page.locator("#ef-summary").fill("A smuggler captain who owes the harbourmaster a favour.");
    await page.getByLabel("Article").fill("Isolde sails out of @Saltmarsh every spring tide.");
    await page.getByRole("main").getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(/\/e\/[0-9a-f-]{36}$/);
    // The plain @Name was resolved into a real link.
    const link = page.getByRole("link", { name: "Saltmarsh" }).first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(/\/e\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Saltmarsh" })).toBeVisible();
    // Backlink on the place page.
    await expect(page.getByText("Mentioned in")).toBeVisible();
    await expect(page.getByRole("link", { name: /Captain Isolde/ }).first()).toBeVisible();

    // Command palette search (Ctrl+K), tolerant of typos.
    await page.keyboard.press("Control+k");
    await page.keyboard.type("Isolda");
    await expect(page.getByRole("option", { name: /Captain Isolde/ }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Captain Isolde" })).toBeVisible();
  });

  test("run a session, end it, and approve what the AI proposes from the notes", async ({ page }) => {
    await page.goto(`${campaignUrl}/run`);
    await page.getByRole("button", { name: /Start session/ }).click();
    const log = page.getByLabel("Quick log");
    await expect(log).toBeVisible();
    await log.fill("The party met Captain Isolde in Saltmarsh; she agreed to smuggle them past the blockade.");
    await log.press("Enter");
    await log.fill("Isolde promised to wait at the north pier for three days.");
    await log.press("Enter");
    await expect(page.getByText("north pier").first()).toBeVisible();

    await page.getByRole("button", { name: "End session" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "End session" }).click();
    await page.waitForURL(/\/proposals\/[0-9a-f-]{36}/);
    await expect(page.getByText("Nothing here is canon until you approve it.")).toBeVisible();
    await page.getByRole("button", { name: "Approve selected" }).click();
    await expect(page.getByText("All proposals in this batch have been reviewed.")).toBeVisible();
    await expectNoErrorPage(page);
  });

  test("advance the world a week, approve, and see the clock and timeline move", async ({ page }) => {
    await page.goto(campaignUrl);
    const clock = page.locator("header").getByRole("button", { name: /\d+ \w+, \d+/ }).first();
    const before = (await clock.textContent()) ?? "";
    await page.getByRole("button", { name: "Advance time" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "1 week" }).click();
    await dialog.getByRole("button", { name: "Propose developments" }).click();
    await page.waitForURL(/\/proposals\/[0-9a-f-]{36}/);
    // Proposed, not applied: the clock hasn't moved yet.
    await expect(clock).toHaveText(before);
    await page.getByRole("button", { name: "Approve selected" }).click();
    await expect(page.getByText("All proposals in this batch have been reviewed.")).toBeVisible();
    await page.reload();
    await expect(page.locator("header").getByRole("button", { name: /\d+ \w+, \d+/ }).first()).not.toHaveText(before);

    await page.goto(`${worldUrl}/timeline`);
    await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
    await expect(page.locator("main ol li").first()).toBeVisible();

    await page.goto(`${worldUrl}/settings?tab=history`);
    await expect(page.getByText(/AI proposal, approved by Test DM/).first()).toBeVisible();
  });

  test("every main screen renders", async ({ page }) => {
    const paths = [
      "",
      "/wiki",
      "/characters",
      "/locations",
      "/culture",
      "/rumours",
      "/campaigns",
      "/maps",
      "/timeline",
      "/calendar",
      "/graph",
      "/threads",
      "/news",
      "/proposals",
      "/continuity",
      "/encounters",
      "/generators",
      "/music",
      "/ai",
      "/settings",
      "/settings?tab=calendar",
    ];
    for (const p of paths) {
      const res = await page.goto(`${worldUrl}${p}`);
      expect(res?.status(), p).toBe(200);
      await expectNoErrorPage(page);
    }
    for (const p of ["", "/sessions", "/party", "/quests", "/mysteries", "/consequences", "/travel", "/notes", "/prepare"]) {
      const res = await page.goto(`${campaignUrl}${p}`);
      expect(res?.status(), p).toBe(200);
      await expectNoErrorPage(page);
    }
  });
});
