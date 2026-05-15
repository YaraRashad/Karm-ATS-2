import { expect, test } from "@playwright/test";

const TEST_PREFIX = process.env.ATS_TEST_PREFIX || "TEST_";
const TEST_EMAIL = process.env.ATS_TEST_EMAIL;
const TEST_PASSWORD = process.env.ATS_TEST_PASSWORD;
const API_BASE = (process.env.ATS_API_BASE_URL || "https://karm-ats-api-g4dzhfe3buagc7e2.centralus-01.azurewebsites.net/api/v1").replace(/\/$/, "");
const QA_LOGIN_ENABLED = String(process.env.ATS_QA_LOGIN_ENABLED || "").toLowerCase() === "true";
const QA_LOGIN_SECRET = process.env.ATS_QA_LOGIN_SECRET;
const AUTH_TIMEOUT_MS = Number(process.env.ATS_AUTH_TIMEOUT_MS || 120_000);
const browserEventsByTest = new WeakMap();

async function readApiResponse(response) {
  const text = await response.text().catch(() => "");
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text || null;
  }
  return { status: response.status(), ok: response.ok(), url: response.url(), body, raw: text };
}

async function attachJson(testInfo, name, value) {
  if (!testInfo) return;
  await testInfo.attach(name, {
    body: `${JSON.stringify(value, null, 2)}\n`,
    contentType: "application/json",
  });
}

function sanitizeQaLoginResult(result) {
  const body = typeof result.body === "object" && result.body ? result.body : null;
  const session = body?.data ?? body;

  return {
    apiBase: API_BASE,
    status: result.status,
    ok: result.ok,
    hasAccessToken: !!session?.accessToken,
    hasRefreshToken: !!session?.refreshToken,
    user: session?.user
      ? {
          email: session.user.email,
          role: session.user.role,
          accessScope: session.user.accessScope,
        }
      : null,
    error: body?.error || body?.message || (typeof result.body === "string" ? result.body : null),
  };
}

function requireSecret(name, value) {
  if (!value) {
    throw new Error(`Missing required secret/env var: ${name}`);
  }
}

async function captureVisibleText(page) {
  return page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
}

