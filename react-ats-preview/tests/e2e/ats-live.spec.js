import { expect, test } from "@playwright/test";

const TEST_PREFIX = process.env.ATS_TEST_PREFIX || "TEST_";
const TEST_EMAIL = process.env.ATS_TEST_EMAIL;
const TEST_PASSWORD = process.env.ATS_TEST_PASSWORD;
const browserEventsByTest = new WeakMap();

function requireSecret(name, value) {
  if (!value) {
    throw new Error(`Missing required secret/env var: ${name}`);
  }
}

async function captureVisibleText(page) {
  return page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
}

async function clickIfVisible(page, locator, timeout = 5_000) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    await locator.click();
    return true;
  } catch {
    return false;
  }
}

async function failOnLoginOrBackendError(page, context = "ATS screen") {
  const bodyText = await captureVisibleText(page);
  const blockingError =
    bodyText.match(/Backend API is not reachable[^\n]*/i)?.[0] ||
    bodyText.match(/Microsoft login is not configured[^\n]*/i)?.[0] ||
    bodyText.match(/Load failed[^\n]*/i)?.[0] ||
    bodyText.match(/AADSTS\d+:[^\n]*/i)?.[0] ||
    bodyText.match(/Sorry, but we're having trouble signing you in[^\n]*/i)?.[0] ||
    bodyText.match(/Request sent[^\n]*/i)?.[0];

  if (blockingError) {
    throw new Error(`${context} is blocked by a login/backend error: ${blockingError}`);
  }
}

async function waitForAtsShell(page, context = "after login") {
  await failOnLoginOrBackendError(page, context);
  await expect(page.getByTestId("ats-shell"), `${context}: ATS app shell should be mounted`).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".sidebar-nav"), `${context}: sidebar navigation should be visible`).toBeVisible();
  await expect(page.getByRole("button", { name: /logout/i }), `${context}: user should be authenticated`).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in with microsoft 365/i }), `${context}: login button should be gone`).toHaveCount(0);
}

async function completeMicrosoftLogin(page) {
  requireSecret("ATS_TEST_EMAIL", TEST_EMAIL);
  requireSecret("ATS_TEST_PASSWORD", TEST_PASSWORD);

  if (await page.getByTestId("ats-shell").isVisible({ timeout: 5_000 }).catch(() => false)) {
    return;
  }

  const loginButton = page.getByRole("button", { name: /sign in with microsoft 365/i });
  if (await loginButton.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await failOnLoginOrBackendError(page, "login screen");
    await loginButton.click();
  }

  await page.waitForLoadState("domcontentloaded");

  const emailInput = page.locator('input[type="email"], input[name="loginfmt"]').first();
  if (await emailInput.isVisible({ timeout: 30_000 }).catch(() => false)) {
    await emailInput.fill(TEST_EMAIL);
    await page.getByRole("button", { name: /next/i }).click();
  }

  const passwordInput = page.locator('input[type="password"], input[name="passwd"]').first();
  if (await passwordInput.isVisible({ timeout: 30_000 }).catch(() => false)) {
    await passwordInput.fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
  }

  await clickIfVisible(page, page.getByRole("button", { name: /^no$/i }), 8_000);
  await clickIfVisible(page, page.getByRole("button", { name: /yes/i }), 3_000);

  await waitForAtsShell(page, "after Microsoft login");
}

async function openAts(page) {
  await page.goto("/");
  await completeMicrosoftLogin(page);
}

async function openNav(page, id, expectedTitle) {
  const navItem = page.getByTestId(`nav-${id}`);
  await expect(navItem, `Navigation item "${id}" should be available for the QA user`).toBeVisible({ timeout: 15_000 });
  await navItem.click();
  await failOnLoginOrBackendError(page, `opening ${expectedTitle}`);
  await expect(page.locator(".page-title"), `Page title should confirm "${expectedTitle}" opened`).toContainText(expectedTitle, { timeout: 20_000 });
}

test.describe("Karm ATS live QA smoke", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const browserEvents = [];
    browserEventsByTest.set(testInfo, browserEvents);
    page.on("console", message => {
      browserEvents.push(`[console:${message.type()}] ${message.text()}`);
    });
    page.on("pageerror", error => {
      browserEvents.push(`[pageerror] ${error.message}`);
    });
    page.on("requestfailed", request => {
      browserEvents.push(`[requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`.trim());
    });
  });

  test.afterEach(async ({}, testInfo) => {
    const events = browserEventsByTest.get(testInfo) || [];
    await testInfo.attach("browser-events.txt", {
      body: events.join("\n") || "No browser console/page/request errors captured.",
      contentType: "text/plain",
    });
  });

  test("logs in and opens the live ATS dashboard", async ({ page }) => {
    await openAts(page);

    await expect(page.locator(".page-title"), "Dashboard title should prove the authenticated app loaded").toContainText(/Karm\. ATS Dashboard|Dashboard/i);
    await expect(page.getByTestId("nav-jobs"), "QA user should be able to see job requisitions").toBeVisible();
    await expect(page.getByTestId("nav-candidates"), "QA user should be able to see candidates").toBeVisible();
    await expect(page.getByTestId("nav-pipeline"), "QA user should be able to see the pipeline").toBeVisible();
  });

  test("creates only a TEST_ candidate through the normal UI", async ({ page }) => {
    await openAts(page);

    const unique = `${TEST_PREFIX}QA Candidate ${Date.now()}`;
    const email = `test.qa.${Date.now()}@example.com`;

    expect(unique.startsWith(TEST_PREFIX), "QA-created records must use the configured TEST_ prefix").toBeTruthy();

    await openNav(page, "candidates", "Candidate Database");
    await page.getByRole("button", { name: /add candidate/i }).click();
    await expect(page.locator(".modal-title"), "Add Candidate modal should open").toContainText("Add Candidate");

    await page.getByTestId("candidate-name-input").fill(unique);
    await page.getByTestId("candidate-email-input").fill(email);
    await page.getByTestId("candidate-source-select").selectOption({ label: "Direct Application" });
    await page.getByTestId("candidate-job-select").selectOption("");

    await page.getByRole("button", { name: /^add candidate$/i }).click();

    await expect(page.locator(".modal"), "Candidate modal should close after successful creation").toHaveCount(0, { timeout: 30_000 });
    await page.locator(".search-input").fill(unique);
    const testCandidateRow = page.locator("tbody tr", { hasText: unique });
    await expect(testCandidateRow, "New TEST_ candidate should appear in Candidate Database").toBeVisible({ timeout: 30_000 });
    await expect(testCandidateRow, "New TEST_ candidate email should match submitted email").toContainText(email);
    await expect(testCandidateRow, "Candidate created without assigning to a production job should have zero active apps").toContainText(/\b0\b/);
  });

  test("opens key operational pages without touching non-TEST records", async ({ page }) => {
    await openAts(page);

    const pages = [
      ["jobs", "Job Requisitions"],
      ["candidates", "Candidate Database"],
      ["pipeline", "Candidate Pipeline"],
      ["interviews", "Interviews & Scorecards"],
      ["offers", "Offer Approvals"],
    ];

    for (const [id, title] of pages) {
      await test.step(`open ${title}`, async () => {
        await openNav(page, id, title);
      });
    }
  });
});
