import { expect, test } from "@playwright/test";

const TEST_PREFIX = process.env.ATS_TEST_PREFIX || "TEST_";
const TEST_EMAIL = process.env.ATS_TEST_EMAIL;
const TEST_PASSWORD = process.env.ATS_TEST_PASSWORD;

function requireSecret(name, value) {
  if (!value) {
    throw new Error(`Missing required secret/env var: ${name}`);
  }
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

async function completeMicrosoftLogin(page) {
  requireSecret("ATS_TEST_EMAIL", TEST_EMAIL);
  requireSecret("ATS_TEST_PASSWORD", TEST_PASSWORD);

  const loginButton = page.getByRole("button", { name: /sign in with microsoft 365/i });
  if (await loginButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
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

  await expect(page.getByText(/Karm\. ATS/i).first()).toBeVisible({ timeout: 45_000 });
}

async function openAts(page) {
  await page.goto("/");
  await completeMicrosoftLogin(page);
}

test.describe("Karm ATS live QA smoke", () => {
  test("logs in and opens the live ATS dashboard", async ({ page }) => {
    await openAts(page);

    await expect(page.getByText(/Dashboard|Karm\. ATS Dashboard/i).first()).toBeVisible();
    await expect(page.getByRole("navigation").or(page.locator(".sidebar-nav"))).toBeVisible();
    await expect(page.getByText(/Job Requisitions/i).first()).toBeVisible();
    await expect(page.getByText(/Candidates/i).first()).toBeVisible();
    await expect(page.getByText(/Pipeline/i).first()).toBeVisible();
  });

  test("creates only a TEST_ candidate through the normal UI", async ({ page }) => {
    await openAts(page);

    const unique = `${TEST_PREFIX}QA Candidate ${Date.now()}`;
    const email = `${unique.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@unknown.local`;

    expect(unique.startsWith(TEST_PREFIX)).toBeTruthy();

    await page.getByText(/^Candidates$/i).click();
    await expect(page.getByText(/Candidate Database/i)).toBeVisible();
    await page.getByRole("button", { name: /add candidate/i }).click();

    await page.locator('input[placeholder="e.g. Ahmed Kamel"]').fill(unique);
    await page.locator('input[placeholder="candidate@email.com"]').fill(email);

    const sourceSelect = page.locator("select.form-select").filter({ hasText: /LinkedIn|Referral|Direct Application/i }).first();
    if (await sourceSelect.isVisible().catch(() => false)) {
      await sourceSelect.selectOption({ label: "Direct Application" }).catch(async () => {
        await sourceSelect.selectOption("Direct Application");
      });
    }

    await page.getByRole("button", { name: /^add candidate$/i }).click();
    await expect(page.getByText(unique)).toBeVisible({ timeout: 30_000 });
  });

  test("opens key operational pages without touching non-TEST records", async ({ page }) => {
    await openAts(page);

    for (const item of ["Job Requisitions", "Candidates", "Pipeline", "Interviews", "Offers"]) {
      await page.getByText(new RegExp(`^${item}$`, "i")).click();
      await expect(page.getByText(new RegExp(item.replace("Candidates", "Candidate Database"), "i")).first()).toBeVisible({ timeout: 20_000 });
    }
  });
});