async function describeCurrentPage(page) {
  const [title, bodyText] = await Promise.all([
    page.title().catch(() => "Unavailable"),
    captureVisibleText(page),
  ]);
  const compactText = bodyText.replace(/\s+/g, " ").trim().slice(0, 2_500);
  return [
    `URL: ${page.url()}`,
    `Title: ${title}`,
    `Visible text: ${compactText || "No visible body text captured."}`,
  ].join("\n");
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

function findBlockingLoginOrBackendError(bodyText) {
  return (
    bodyText.match(/Backend API is not reachable[^\n]*/i)?.[0] ||
    bodyText.match(/Microsoft login is not configured[^\n]*/i)?.[0] ||
    bodyText.match(/Load failed[^\n]*/i)?.[0] ||
    bodyText.match(/AADSTS\d+:[^\n]*/i)?.[0] ||
    bodyText.match(/Sorry, but we're having trouble signing you in[^\n]*/i)?.[0] ||
    bodyText.match(/Request sent[^\n]*/i)?.[0] ||
    null
  );
}

function diagnoseAuthState(bodyText, url) {
  const text = bodyText.replace(/\s+/g, " ").trim();

  if (/enter your email, phone, or skype|email, phone, or skype/i.test(text)) {
    return "Microsoft login did not complete: the browser is still on the email entry screen. The QA test must submit ATS_TEST_EMAIL before waiting for the ATS shell.";
  }
  if (/enter password|password/i.test(text) && /login\.microsoftonline\.com|login\.live\.com/i.test(url)) {
    return "Microsoft login did not complete: the browser is still on the password screen. Check ATS_TEST_PASSWORD and whether the account is allowed to use password login in CI.";
  }
  if (/approve sign in request|authenticator|enter code|verify your identity|multi-factor|two-step verification|keep your account secure|more information required/i.test(text)) {
    return "Microsoft login is blocked by MFA, authenticator setup, or conditional access. Use a dedicated QA account exempted from interactive MFA for GitHub Actions, or use a pre-authenticated storage state.";
  }
  if (/request sent|admin has been notified|needs admin approval/i.test(text)) {
    return "Microsoft login is blocked because the QA user is not assigned to or consented for the Karm. ATS Enterprise Application.";
  }
  if (/stay signed in\?|stay signed in/i.test(text)) {
    return "Microsoft login is waiting on the 'Stay signed in?' prompt. The QA login helper should answer this prompt before waiting for the ATS shell.";
  }
  if (/login\.microsoftonline\.com|login\.live\.com/i.test(url)) {
    return "Microsoft login did not return to the ATS application. The browser is still on a Microsoft authentication URL.";
  }

  return null;
}

async function getBlockingDiagnosis(page) {
  const bodyText = await captureVisibleText(page);
  const blockingError = findBlockingLoginOrBackendError(bodyText);

  if (blockingError) {
    return `Login/backend blocking error: ${blockingError}`;
  }

  return diagnoseAuthState(bodyText, page.url());
}

async function failOnLoginOrBackendError(page, context = "ATS screen") {
  const diagnosis = await getBlockingDiagnosis(page);
  if (diagnosis) {
    throw new Error(`${context} is blocked: ${diagnosis}\n${await describeCurrentPage(page)}`);
  }
}

async function waitForAtsShell(page, context = "after login") {
  await failOnLoginOrBackendError(page, context);
  try {
    await expect(page.getByTestId("ats-shell"), `${context}: ATS app shell should be mounted`).toBeVisible({ timeout: 60_000 });
  } catch (error) {
    const diagnosis = await getBlockingDiagnosis(page);
    const pageState = await describeCurrentPage(page);
    const diagnosisText = diagnosis ? `\nDiagnosis: ${diagnosis}` : "";
    throw new Error(`${context}: ATS shell did not become visible.${diagnosisText}\n${pageState}\nOriginal assertion: ${error.message}`);
  }
  await expect(page.locator(".sidebar-nav"), `${context}: sidebar navigation should be visible`).toBeVisible();
  await expect(page.getByRole("button", { name: /logout/i }), `${context}: user should be authenticated`).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in with microsoft 365/i }), `${context}: login button should be gone`).toHaveCount(0);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function submitMicrosoftStep(page, input, submitLocators) {
  for (const locator of submitLocators) {
    if (await clickIfVisible(page, locator.first(), 1_500)) {
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      return true;
    }
  }

  await input.press("Enter");
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
  return true;
}

