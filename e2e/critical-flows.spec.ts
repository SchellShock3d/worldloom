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

  // The quick path lives in the fill-it-in-yourself creator.
  await page.getByRole("link", { name: /fill it in myself/ }).click();
  await page.waitForURL(/\/onboarding\/custom/);
  await page.locator("#ob-name").fill("Vellmoor");
  await page.locator("#ob-tone").fill("Salt, smugglers and drowned gods");
  await page.getByRole("button", { name: "Create it now, fill in later" }).click();
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
      "/peoples",
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

test.describe("world creator", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  });

  test("walk every step, add homebrew, and create a world with its races and classes", async ({ page }) => {
    await page.goto("/onboarding/custom");
    await page.locator("#ob-name").fill("Brassmoor");
    await page.getByRole("group", { name: "Genre" }).getByRole("button", { name: "Steampunk" }).click();
    await page.getByRole("button", { name: "Suggest the pitch" }).click();
    await expect(page.getByLabel("Suggestions").getByRole("button").first()).toBeVisible();
    await page.getByLabel("Suggestions").getByRole("button").first().click();
    await expect(page.locator("#ob-desc")).not.toHaveValue("");

    await page.getByRole("button", { name: /Magic & technology/ }).last().click();
    await page.getByRole("group", { name: "Magic level" }).getByRole("button", { name: "High" }).click();
    await page.getByRole("group", { name: "Technology level" }).getByRole("button", { name: "Industrial", exact: true }).click();
    await expect(page.getByText("In a world like this")).toBeVisible();
    await expect(page.getByText(/Artificer/).first()).toBeVisible();

    await page.getByRole("button", { name: /The land/ }).last().click();
    await page.getByRole("group", { name: "World shape" }).getByRole("button", { name: "An archipelago" }).click();
    await page.getByRole("button", { name: /Peoples/ }).last().click();
    await expect(page.getByRole("heading", { name: /Races/ }).first()).toBeVisible();
    await page.locator("#prev-Elf").selectOption("Absent");
    await page.getByRole("button", { name: "Suggest homebrew" }).click();
    const artificer = page.getByRole("listitem").filter({ hasText: "Artificer" }).first();
    await artificer.getByRole("button", { name: /Add/ }).click();
    await expect(page.getByText("Added to your world")).toBeVisible();

    await page.getByRole("button", { name: /Powers & history/ }).last().click();
    await page.getByRole("group", { name: "Religion style" }).getByRole("button", { name: "One god" }).click();
    await page.getByRole("button", { name: /Where play begins/ }).last().click();
    await page.locator("#ob-avoid").fill("Spiders");
    await page.getByRole("button", { name: /Review/ }).last().click();
    await expect(page.getByText("Artificer").first()).toBeVisible();
    await page.getByRole("button", { name: "Create the world only" }).click();
    await page.waitForURL(/\/campaigns\/new/);

    const world = new URL(page.url()).pathname.split("/campaigns/")[0]!;
    await page.goto(`${world}/peoples`);
    await expect(page.getByRole("link", { name: /Artificer/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Gnome/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Elf/ })).toHaveCount(0);
    await expectNoErrorPage(page);
  });

  test("let Claude write it: pitch, blend, build, steer and create", async ({ page }) => {
    await page.goto("/onboarding");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator("#spark-seed").fill("Clockwork cities and dying gods");
    await page.getByRole("radiogroup", { name: "Hopeful to Grim" }).getByRole("radio", { name: "Grim", exact: true }).click();
    await page.getByRole("button", { name: "Pitch me three worlds" }).click();
    await expect(page.getByRole("heading", { name: "Pick a world" })).toBeVisible();
    const cards = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Build this world" }) });
    await expect(cards).toHaveCount(3);

    // Blend two, then build the blend.
    await cards.nth(0).getByLabel("Blend").check();
    await cards.nth(1).getByLabel("Blend").check();
    await page.getByRole("button", { name: "Blend them" }).click();
    await expect(cards).toHaveCount(2);
    await cards.nth(0).getByRole("button", { name: "Build this world" }).click();

    // Every section gets written, in order.
    await expect(page.getByText("6 of 6 written")).toBeVisible({ timeout: 60_000 });
    const land = page.getByRole("region", { name: "The land" });
    await land.getByRole("button", { name: "More islands and sea" }).click();
    await expect(page.getByText(/written before your latest change/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /up to date/ }).click();
    await expect(page.getByText(/written before your latest change/)).toHaveCount(0, { timeout: 60_000 });
    await page.getByRole("region", { name: "The world" }).getByRole("button", { name: "Keep" }).click();
    await expect(page.getByText("Kept")).toBeVisible();

    await page.getByRole("button", { name: "Create this world" }).first().click();
    await page.waitForURL(/\/campaigns\/new/, { timeout: 60_000 });
    const world = new URL(page.url()).pathname.split("/campaigns/")[0]!;
    await page.goto(`${world}/locations`);
    await expectNoErrorPage(page);
    await page.goto(`${world}/peoples`);
    await expect(page.getByRole("link", { name: /^Human/ })).toBeVisible();
    await page.goto(`${world}/threads`);
    await expectNoErrorPage(page);
  });
});