async function completeMicrosoftLogin(page) {
  requireSecret("ATS_TEST_EMAIL", TEST_EMAIL);
  requireSecret("ATS_TEST_PASSWORD", TEST_PASSWORD);

  const deadline = Date.now() + AUTH_TIMEOUT_MS;
  const emailPattern = new RegExp(escapeRegExp(TEST_EMAIL), "i");

  while (Date.now() < deadline) {
    if (await page.getByTestId("ats-shell").isVisible().catch(() => false)) {
      await waitForAtsShell(page, "after Microsoft login");
      return;
    }

    const loginButton = page.getByRole("button", { name: /sign in with microsoft 365/i });
    if (await clickIfVisible(page, loginButton, 1_500)) {
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      continue;
    }

    const emailInput = page.locator('input[name="loginfmt"], input[type="email"], input[autocomplete="username"]').first();
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(TEST_EMAIL);
      await submitMicrosoftStep(page, emailInput, [
        page.locator('input[type="submit"][value="Next"]'),
        page.getByRole("button", { name: /^next$/i }),
      ]);
      continue;
    }

    const accountChoice = page.getByText(emailPattern).first();
    if (await clickIfVisible(page, accountChoice, 1_000)) {
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      continue;
    }

    if (await clickIfVisible(page, page.getByText(/use another account/i).first(), 1_000)) {
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      continue;
    }

    const passwordInput = page.locator('input[name="passwd"], input[type="password"]').first();
    if (await passwordInput.isVisible().catch(() => false)) {
      await passwordInput.fill(TEST_PASSWORD);
      await submitMicrosoftStep(page, passwordInput, [
        page.locator('input[type="submit"][value="Sign in"]'),
        page.getByRole("button", { name: /^sign in$/i }),
      ]);
      continue;
    }

    if (await clickIfVisible(page, page.getByRole("button", { name: /^no$/i }), 1_500)) {
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      continue;
    }

    if (await clickIfVisible(page, page.getByRole("button", { name: /^yes$/i }), 1_500)) {
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
      continue;
    }

    const diagnosis = await getBlockingDiagnosis(page);
    if (diagnosis && /Login\/backend blocking error|blocked by MFA|not assigned to or consented/i.test(diagnosis)) {
      throw new Error(`Microsoft login cannot continue: ${diagnosis}\n${await describeCurrentPage(page)}`);
    }

    await page.waitForTimeout(1_000);
  }

  const diagnosis = await getBlockingDiagnosis(page);
  const diagnosisText = diagnosis ? `\nDiagnosis: ${diagnosis}` : "";
  throw new Error(`Microsoft login timed out before the ATS shell loaded.${diagnosisText}\n${await describeCurrentPage(page)}`);
}

async function completeQaLogin(page, testInfo) {
  requireSecret("ATS_QA_LOGIN_SECRET", QA_LOGIN_SECRET);

  const response = await page.request.post(`${API_BASE}/auth/qa-login`, {
    headers: { "x-qa-login-secret": QA_LOGIN_SECRET },
    data: { testPrefix: TEST_PREFIX },
  });
  const loginResult = await readApiResponse(response);
  const bodyText = loginResult.raw;
  const body = typeof loginResult.body === "object" ? loginResult.body : null;
  await attachJson(testInfo, "qa-login-response.json", sanitizeQaLoginResult(loginResult));

  if (!response.ok()) {
    throw new Error(`QA test login failed (${response.status()}) at ${API_BASE}/auth/qa-login\n${bodyText || "No response body"}`);
  }

  const session = body?.data ?? body;
  if (!session?.accessToken || !session?.refreshToken) {
    throw new Error(`QA test login did not return session tokens.\n${bodyText || "No response body"}`);
  }

  const meResponse = await page.request.get(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  const meResult = await readApiResponse(meResponse);
  const meUser = meResult.body?.data ?? meResult.body;
  await attachJson(testInfo, "qa-login-session.json", {
    apiBase: API_BASE,
    loginStatus: loginResult.status,
    meStatus: meResult.status,
    user: meUser
      ? {
          email: meUser.email,
          role: meUser.role,
          accessScope: meUser.accessScope,
          canViewSalary: !!meUser.canViewSalary,
          canApproveOffers: !!meUser.canApproveOffers,
          canApproveRequisitions: !!meUser.canApproveRequisitions,
        }
      : null,
  });

  if (!meResponse.ok()) {
    throw new Error(`QA test login returned tokens, but /auth/me rejected the session (${meResponse.status()}) at ${API_BASE}/auth/me\n${meResult.raw || "No response body"}`);
  }

  if (!meUser?.email || !meUser?.role) {
    throw new Error(`QA test login /auth/me response did not include a usable user.\n${meResult.raw || "No response body"}`);
  }

  if (meUser.role === "admin") {
    throw new Error("QA test login returned an admin user. QA automation must use a limited non-admin test user.");
  }

  await page.evaluate(({ accessToken, refreshToken }) => {
    sessionStorage.setItem("karm_ats_access_token", accessToken);
    sessionStorage.setItem("karm_ats_refresh_token", refreshToken);
  }, session);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAtsShell(page, "after QA test login");
}

async function openAts(page, testInfo) {
  await page.goto("/");
  await test.step(QA_LOGIN_ENABLED ? "complete temporary QA test login and open ATS shell" : "complete Microsoft login and open ATS shell", async () => {
    if (QA_LOGIN_ENABLED) {
      await completeQaLogin(page, testInfo);
      return;
    }
    await completeMicrosoftLogin(page);
  });
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

  test.afterEach(async ({ page }, testInfo) => {
    const events = browserEventsByTest.get(testInfo) || [];
    await testInfo.attach("browser-events.txt", {
      body: events.join("\n") || "No browser console/page/request errors captured.",
      contentType: "text/plain",
    });

    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach("current-page-state.txt", {
        body: await describeCurrentPage(page),
        contentType: "text/plain",
      });
    }
  });

  test("logs in and opens the live ATS dashboard", async ({ page }, testInfo) => {
    await openAts(page, testInfo);

    await expect(page.locator(".page-title"), "Dashboard title should prove the authenticated app loaded").toContainText(/Karm\. ATS Dashboard|Dashboard/i);
    await expect(page.getByTestId("nav-jobs"), "QA user should be able to see job requisitions").toBeVisible();
    await expect(page.getByTestId("nav-candidates"), "QA user should be able to see candidates").toBeVisible();
    await expect(page.getByTestId("nav-pipeline"), "QA user should be able to see the pipeline").toBeVisible();
  });

  test("creates only a TEST_ candidate through the normal UI", async ({ page }, testInfo) => {
    await openAts(page, testInfo);

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

    const createResponsePromise = page.waitForResponse(response =>
      response.url().startsWith(`${API_BASE}/candidates`) &&
      response.request().method() === "POST",
      { timeout: 30_000 },
    ).catch(error => {
      throw new Error(`Candidate create API request was not observed after clicking Add Candidate. The UI may not be submitting, may be blocked by validation, or may be using the wrong API base URL.\n${error.message}`);
    });

    await page.getByRole("button", { name: /^add candidate$/i }).click();
    const createResponse = await createResponsePromise;
    const createResult = await readApiResponse(createResponse);
    await attachJson(testInfo, "candidate-create-response.json", createResult);

    if (!createResponse.ok()) {
      throw new Error(`Candidate create API failed (${createResponse.status()}) at ${createResponse.url()}.\n${createResult.raw || "No response body"}`);
    }

    await expect(page.locator(".modal"), "Candidate modal should close after successful creation").toHaveCount(0, { timeout: 30_000 });
    await page.locator(".search-input").fill(unique);
    const testCandidateRow = page.locator("tbody tr", { hasText: unique });
    await expect(testCandidateRow, "New TEST_ candidate should appear in Candidate Database").toBeVisible({ timeout: 30_000 });
    await expect(testCandidateRow, "New TEST_ candidate email should match submitted email").toContainText(email);
    await expect(testCandidateRow, "Candidate created without assigning to a production job should have zero active apps").toContainText(/\b0\b/);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAtsShell(page, "after reloading to prove TEST_ candidate persistence");
    await openNav(page, "candidates", "Candidate Database");
    await page.locator(".search-input").fill(unique);
    const persistedCandidateRow = page.locator("tbody tr", { hasText: unique });
    await expect(persistedCandidateRow, "New TEST_ candidate should still be searchable after page reload").toBeVisible({ timeout: 30_000 });
    await expect(persistedCandidateRow, "Persisted TEST_ candidate email should still match").toContainText(email);
    await testInfo.attach("candidate-persistence-check.txt", {
      body: `Created and reloaded TEST_ candidate:\nname=${unique}\nemail=${email}\napiStatus=${createResponse.status()}\n`,
      contentType: "text/plain",
    });
  });

  test("opens key operational pages without touching non-TEST records", async ({ page }, testInfo) => {
    await openAts(page, testInfo);

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
