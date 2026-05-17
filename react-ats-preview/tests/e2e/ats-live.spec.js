import { expect, test } from "@playwright/test";

const TEST_PREFIX = process.env.ATS_TEST_PREFIX || "TEST_";
const TEST_EMAIL = process.env.ATS_TEST_EMAIL;
const TEST_PASSWORD = process.env.ATS_TEST_PASSWORD;
const API_BASE = (process.env.ATS_API_BASE_URL || "https://karm-ats-api-g4dzhfe3buagc7e2.centralus-01.azurewebsites.net/api/v1").replace(/\/$/, "");
const QA_LOGIN_ENABLED_RAW = String(process.env.ATS_QA_LOGIN_ENABLED || "").trim();
const QA_LOGIN_ENABLED = parseBooleanFlag(QA_LOGIN_ENABLED_RAW);
const QA_LOGIN_SECRET = process.env.ATS_QA_LOGIN_SECRET;
const AUTH_MODE = normalizeAuthMode(process.env.ATS_AUTH_MODE);
const AUTH_TIMEOUT_MS = Number(process.env.ATS_AUTH_TIMEOUT_MS || 120_000);
const browserEventsByTest = new WeakMap();
const forbiddenResponsesByTest = new WeakMap();
const forbiddenResponsePromisesByTest = new WeakMap();

function parseBooleanFlag(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeAuthMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["qa", "qa-login", "test", "test-login"].includes(normalized)) return "qa-login";
  if (["microsoft", "microsoft-login", "msal"].includes(normalized)) return "microsoft-login";
  return QA_LOGIN_ENABLED ? "qa-login" : "microsoft-login";
}

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

function unwrapApiData(result) {
  return result?.body?.data ?? result?.body;
}

async function getAtsAccessToken(page) {
  const token = await page.evaluate(() => sessionStorage.getItem("karm_ats_access_token"));
  if (!token) throw new Error("No ATS access token was found in sessionStorage for QA API setup.");
  return token;
}

async function qaApiRequest(page, method, path, data) {
  const accessToken = await getAtsAccessToken(page);
  const response = await page.request.fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    data,
  });
  const result = await readApiResponse(response);
  return { response, result, data: unwrapApiData(result) };
}

async function attachJson(testInfo, name, value) {
  if (!testInfo) return;
  await testInfo.attach(name, {
    body: `${JSON.stringify(value, null, 2)}\n`,
    contentType: "application/json",
  });
}

function isLiveApiUrl(url) {
  return String(url || "").startsWith(`${API_BASE}/`);
}

function compactResponseBody(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 2_000);
}

function getAuthDiagnostics() {
  return {
    authMode: AUTH_MODE,
    qaLoginEnabled: QA_LOGIN_ENABLED,
    qaLoginEnabledRaw: QA_LOGIN_ENABLED_RAW || "(empty)",
    apiBase: API_BASE,
    hasQaLoginSecret: !!QA_LOGIN_SECRET,
    hasMicrosoftEmail: !!TEST_EMAIL,
    hasMicrosoftPassword: !!TEST_PASSWORD,
  };
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
  if (!QA_LOGIN_SECRET) {
    throw new Error("QA login was requested, but ATS_QA_LOGIN_SECRET is missing. Refusing to fall back to Microsoft login.");
  }

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

  if (meUser.role !== "admin") {
    throw new Error(`QA test login is enabled but returned role "${meUser.role}" for ${meUser.email}. Expected the isolated QA account to be admin so Playwright can test the full ATS without RBAC blocking. This usually means the backend App Service has not deployed the latest QA-login code.`);
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
  await attachJson(testInfo, "auth-mode.json", getAuthDiagnostics());
  testInfo?.annotations.push({ type: "auth-mode", description: AUTH_MODE });

  await test.step(AUTH_MODE === "qa-login" ? "complete temporary QA test login and open ATS shell" : "complete Microsoft login and open ATS shell", async () => {
    if (AUTH_MODE === "qa-login") {
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

function modal(page) {
  return page.locator(".modal").last();
}

async function waitForOptionalDownload(page, clickAction, timeout = 5_000) {
  const downloadPromise = page.waitForEvent("download", { timeout })
    .then(download => ({ downloaded: true, suggestedFilename: download.suggestedFilename() }))
    .catch(error => ({ downloaded: false, error: error.message }));
  await clickAction();
  return downloadPromise;
}

async function waitForOptionalResponse(page, predicate, timeout = 10_000) {
  return page.waitForResponse(predicate, { timeout }).catch(() => null);
}

async function selectFirstUsableOption(selectLocator) {
  const options = await selectLocator.locator("option").evaluateAll(options =>
    options.map(option => ({
      value: option.value,
      label: option.label || option.textContent || "",
      disabled: option.disabled,
    })),
  ).catch(() => []);
  const option = options.find(item => !item.disabled && item.value !== "" && !/^all$/i.test(item.value) && !/^all\b/i.test(item.label));
  if (!option) return null;
  await selectLocator.selectOption(option.value ? { value: option.value } : { label: option.label });
  return option;
}

async function findFirstRowContaining(page, text) {
  const rows = page.locator("tbody tr");
  const rowCount = await rows.count().catch(() => 0);
  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const rowText = await row.innerText().catch(() => "");
    if (rowText.includes(text)) return row;
  }
  return null;
}

async function findFirstTestRow(page) {
  return findFirstRowContaining(page, TEST_PREFIX);
}

async function clickAndExpectModal(page, buttonLocator, titlePattern, timeout = 10_000) {
  await buttonLocator.click();
  const currentModal = modal(page);
  await expect(currentModal.locator(".modal-title"), "Expected modal did not open").toContainText(titlePattern, { timeout });
  return currentModal;
}

async function closeModalIfVisible(page) {
  const currentModal = modal(page);
  if (await currentModal.isVisible().catch(() => false)) {
    const closeButton = currentModal.locator(".modal-close").first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await expect(currentModal).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
      return;
    }
    const cancelButton = currentModal.getByRole("button", { name: /cancel|close/i }).first();
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
      await expect(currentModal).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
    }
  }
}

async function ensureTestPipelineFixture(page, testInfo, audit, candidate, options = {}) {
  const moduleName = options.moduleName || "Active Hiring Pipeline";
  const artifactPrefix = options.artifactPrefix || "qa-pipeline";

  if (!candidate?.id) {
    audit.addRecommendation(moduleName, "Talent profile create API response did not include an id, so the QA agent could not create a TEST_ application fixture.");
    return null;
  }

  const now = Date.now();
  const title = `${TEST_PREFIX}${options.title || `QA Active Pipeline Role ${now}`}`;
  const positionCreate = await qaApiRequest(page, "POST", "/positions", {
    title,
    departmentName: "QA",
    entity: "egypt",
    seniority: "mid",
    employmentType: "full_time",
    currency: "EGP",
    salaryMin: 1,
    salaryMax: 2,
    priority: "normal",
    description: `${TEST_PREFIX} QA-only active hiring pipeline fixture. Do not use for production recruiting.`,
    requirements: [],
    headcountRationale: "TEST_ QA fixture",
  });
  await attachJson(testInfo, `${artifactPrefix}-position-create-response.json`, positionCreate.result);
  if (!positionCreate.response.ok()) {
    throw new Error(`TEST_ pipeline position create API failed (${positionCreate.response.status()}) at ${API_BASE}/positions.\n${positionCreate.result.raw || "No response body"}`);
  }

  let position = positionCreate.data;
  if (!position?.id) {
    throw new Error(`TEST_ pipeline position create response did not include an id.\n${positionCreate.result.raw || "No response body"}`);
  }

  if (position.status !== "open") {
    const statusUpdate = await qaApiRequest(page, "PATCH", `/positions/${position.id}/status`, { status: "open" });
    await attachJson(testInfo, `${artifactPrefix}-position-open-response.json`, statusUpdate.result);
    if (!statusUpdate.response.ok()) {
      throw new Error(`TEST_ pipeline position open API failed (${statusUpdate.response.status()}).\n${statusUpdate.result.raw || "No response body"}`);
    }
    position = statusUpdate.data || position;
  }

  const applicationCreate = await qaApiRequest(page, "POST", "/applications", {
    candidateId: candidate.id,
    positionId: position.id,
  });
  await attachJson(testInfo, `${artifactPrefix}-application-create-response.json`, applicationCreate.result);
  if (!applicationCreate.response.ok()) {
    throw new Error(`TEST_ application create API failed (${applicationCreate.response.status()}) at ${API_BASE}/applications.\n${applicationCreate.result.raw || "No response body"}`);
  }

  let application = applicationCreate.data;
  if (!application?.id) {
    throw new Error(`TEST_ application create response did not include an id.\n${applicationCreate.result.raw || "No response body"}`);
  }

  if (options.moveStage !== false) {
    const stageMove = await qaApiRequest(page, "PATCH", `/applications/${application.id}/stage`, {
      stage: "assessment",
      reason: options.stageReason || "TEST_ QA active hiring pipeline fixture for interview scheduling audit.",
    });
    await attachJson(testInfo, `${artifactPrefix}-application-stage-response.json`, stageMove.result);
    if (stageMove.response.ok()) {
      application = stageMove.data || application;
    } else if (!/already|current/i.test(stageMove.result.raw || "")) {
      throw new Error(`TEST_ application stage move API failed (${stageMove.response.status()}).\n${stageMove.result.raw || "No response body"}`);
    }
  }

  audit.recordAction(moduleName, "Create TEST_ application fixture", "tested", `${candidate.name} -> ${position.title}`);
  return { position, application, candidate };
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function formatError(error) {
  if (!error) return "No error details captured.";
  return String(error.stack || error.message || error).slice(0, 6_000);
}

function escapeMd(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const PRODUCT_AUDIT_CATEGORIES = [
  "Missing ATS features",
  "UX improvements",
  "Workflow improvements",
  "Permission/governance improvements",
  "Recruiter productivity enhancements",
  "Hiring manager experience improvements",
  "Reporting/dashboard recommendations",
  "Automation opportunities",
  "Candidate experience improvements",
  "Mobile/responsive recommendations",
  "AI/automation opportunities",
  "Audit/compliance/security recommendations",
];

const PRODUCT_AUDIT_BASELINE = [
  {
    category: "Missing ATS features",
    module: "Talent Database",
    priority: "Critical",
    businessImpact: "High",
    userExperienceImpact: "High",
    technicalComplexity: "Medium",
    recommendation: "Complete resume intelligence for PDF and Word files, duplicate candidate detection, candidate source history, and controlled candidate merge workflows.",
    benchmark: "Mature ATS platforms treat the candidate profile as the system of record, with searchable resumes, deduplication, and a complete application history.",
    suggestedNextStep: "Add a parsing coverage dashboard and mark candidates with low-confidence extraction so recruiters know what needs manual review.",
  },
  {
    category: "UX improvements",
    module: "Global UI",
    priority: "Important",
    businessImpact: "Medium",
    userExperienceImpact: "High",
    technicalComplexity: "Low",
    recommendation: "Standardize success toasts, inline validation messages, disabled-state explanations, and row action layouts across all modules.",
    benchmark: "Professional ATS tools make every save, rejection, approval, and assignment visibly confirm what happened and what changed.",
    suggestedNextStep: "Create shared button, toast, validation, and empty-state patterns for all ATS pages.",
  },
  {
    category: "Workflow improvements",
    module: "Hiring Requests / Requisitions",
    priority: "Critical",
    businessImpact: "High",
    userExperienceImpact: "Medium",
    technicalComplexity: "Medium",
    recommendation: "Link the hiring request, approval decision, requisition, pipeline, offer, and hire outcome in one governed workflow.",
    benchmark: "Enterprise ATS workflows preserve the chain from approved headcount to offer approval so HR can explain why a role exists and who approved it.",
    suggestedNextStep: "Add visible status history and approval owners to each requisition and prevent bypassing required approval steps.",
  },
  {
    category: "Permission/governance improvements",
    module: "Settings/RBAC",
    priority: "Critical",
    businessImpact: "High",
    userExperienceImpact: "High",
    technicalComplexity: "Medium",
    recommendation: "Expose admin-editable user roles, access scopes, department assignment, salary visibility, offer approval, and requisition approval in Settings.",
    benchmark: "Professional internal systems give admins clear role governance while keeping recruiters, managers, and interviewers scoped to their work.",
    suggestedNextStep: "Keep role changes auditable and show exactly what each permission enables before saving.",
  },
  {
    category: "Recruiter productivity enhancements",
    module: "Active Hiring Pipeline",
    priority: "Important",
    businessImpact: "High",
    userExperienceImpact: "High",
    technicalComplexity: "Medium",
    recommendation: "Add saved views, recruiter workload filters, bulk actions, next-action reminders, stuck-stage queues, and interview-feedback chase lists.",
    benchmark: "Recruiter-centered ATS products minimize daily triage time by surfacing priority applications and overdue follow-ups.",
    suggestedNextStep: "Introduce a recruiter workbench view with delayed candidates, pending feedback, and unassigned requisitions.",
  },
  {
    category: "Hiring manager experience improvements",
    module: "Interviews / Scorecards",
    priority: "Important",
    businessImpact: "High",
    userExperienceImpact: "High",
    technicalComplexity: "Medium",
    recommendation: "Give hiring managers a focused view for assigned jobs, candidate CVs, interview kits, structured recommendations, and pending approvals.",
    benchmark: "Strong ATS experiences keep managers away from the full HR workspace and guide them through only the decisions they own.",
    suggestedNextStep: "Add a manager dashboard with assigned candidates, missing feedback, pending requisition approvals, and offer approvals.",
  },
  {
    category: "Reporting/dashboard recommendations",
    module: "Dashboard / Analytics",
    priority: "Important",
    businessImpact: "High",
    userExperienceImpact: "Medium",
    technicalComplexity: "Medium",
    recommendation: "Expand executive metrics: time to fill, time in stage, conversion by stage, source quality, recruiter load, offer acceptance, and plan-vs-filled progress.",
    benchmark: "Enterprise ATS dashboards move beyond counts and show pipeline health, bottlenecks, and hiring-plan progress.",
    suggestedNextStep: "Add dashboard tiles with drill-through filters so EXCOM and HR can trace each metric to the records behind it.",
  },
  {
    category: "Automation opportunities",
    module: "Active Hiring Pipeline / Interviews",
    priority: "Important",
    businessImpact: "High",
    userExperienceImpact: "Medium",
    technicalComplexity: "Medium",
    recommendation: "Automate reminders for stuck candidates, overdue hiring-manager feedback, upcoming interviews, rejected-candidate follow-up, and pending approvals.",
    benchmark: "Modern ATS systems reduce manual chasing through SLA alerts and task queues while keeping humans in control of decisions.",
    suggestedNextStep: "Add a notification preference model and start with overdue feedback and stuck-stage alerts.",
  },
  {
    category: "Candidate experience improvements",
    module: "Talent Database / Communications",
    priority: "Important",
    businessImpact: "Medium",
    userExperienceImpact: "High",
    technicalComplexity: "Medium",
    recommendation: "Add candidate communication templates, contact history, rejection reasons, and candidate-facing status/email consistency.",
    benchmark: "Candidate experience is part of employer brand; professional ATS tools keep candidate communication consistent and traceable.",
    suggestedNextStep: "Start with email templates for screening, interview scheduling, rejection, offer, and missing documents.",
  },
  {
    category: "Mobile/responsive recommendations",
    module: "Responsive UX",
    priority: "Nice-to-have",
    businessImpact: "Medium",
    userExperienceImpact: "Medium",
    technicalComplexity: "Medium",
    recommendation: "Optimize mobile and tablet views for manager approvals, scorecards, candidate review, and urgent HR actions.",
    benchmark: "Manager workflows often happen outside HR desktops, so responsive approval and feedback flows matter even if recruiters use desktop.",
    suggestedNextStep: "Prioritize mobile layouts for Hiring Requests, Scorecards, and Offer/Requisition approvals before full pipeline management.",
  },
  {
    category: "AI/automation opportunities",
    module: "AI QA / Resume Intelligence",
    priority: "Important",
    businessImpact: "High",
    userExperienceImpact: "High",
    technicalComplexity: "High",
    recommendation: "Use AI carefully for resume summarization, candidate-job fit notes, missing-field detection, JD drafting, QA/product audits, and anomaly detection.",
    benchmark: "AI in an ATS should assist review and consistency, not make uncontrolled hiring decisions.",
    suggestedNextStep: "Keep AI outputs explainable, optional, and auditable, with human confirmation before candidate decisions.",
  },
  {
    category: "Audit/compliance/security recommendations",
    module: "Audit / Security",
    priority: "Critical",
    businessImpact: "High",
    userExperienceImpact: "Medium",
    technicalComplexity: "Medium",
    recommendation: "Strengthen audit trails for exports, CV access/downloads, salary visibility, role changes, deletes, approvals, and failed permission checks.",
    benchmark: "Enterprise-grade ATS usage requires traceability around sensitive candidate, salary, and offer data.",
    suggestedNextStep: "Add audit entries for every export/download/delete and review retention rules for CVs and candidate personal data.",
  },
];

function normalizeProductPriority(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "critical") return "Critical";
  if (normalized === "nice-to-have" || normalized === "nice to have" || normalized === "nice") return "Nice-to-have";
  return "Important";
}

function normalizeImpact(value, fallback = "Medium") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  return fallback;
}

function normalizeComplexity(value, fallback = "Medium") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  return fallback;
}

function normalizeProductCategory(value) {
  const exact = PRODUCT_AUDIT_CATEGORIES.find(category => category.toLowerCase() === String(value || "").trim().toLowerCase());
  return exact || "UX improvements";
}

function inferRecommendationMetadata(module, recommendation) {
  const text = `${module} ${recommendation}`.toLowerCase();

  if (/recruiter filter|workload|bulk|stuck|next action|priority/i.test(text)) {
    return {
      category: "Recruiter productivity enhancements",
      priority: "Important",
      businessImpact: "High",
      userExperienceImpact: "High",
      technicalComplexity: "Low",
      benchmark: "Recruiters need fast filtering and triage controls to manage volume without spreadsheet workarounds.",
    };
  }

  if (/edit user|role|permission|salary|access|rbac|settings/i.test(text)) {
    return {
      category: "Permission/governance improvements",
      priority: "Critical",
      businessImpact: "High",
      userExperienceImpact: "High",
      technicalComplexity: "Medium",
      benchmark: "Admin role governance must be obvious, auditable, and safe before wider rollout.",
    };
  }

  if (/delete action|delete button|bad upload|mistaken record/i.test(text)) {
    return {
      category: "Audit/compliance/security recommendations",
      priority: "Important",
      businessImpact: "Medium",
      userExperienceImpact: "Medium",
      technicalComplexity: "Low",
      benchmark: "Delete actions should be available to authorized admins, confirmed explicitly, and always audit logged.",
    };
  }

  if (/pipeline|kanban|card|application fixture/i.test(text)) {
    return {
      category: "Workflow improvements",
      priority: "Important",
      businessImpact: "High",
      userExperienceImpact: "Medium",
      technicalComplexity: "Medium",
      benchmark: "Active hiring pipeline boards should support safe stage movement, quick actions, delayed-application visibility, and realistic QA fixtures.",
    };
  }

  if (/interview|scorecard|eligible/i.test(text)) {
    return {
      category: "Hiring manager experience improvements",
      priority: "Important",
      businessImpact: "High",
      userExperienceImpact: "High",
      technicalComplexity: "Medium",
      benchmark: "Interview workflows should make eligible candidates and scorecard responsibilities clear to managers and interviewers.",
    };
  }

  if (/offer|salary/i.test(text)) {
    return {
      category: "Permission/governance improvements",
      priority: "Critical",
      businessImpact: "High",
      userExperienceImpact: "Medium",
      technicalComplexity: "Medium",
      benchmark: "Offer and salary workflows require controlled visibility, approvals, and clear policy states.",
    };
  }

  if (/mobile|responsive/i.test(text)) {
    return {
      category: "Mobile/responsive recommendations",
      priority: "Nice-to-have",
      businessImpact: "Medium",
      userExperienceImpact: "Medium",
      technicalComplexity: "Medium",
      benchmark: "Responsive manager workflows help approvals and feedback continue outside HR desktops.",
    };
  }

  return {
    category: "UX improvements",
    priority: "Important",
    businessImpact: "Medium",
    userExperienceImpact: "High",
    technicalComplexity: "Low",
    benchmark: "Professional ATS interfaces explain what happened, what is next, and why an action is unavailable.",
  };
}

function createProductRecommendation(item, index) {
  const inferred = inferRecommendationMetadata(item.module, item.recommendation);
  const merged = { ...inferred, ...item };

  return {
    id: merged.id || `ATS-PX-${String(index + 1).padStart(3, "0")}`,
    category: normalizeProductCategory(merged.category),
    module: merged.module || "General ATS",
    priority: normalizeProductPriority(merged.priority),
    businessImpact: normalizeImpact(merged.businessImpact),
    userExperienceImpact: normalizeImpact(merged.userExperienceImpact),
    technicalComplexity: normalizeComplexity(merged.technicalComplexity),
    recommendation: merged.recommendation,
    benchmark: merged.benchmark || inferred.benchmark,
    suggestedNextStep: merged.suggestedNextStep || "Review with HR, one recruiter, one hiring manager, and one admin before prioritizing for the next sprint.",
    source: merged.source || "runtime QA observation",
  };
}

function buildProductAudit(runtimeRecommendations = []) {
  const baseline = PRODUCT_AUDIT_BASELINE.map(item => ({ ...item, source: "professional ATS benchmark" }));
  const combined = [...baseline, ...runtimeRecommendations].map(createProductRecommendation);
  const categories = PRODUCT_AUDIT_CATEGORIES.map(category => {
    const items = combined.filter(item => item.category === category);
    const priorityCounts = items.reduce((acc, item) => {
      acc[item.priority] = (acc[item.priority] || 0) + 1;
      return acc;
    }, {});

    return {
      category,
      critical: priorityCounts.Critical || 0,
      important: priorityCounts.Important || 0,
      niceToHave: priorityCounts["Nice-to-have"] || 0,
      items,
    };
  });

  const priorityCounts = combined.reduce((acc, item) => {
    acc[item.priority] = (acc[item.priority] || 0) + 1;
    return acc;
  }, {});

  return {
    benchmarkStatement: "Conceptual benchmark against mature ATS patterns from platforms such as Greenhouse, Lever, Workday, and BambooHR: complete candidate profiles, governed approvals, structured scorecards, recruiter productivity queues, role-based visibility, auditability, reporting, and automation. This is not a feature copy; it is a professional-readiness lens for Karm. ATS.",
    priorityCounts: {
      Critical: priorityCounts.Critical || 0,
      Important: priorityCounts.Important || 0,
      "Nice-to-have": priorityCounts["Nice-to-have"] || 0,
    },
    categories,
    recommendations: combined,
  };
}

function buildReadinessSummary(bugs) {
  const bySeverity = bugs.reduce((acc, bug) => {
    acc[bug.severity] = (acc[bug.severity] || 0) + 1;
    return acc;
  }, {});
  const blocking = (bySeverity.Critical || 0) > 0 || (bySeverity.High || 0) > 0;
  const status = blocking
    ? "Not ready for wider rollout"
    : bugs.length > 0
      ? "Pilot-ready with fixes recommended"
      : "No blocking findings in this QA run";

  return {
    status,
    bySeverity,
    recommendation: blocking
      ? "Fix Critical/High findings before inviting a wider recruiter or hiring-manager audience."
      : bugs.length > 0
        ? "Review Medium/Low findings and UX recommendations before expanding beyond controlled pilot users."
        : "Continue pilot testing with real role accounts and monitor audit logs after deployment.",
  };
}

function classifyAuditIssue(flow, error) {
  const message = formatError(error);
  const normalized = message.toLowerCase();

  if (/qa test login|auth\/qa-login|auth\/me|microsoft login|aadsts|login\/backend blocking|ats shell did not become visible|backend api is not reachable|load failed/i.test(message)) {
    return {
      category: "environment/auth setup issue",
      severity: "Critical",
      suggestedFix: "Verify QA login secrets, backend health, CORS, Azure AD redirect configuration, and that the authenticated ATS shell can load before reviewing downstream product flows.",
      uxRecommendation: "Keep authentication and backend setup failures separate from ATS product defects in the QA report.",
    };
  }

  if (/strict mode violation|locator|timeout.*waiting|expected.*to be visible|expected.*to contain text/i.test(message)) {
    return {
      category: "test automation issue",
      severity: flow.testFailureSeverity || "Medium",
      suggestedFix: "Use stable selectors, narrower table-cell assertions, and page-specific locators before treating this as a product defect.",
      uxRecommendation: "Expose stable data-testid hooks on critical recruiter actions and result cells.",
    };
  }

  if (/403|forbidden/i.test(message)) {
    return {
      category: "real product bug",
      severity: "High",
      suggestedFix: "Review the exact forbidden endpoint and confirm whether the QA admin account should be allowed, or hide/skip unauthorized frontend calls for lower roles.",
      uxRecommendation: "Show role/access errors inline with the blocked action instead of leaving users with a generic failure.",
    };
  }

  if (/api failed|request was not observed|validation failed|internal server error|save|create|schedule/i.test(message)) {
    return {
      category: "real product bug",
      severity: flow.productFailureSeverity || "High",
      suggestedFix: flow.suggestedFix || "Inspect the failed API response, frontend validation, and backend route handling for this ATS workflow.",
      uxRecommendation: flow.uxRecommendation || "Show a clear success or validation message at the point where the user took action.",
    };
  }

  return {
    category: flow.category || "real product bug",
    severity: flow.severity || "Medium",
    suggestedFix: flow.suggestedFix || "Inspect the attached screenshot, trace, browser events, and API evidence for this failed ATS workflow.",
    uxRecommendation: flow.uxRecommendation || "Make the failed state visible and actionable for recruiters.",
  };
}

function makeReportMarkdown(report) {
  const lines = [
    "# ATS Full Audit QA Report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Target: ${report.target}`,
    `- Auth mode: ${report.auth.authMode}`,
    `- Test prefix: ${report.testPrefix}`,
    `- Production database reset: ${report.safety.databaseReset}`,
    `- Demo seed: ${report.safety.demoSeed}`,
    `- Non-TEST records touched: ${report.safety.nonTestRecordsTouched}`,
    `- Readiness: ${report.readiness.status}`,
    `- Readiness recommendation: ${report.readiness.recommendation}`,
    "",
    "## Actions Tested",
    "",
    "| Module | Action | Status | Details |",
    "| --- | --- | --- | --- |",
    ...report.actionsTested.map(action => `| ${escapeMd(action.module)} | ${escapeMd(action.action)} | ${escapeMd(action.status)} | ${escapeMd(action.details)} |`),
    "",
    "## Flow Results",
    "",
    "| Flow | Module | Status | Duration |",
    "| --- | --- | --- | --- |",
    ...report.flows.map(flow => `| ${escapeMd(flow.name)} | ${escapeMd(flow.module)} | ${escapeMd(flow.status)} | ${flow.durationMs}ms |`),
    "",
  ];

  if (report.bugs.length === 0) {
    lines.push("## Bugs", "", "No bugs found in this run.", "");
  } else {
    lines.push(
      "## Bugs",
      "",
      "| ID | Severity | Category | Module | Bug | Suggested Fix | UX Recommendation |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...report.bugs.map(bug => `| ${bug.id} | ${bug.severity} | ${escapeMd(bug.category)} | ${escapeMd(bug.module)} | ${escapeMd(bug.bug)} | ${escapeMd(bug.suggestedFix)} | ${escapeMd(bug.uxRecommendation)} |`),
      "",
    );

    for (const bug of report.bugs) {
      lines.push(
        `### ${bug.id}: ${bug.severity} - ${bug.module}`,
        "",
        `**Category:** ${bug.category}`,
        "",
        `**Bug:** ${escapeMd(bug.bug)}`,
        "",
        "**Reproduction steps:**",
        ...bug.reproductionSteps.map(step => `- ${escapeMd(step)}`),
        "",
        `**Evidence:** ${escapeMd(bug.evidence.errorMessage)}`,
        "",
        `**Screenshot:** ${bug.evidence.screenshot || "Not captured"}`,
        "",
        `**Trace:** ${bug.evidence.trace}`,
        "",
        `**Suggested fix:** ${escapeMd(bug.suggestedFix)}`,
        "",
        `**UX recommendation:** ${escapeMd(bug.uxRecommendation)}`,
        "",
      );
    }
  }

  if (report.recommendations.length > 0) {
    lines.push(
      "## UX Recommendations",
      "",
      "| Priority | Module | Recommendation | Business Impact | UX Impact | Technical Complexity |",
      "| --- | --- | --- | --- | --- | --- |",
      ...report.recommendations.map(item => `| ${escapeMd(item.priority)} | ${escapeMd(item.module)} | ${escapeMd(item.recommendation)} | ${escapeMd(item.businessImpact)} | ${escapeMd(item.userExperienceImpact)} | ${escapeMd(item.technicalComplexity)} |`),
      "",
    );
  }

  if (report.productAudit) {
    lines.push(
      "## Product / UX Auditor Assessment",
      "",
      report.productAudit.benchmarkStatement,
      "",
      `- Critical enhancements: ${report.productAudit.priorityCounts.Critical}`,
      `- Important enhancements: ${report.productAudit.priorityCounts.Important}`,
      `- Nice-to-have enhancements: ${report.productAudit.priorityCounts["Nice-to-have"]}`,
      "",
      "### Enhancement Coverage",
      "",
      "| Category | Critical | Important | Nice-to-have |",
      "| --- | --- | --- | --- |",
      ...report.productAudit.categories.map(category => `| ${escapeMd(category.category)} | ${category.critical} | ${category.important} | ${category.niceToHave} |`),
      "",
      "### Enterprise ATS Roadmap",
      "",
      "| ID | Priority | Category | Module | Recommendation | Business Impact | UX Impact | Technical Complexity | Benchmark / Rationale | Suggested Next Step |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...report.productAudit.recommendations.map(item => `| ${item.id} | ${item.priority} | ${escapeMd(item.category)} | ${escapeMd(item.module)} | ${escapeMd(item.recommendation)} | ${item.businessImpact} | ${item.userExperienceImpact} | ${item.technicalComplexity} | ${escapeMd(item.benchmark)} | ${escapeMd(item.suggestedNextStep)} |`),
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

function createAudit(testInfo) {
  const bugs = [];
  const flows = [];
  const recommendations = [];
  const actionsTested = [];

  const recordAction = (module, action, status = "tested", details = "") => {
    actionsTested.push({
      module,
      action,
      status,
      details,
      timestamp: new Date().toISOString(),
    });
  };

  const addBug = async (page, flow, error, overrides = {}) => {
    const classification = { ...classifyAuditIssue(flow, error), ...overrides };
    const id = `ATS-QA-${String(bugs.length + 1).padStart(3, "0")}`;
    const screenshotName = `${id}-${slugify(flow.name)}.png`;
    let screenshot = null;
    try {
      screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(screenshotName, { body: screenshot, contentType: "image/png" });
    } catch {
      screenshot = null;
    }

    bugs.push({
      id,
      severity: classification.severity,
      category: classification.category,
      module: flow.module,
      bug: classification.bug || `${flow.name} failed: ${String(error?.message || error || "Unknown failure").split("\n")[0]}`,
      reproductionSteps: classification.reproductionSteps || flow.reproductionSteps,
      evidence: {
        errorMessage: formatError(error),
        screenshot: screenshot ? screenshotName : null,
        trace: "See the Playwright trace.zip artifact for the full browser session.",
        extra: classification.evidence || null,
      },
      suggestedFix: classification.suggestedFix,
      uxRecommendation: classification.uxRecommendation,
    });
  };

  const runFlow = async (page, flow, fn) => {
    const startedAt = Date.now();
    const bugCountBefore = bugs.length;
    try {
      await test.step(flow.name, async () => {
        await fn();
      });
      flows.push({
        name: flow.name,
        module: flow.module,
        status: bugs.length === bugCountBefore ? "passed" : "completed_with_findings",
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      await addBug(page, flow, error);
      flows.push({
        name: flow.name,
        module: flow.module,
        status: "failed_but_audit_continued",
        durationMs: Date.now() - startedAt,
      });
    }
  };

  const check = async (page, flow, bug, fn, overrides = {}) => {
    try {
      await fn();
      return true;
    } catch (error) {
      await addBug(page, flow, error, { bug, ...overrides });
      return false;
    }
  };

  const addRecommendation = (module, recommendation, metadata = {}) => {
    const productRecommendation = createProductRecommendation({
      id: metadata.id || `ATS-RX-${String(recommendations.length + 1).padStart(3, "0")}`,
      module,
      recommendation,
      ...metadata,
      source: metadata.source || "runtime QA observation",
    }, recommendations.length);
    recommendations.push(productRecommendation);
  };

  const attachReport = async () => {
    const productAudit = buildProductAudit(recommendations);
    const report = {
      generatedAt: new Date().toISOString(),
      target: process.env.ATS_BASE_URL || "unknown",
      apiBase: API_BASE,
      testPrefix: TEST_PREFIX,
      auth: getAuthDiagnostics(),
      safety: {
        databaseReset: "not performed",
        demoSeed: "not performed",
        nonTestRecordsTouched: "no intentional writes outside TEST_ records",
      },
      readiness: buildReadinessSummary(bugs),
      actionsTested,
      flows,
      bugs,
      recommendations,
      productAudit,
    };
    await attachJson(testInfo, "qa-full-audit-report.json", report);
    await testInfo.attach("qa-full-audit-report.md", {
      body: makeReportMarkdown(report),
      contentType: "text/markdown",
    });
    return report;
  };

  return { bugs, flows, recommendations, actionsTested, addBug, runFlow, check, addRecommendation, recordAction, attachReport };
}

const FLOW = {
  dashboard: {
    name: "Dashboard loads",
    module: "Dashboard/Auth",
    reproductionSteps: ["Open the live ATS.", "Authenticate with the configured QA auth mode.", "Wait for the ATS shell and dashboard to load."],
    suggestedFix: "Confirm QA auth, backend health, app shell rendering, and initial dashboard data loading.",
    uxRecommendation: "Show a clear authenticated loading state and a specific backend/auth error when the dashboard cannot load.",
  },
  navigation: {
    name: "Navigation links open every main module",
    module: "Navigation",
    reproductionSteps: ["Log in to ATS.", "Click each sidebar navigation link.", "Verify the expected page title appears."],
    suggestedFix: "Check route/page mapping, RBAC navigation visibility, and page-load error handling for every main ATS module.",
    uxRecommendation: "Keep navigation labels stable and show a clear restricted-access state when a role cannot access a page.",
  },
  hiringRequests: {
    name: "Hiring Requests workflow audit",
    module: "Hiring Requests",
    reproductionSteps: ["Open Hiring Requests.", "Inspect the approval flow.", "Open Request New Hire and validate required fields without submitting production data."],
    suggestedFix: "Check hiring request modal validation, approval-step visibility, and TEST_ safe request creation.",
    uxRecommendation: "Make request status and approval owner clear so managers understand what is pending.",
  },
  jobs: {
    name: "Job requisitions open",
    module: "Job Requisitions",
    reproductionSteps: ["Log in to ATS.", "Open Job Requisitions from the sidebar.", "Verify filters and actions render."],
    suggestedFix: "Check job requisition page routing, RBAC visibility, and position list API responses.",
    uxRecommendation: "Keep job filters and action buttons aligned and explain empty/error states.",
  },
  jobActions: {
    name: "Job Requisitions buttons and TEST_ record actions",
    module: "Job Requisitions",
    reproductionSteps: ["Open Job Requisitions.", "Test export/import/new/edit/save/assign recruiter controls.", "Only close/delete positions created with TEST_ prefix."],
    suggestedFix: "Check position create/update/delete/assign recruiter API wiring and frontend save-state handling.",
    uxRecommendation: "Group row actions consistently and show success/error messages after every saved change.",
  },
  candidateCreate: {
    name: "Talent profile creation",
    module: "Talent Database",
    reproductionSteps: ["Open Talent Database.", "Click Add Candidate.", "Create a talent profile whose name starts with TEST_.", "Save without assigning to a production job."],
    suggestedFix: "Check Add Candidate form validation, POST /candidates response handling, and post-save modal state.",
    uxRecommendation: "Show a success toast and keep the newly created talent profile searchable immediately.",
  },
  candidatePersistence: {
    name: "Talent profile search and persistence",
    module: "Talent Database",
    reproductionSteps: ["Search for the TEST_ talent profile.", "Verify the row values.", "Reload the page.", "Search again and verify persistence."],
    suggestedFix: "Verify the talent profile is written to the production database and refetched after reload.",
    uxRecommendation: "Make saved records immediately visible and searchable after refresh.",
  },
  talentApplicationSeparation: {
    name: "Talent profile and application separation",
    module: "Talent Database / Active Hiring Pipeline",
    reproductionSteps: ["Create a TEST_ talent profile.", "Create a TEST_ application for that profile against a TEST_ requisition.", "Reject that TEST_ application.", "Verify the talent profile remains searchable and centralized."],
    suggestedFix: "Keep talent profile mutations separate from application stage/status updates. Rejection should update only the application/requisition relationship, never delete or hide the person globally.",
    uxRecommendation: "Use wording that makes rejection clearly apply to one requisition application, while the person profile and history remain reusable.",
  },
  candidateActions: {
    name: "Talent Database buttons, validation, profile, and TEST_ safety",
    module: "Talent Database",
    reproductionSteps: ["Open Talent Database.", "Test export, filters, Add Candidate validation, Referral validation, View Profile, and TEST_ delete availability."],
    suggestedFix: "Check candidate form validation, profile behavior, delete action availability, and CV download behavior.",
    uxRecommendation: "Keep CV preview separate from manual download and give admins a safe TEST_ delete path for bad uploads.",
  },
  pipeline: {
    name: "Active Hiring Pipeline page and card actions audit",
    module: "Active Hiring Pipeline",
    reproductionSteps: ["Open Active Hiring Pipeline.", "Verify search/filters, kanban, upload modal, card quick actions, and bulk actions without moving non-TEST records."],
    suggestedFix: "Check pipeline page routing, stage rendering, CV upload entry points, TEST_ card action safety, and empty states.",
    uxRecommendation: "Show delayed/empty pipeline states clearly and disable dangerous actions for non-TEST records during QA.",
  },
  interviews: {
    name: "Interview scheduling flow",
    module: "Interviews",
    reproductionSteps: ["Open Interviews.", "Open Schedule Interview.", "Only submit if a TEST_ eligible candidate is available."],
    suggestedFix: "Check Schedule Interview form binding, interviewerId submission, and POST /interviews validation.",
    uxRecommendation: "Disable scheduling or show a clear message when no eligible candidate is available.",
  },
  offers: {
    name: "Offer page and actions audit",
    module: "Offers",
    reproductionSteps: ["Open Offer Approvals.", "Verify the page renders, create-offer modal can open if allowed, and unauthorized salary/offer data calls are not made."],
    suggestedFix: "Check offer page RBAC, salary visibility logic, and backend offer list routes.",
    uxRecommendation: "Show masked salary/offer details unless the user has permission.",
  },
  permissions: {
    name: "Settings, role, and permission checks",
    module: "Settings/RBAC",
    reproductionSteps: ["Open Settings as the QA admin user.", "Verify user, permission, approval, audit, stages, and entities areas are available.", "Review captured 403 responses."],
    suggestedFix: "Check admin RBAC, settings page API calls, and frontend handling of forbidden routes.",
    uxRecommendation: "Make restricted actions explicit by role instead of failing silently.",
  },
  mobile: {
    name: "Mobile responsive basic audit",
    module: "Responsive UX",
    reproductionSteps: ["Resize the browser to a mobile viewport.", "Reload the authenticated ATS shell.", "Verify navigation and core dashboard still render."],
    suggestedFix: "Check sidebar/content responsive layout, overflow, and hidden action buttons on narrow screens.",
    uxRecommendation: "Provide a usable mobile or tablet layout for managers approving requests away from a desktop.",
  },
};

async function requireAuthenticated(isAuthenticated) {
  if (!isAuthenticated()) {
    throw new Error("Authenticated ATS shell is unavailable because the dashboard/auth flow did not complete.");
  }
}

test.describe("Karm ATS live QA full audit", () => {
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
    const forbiddenResponses = [];
    const forbiddenResponsePromises = [];
    forbiddenResponsesByTest.set(testInfo, forbiddenResponses);
    forbiddenResponsePromisesByTest.set(testInfo, forbiddenResponsePromises);

    page.on("response", response => {
      if (response.status() !== 403 || !isLiveApiUrl(response.url())) return;

      const request = response.request();
      const entry = {
        method: request.method(),
        url: response.url(),
        status: response.status(),
        resourceType: request.resourceType(),
        timestamp: new Date().toISOString(),
      };
      forbiddenResponses.push(entry);
      browserEvents.push(`[http:403] ${entry.method} ${entry.url}`);

      forbiddenResponsePromises.push(
        response.text()
          .then(text => {
            entry.responseBody = compactResponseBody(text);
            try {
              entry.responseJson = JSON.parse(text);
            } catch {
              // Keep the compact text body above for non-JSON responses.
            }
          })
          .catch(error => {
            entry.responseReadError = error.message;
          }),
      );
    });
  });

  test.afterEach(async ({ page }, testInfo) => {
    const events = browserEventsByTest.get(testInfo) || [];
    const forbiddenResponses = forbiddenResponsesByTest.get(testInfo) || [];
    const forbiddenResponsePromises = forbiddenResponsePromisesByTest.get(testInfo) || [];
    await Promise.allSettled(forbiddenResponsePromises);

    if (forbiddenResponses.length > 0) {
      await attachJson(testInfo, "http-403-responses.json", {
        apiBase: API_BASE,
        authMode: AUTH_MODE,
        count: forbiddenResponses.length,
        responses: forbiddenResponses,
      });
    }

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

  test("runs the full ATS audit round and reports every finding", async ({ page }, testInfo) => {
    const audit = createAudit(testInfo);
    let authenticated = false;
    let createdCandidate = null;
    let createdJob = null;
    let testPipelineFixture = null;
    let separationFixture = null;

    await audit.runFlow(page, FLOW.dashboard, async () => {
      await openAts(page, testInfo);
      authenticated = true;
      audit.recordAction("Dashboard", "QA login/authenticated shell", "tested", `Auth mode: ${AUTH_MODE}`);
      await audit.check(page, FLOW.dashboard, "Dashboard title did not prove the authenticated app loaded.", async () => {
        await expect(page.locator(".page-title")).toContainText(/Karm\. ATS Dashboard|Dashboard/i, { timeout: 20_000 });
      });
      await audit.check(page, FLOW.dashboard, "Operational recruiter action center did not render on the dashboard.", async () => {
        await expect(page.getByTestId("operational-dashboard-panel")).toBeVisible({ timeout: 15_000 });
        audit.recordAction("Dashboard", "Recruiter action center", "tested");
      }, {
        severity: "Medium",
      });
      for (const navId of ["dashboard", "requests", "jobs", "candidates", "pipeline", "interviews", "offers", "settings"]) {
        await audit.check(page, FLOW.dashboard, `Dashboard shell is missing required navigation item: ${navId}.`, async () => {
          await expect(page.getByTestId(`nav-${navId}`)).toBeVisible({ timeout: 10_000 });
        });
      }
    });

    await audit.runFlow(page, FLOW.navigation, async () => {
      await requireAuthenticated(() => authenticated);
      const navTargets = [
        ["dashboard", "Karm. ATS Dashboard"],
        ["requests", "Hiring Requests"],
        ["jobs", "Job Requisitions"],
        ["candidates", "Talent Database"],
        ["pipeline", "Active Hiring Pipeline"],
        ["interviews", "Interviews & Scorecards"],
        ["offers", "Offer Approvals"],
        ["settings", "Settings"],
      ];
      for (const [id, title] of navTargets) {
        await audit.check(page, FLOW.navigation, `Navigation link "${id}" did not open ${title}.`, async () => {
          await openNav(page, id, title);
          audit.recordAction("Navigation", `Open ${title}`, "tested", `nav-${id}`);
        }, {
          category: "real product bug",
          severity: "High",
        });
      }
    });

    await audit.runFlow(page, FLOW.hiringRequests, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "requests", "Hiring Requests");
      audit.recordAction("Hiring Requests", "Open page", "tested");
      await audit.check(page, FLOW.hiringRequests, "Hiring Requests approval flow did not render.", async () => {
        await expect(page.getByText(/Approval flow|Manager submits|HR reviews/i).first()).toBeVisible({ timeout: 15_000 });
      });

      const requestButton = page.getByRole("button", { name: /request new hire/i }).first();
      if (await requestButton.isVisible().catch(() => false)) {
        await audit.check(page, FLOW.hiringRequests, "Request New Hire modal did not open.", async () => {
          await clickAndExpectModal(page, requestButton, /Request New Hire/i);
          audit.recordAction("Hiring Requests", "Request New Hire button", "tested", "Opened modal without submitting production data");
          const currentModal = modal(page);
          await expect(currentModal.getByText(/Role title|Business reason/i).first()).toBeVisible({ timeout: 10_000 });
          await closeModalIfVisible(page);
        });
      } else {
        audit.addRecommendation("Hiring Requests", "Request New Hire is not visible for this QA account. Keep this intentional if only hiring managers should create requests, and document the role behavior in the report.");
      }
    });

    await audit.runFlow(page, FLOW.jobs, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "jobs", "Job Requisitions");
      audit.recordAction("Job Requisitions", "Open page", "tested");
      await audit.check(page, FLOW.jobs, "Job Requisitions search input is missing.", async () => {
        await expect(page.locator(".search-input").first()).toBeVisible({ timeout: 10_000 });
      });
      await audit.check(page, FLOW.jobs, "Job Requisitions table did not render.", async () => {
        await expect(page.locator(".table-wrap table").first()).toBeVisible({ timeout: 15_000 });
      });
      for (const label of ["Status", "Entity", "Department"]) {
        await audit.check(page, FLOW.jobs, `Job Requisitions ${label} filter is missing.`, async () => {
          await expect(page.getByText(new RegExp(`^${label}$`, "i")).first()).toBeVisible({ timeout: 10_000 });
          audit.recordAction("Job Requisitions", `${label} filter`, "tested");
        });
      }
      const recruiterFilterVisible = await page.getByText(/^Recruiter$/i).first().isVisible().catch(() => false);
      if (!recruiterFilterVisible) {
        audit.addRecommendation("Job Requisitions", "Add a Recruiter filter next to Status, Entity, and Department so admins can review workload by recruiter.");
      }
    });

    await audit.runFlow(page, FLOW.jobActions, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "jobs", "Job Requisitions");

      await audit.check(page, FLOW.jobActions, "Export Excel button did not trigger a download or remain usable.", async () => {
        const exportButton = page.getByRole("button", { name: /export excel/i }).first();
        await expect(exportButton).toBeVisible({ timeout: 10_000 });
        const download = await waitForOptionalDownload(page, () => exportButton.click(), 8_000);
        audit.recordAction("Job Requisitions", "Export Excel", download.downloaded ? "downloaded" : "clicked", download.suggestedFilename || download.error || "No browser download observed");
      }, {
        severity: "Medium",
      });

      await audit.check(page, FLOW.jobActions, "Import Manpower Plan did not open the import workflow.", async () => {
        const importButton = page.getByRole("button", { name: /import manpower plan/i }).first();
        await expect(importButton).toBeVisible({ timeout: 10_000 });
        await importButton.click();
        audit.recordAction("Job Requisitions", "Import Manpower Plan", "tested", "Opened upload/review workflow");
        await expect(page.locator(".modal, input[type='file']").first()).toBeVisible({ timeout: 10_000 });
        await closeModalIfVisible(page);
      }, {
        severity: "Medium",
      });

      await audit.check(page, FLOW.jobActions, "New Requisition could not create a TEST_ job safely.", async () => {
        const uniqueTitle = `${TEST_PREFIX}QA Requisition ${Date.now()}`;
        await page.getByRole("button", { name: /new requisition/i }).first().click();
        const currentModal = modal(page);
        await expect(currentModal.locator(".modal-title")).toContainText(/New Job Requisition/i, { timeout: 10_000 });
        await currentModal.locator("input.form-input").first().fill(uniqueTitle);
        const numberInputs = currentModal.locator('input[type="number"]');
        const numberCount = await numberInputs.count().catch(() => 0);
        if (numberCount > 0) await numberInputs.nth(0).fill("1");
        if (numberCount > 1) await numberInputs.nth(1).fill("1");
        if (numberCount > 2) await numberInputs.nth(2).fill("2");
        const description = currentModal.locator("textarea.form-textarea").first();
        if (await description.isVisible().catch(() => false)) {
          await description.fill("TEST_ QA audit requisition created by automated Playwright audit.");
        }
        const createResponsePromise = page.waitForResponse(response =>
          response.url().startsWith(`${API_BASE}/positions`) &&
          response.request().method() === "POST",
          { timeout: 30_000 },
        );
        await currentModal.getByRole("button", { name: /create requisition/i }).click();
        const response = await createResponsePromise;
        const result = await readApiResponse(response);
        await attachJson(testInfo, "job-create-response.json", result);
        if (!response.ok()) {
          throw new Error(`TEST_ position create API failed (${response.status()}) at ${response.url()}.\n${result.raw || "No response body"}`);
        }
        createdJob = { title: uniqueTitle, apiStatus: response.status() };
        audit.recordAction("Job Requisitions", "New Requisition", "tested", uniqueTitle);
        await expect(page.locator(".modal")).toHaveCount(0, { timeout: 30_000 });
      }, {
        category: "real product bug",
        severity: "High",
      });

      await openNav(page, "jobs", "Job Requisitions");
      const safeJobTitle = createdJob?.title;
      if (safeJobTitle) {
        await page.locator(".search-input").first().fill(safeJobTitle);
      }
      const safeJobRow = safeJobTitle ? await findFirstRowContaining(page, safeJobTitle) : await findFirstTestRow(page);
      if (!safeJobRow) {
        audit.addRecommendation("Job Requisitions", "No TEST_ requisition row was available, so edit/save, assign recruiter, close, and delete row actions were skipped to protect production records.");
      } else {
        const safeJobText = await safeJobRow.innerText().catch(() => "");
        if (!safeJobText.includes(TEST_PREFIX)) {
          audit.addRecommendation("Job Requisitions", "A job row was visible but did not start with TEST_, so destructive actions were skipped.");
        } else {
          await audit.check(page, FLOW.jobActions, "Edit Job / Save changes did not persist a TEST_ job update.", async () => {
            await safeJobRow.locator("td").first().click();
            const detailModal = modal(page);
            await expect(detailModal).toBeVisible({ timeout: 10_000 });
            const editButton = detailModal.getByRole("button", { name: /edit/i }).first();
            await expect(editButton).toBeVisible({ timeout: 10_000 });
            await editButton.click();
            await expect(detailModal.locator(".modal-title")).toContainText(/Edit Job/i, { timeout: 10_000 });
            const editDescription = detailModal.locator("textarea.form-textarea").first();
            if (await editDescription.isVisible().catch(() => false)) {
              await editDescription.fill(`TEST_ QA audit updated description ${Date.now()}`);
            }
            const updateResponsePromise = waitForOptionalResponse(page, response =>
              response.url().startsWith(`${API_BASE}/positions`) &&
              ["PUT", "PATCH"].includes(response.request().method()),
              30_000,
            );
            await detailModal.getByRole("button", { name: /save changes/i }).click();
            const response = await updateResponsePromise;
            if (response) {
              const result = await readApiResponse(response);
              await attachJson(testInfo, "job-update-response.json", result);
              if (!response.ok()) {
                throw new Error(`TEST_ position update API failed (${response.status()}) at ${response.url()}.\n${result.raw || "No response body"}`);
              }
            }
            audit.recordAction("Job Requisitions", "Edit / Save changes", "tested", "TEST_ row only");
            await closeModalIfVisible(page);
          }, {
            category: "real product bug",
            severity: "High",
          });

          await openNav(page, "jobs", "Job Requisitions");
          if (safeJobTitle) await page.locator(".search-input").first().fill(safeJobTitle);
          const assignRow = safeJobTitle ? await findFirstRowContaining(page, safeJobTitle) : await findFirstTestRow(page);
          await audit.check(page, FLOW.jobActions, "Assign recruiter did not complete successfully on a TEST_ requisition.", async () => {
            if (!assignRow) throw new Error("No TEST_ row available for Assign recruiter.");
            const assignButton = assignRow.getByRole("button", { name: /assign recruiter/i }).first();
            await expect(assignButton).toBeVisible({ timeout: 10_000 });
            await assignButton.click();
            const assignModal = modal(page);
            await expect(assignModal.locator(".modal-title")).toContainText(/Assign Recruiter/i, { timeout: 10_000 });
            const recruiterSelect = assignModal.locator("select.form-select").first();
            const selected = await selectFirstUsableOption(recruiterSelect);
            if (!selected) throw new Error("Assign Recruiter modal did not provide a selectable recruiter.");
            const assignResponsePromise = waitForOptionalResponse(page, response =>
              response.url().startsWith(`${API_BASE}/positions`) &&
              ["PUT", "PATCH"].includes(response.request().method()),
              30_000,
            );
            await assignModal.getByRole("button", { name: /^assign recruiter$/i }).click();
            const response = await assignResponsePromise;
            if (response) {
              const result = await readApiResponse(response);
              await attachJson(testInfo, "job-assign-recruiter-response.json", result);
              if (!response.ok()) {
                throw new Error(`Assign recruiter API failed (${response.status()}) at ${response.url()}.\n${result.raw || "No response body"}`);
              }
            }
            audit.recordAction("Job Requisitions", "Assign recruiter", "tested", `Selected ${selected.label}`);
            await closeModalIfVisible(page);
          }, {
            category: "real product bug",
            severity: "High",
          });

          await openNav(page, "jobs", "Job Requisitions");
          if (safeJobTitle) await page.locator(".search-input").first().fill(safeJobTitle);
          const deleteRow = safeJobTitle ? await findFirstRowContaining(page, safeJobTitle) : await findFirstTestRow(page);
          if (deleteRow) {
            const closeButton = deleteRow.getByRole("button", { name: /close|reopen/i }).first();
            if (await closeButton.isVisible().catch(() => false)) {
              await audit.check(page, FLOW.jobActions, "Close/Reopen TEST_ requisition action did not respond.", async () => {
                const responsePromise = waitForOptionalResponse(page, response =>
                  response.url().startsWith(`${API_BASE}/positions`) &&
                  ["PUT", "PATCH"].includes(response.request().method()),
                  20_000,
                );
                await closeButton.click();
                const response = await responsePromise;
                if (response) {
                  const result = await readApiResponse(response);
                  await attachJson(testInfo, "job-close-reopen-response.json", result);
                  if (!response.ok()) {
                    throw new Error(`Close/Reopen API failed (${response.status()}) at ${response.url()}.\n${result.raw || "No response body"}`);
                  }
                }
                audit.recordAction("Job Requisitions", "Close/Reopen", "tested", "TEST_ row only");
              }, {
                severity: "Medium",
              });
            } else {
              audit.recordAction("Job Requisitions", "Close/Reopen", "not available", "No Close/Reopen button available for the current TEST_ row state");
              audit.addRecommendation("Job Requisitions", "No Close/Reopen button was available for the current TEST_ requisition state. If this is expected, show a disabled action or state-specific reason so admins and QA can understand why the action is unavailable.");
            }

            await openNav(page, "jobs", "Job Requisitions");
            if (safeJobTitle) await page.locator(".search-input").first().fill(safeJobTitle);
            const destructiveRow = safeJobTitle ? await findFirstRowContaining(page, safeJobTitle) : await findFirstTestRow(page);
            await audit.check(page, FLOW.jobActions, "Delete TEST_ requisition action did not respond safely.", async () => {
              if (!destructiveRow) throw new Error("No TEST_ row available for Delete.");
              const deleteButton = destructiveRow.getByRole("button", { name: /^delete$/i }).first();
              await expect(deleteButton).toBeVisible({ timeout: 10_000 });
              page.once("dialog", dialog => dialog.accept());
              const responsePromise = waitForOptionalResponse(page, response =>
                response.url().startsWith(`${API_BASE}/positions`) &&
                response.request().method() === "DELETE",
                20_000,
              );
              await deleteButton.click();
              const response = await responsePromise;
              if (response) {
                const result = await readApiResponse(response);
                await attachJson(testInfo, "job-delete-response.json", result);
                if (!response.ok()) {
                  throw new Error(`Delete TEST_ position API failed (${response.status()}) at ${response.url()}.\n${result.raw || "No response body"}`);
                }
              }
              audit.recordAction("Job Requisitions", "Delete", "tested", "TEST_ row only");
            }, {
              severity: "Medium",
            });
          }
        }
      }
    });

    await audit.runFlow(page, FLOW.candidateCreate, async () => {
      await requireAuthenticated(() => authenticated);
      const unique = `${TEST_PREFIX}QA Candidate ${Date.now()}`;
      const email = `test.qa.${Date.now()}@example.com`;
      if (!unique.startsWith(TEST_PREFIX)) {
        throw new Error(`QA-created records must use the configured ${TEST_PREFIX} prefix.`);
      }

      await openNav(page, "candidates", "Talent Database");
      await audit.check(page, FLOW.candidateCreate, "Resume intelligence panel did not render in Talent Database.", async () => {
        await expect(page.getByTestId("resume-intelligence-panel")).toBeVisible({ timeout: 15_000 });
        audit.recordAction("Talent Database", "Resume intelligence panel", "tested");
      }, {
        severity: "Medium",
      });
      await page.getByTestId("open-add-candidate").click();
      audit.recordAction("Talent Database", "Add Candidate button", "tested");
      await expect(page.locator(".modal-title"), "Add Candidate modal should open").toContainText("Add Candidate", { timeout: 10_000 });

      await page.getByTestId("candidate-name-input").fill(unique);
      await page.getByTestId("candidate-email-input").fill(email);
      await page.getByTestId("candidate-source-select").selectOption({ label: "Direct Application" });
      await page.getByTestId("candidate-job-select").selectOption("");

      const createResponsePromise = page.waitForResponse(response =>
        response.url().startsWith(`${API_BASE}/candidates`) &&
        response.request().method() === "POST",
        { timeout: 30_000 },
      ).catch(error => {
        throw new Error(`Talent profile create API request was not observed after clicking Add Candidate. The UI may not be submitting, may be blocked by validation, or may be using the wrong API base URL.\n${error.message}`);
      });

      await page.getByTestId("submit-add-candidate").click();
      const createResponse = await createResponsePromise;
      const createResult = await readApiResponse(createResponse);
      await attachJson(testInfo, "candidate-create-response.json", createResult);

      if (!createResponse.ok()) {
        throw new Error(`Talent profile create API failed (${createResponse.status()}) at ${createResponse.url()}.\n${createResult.raw || "No response body"}`);
      }

      const createdCandidateData = unwrapApiData(createResult);
      createdCandidate = { id: createdCandidateData?.id, name: unique, email, apiStatus: createResponse.status() };
      audit.recordAction("Talent Database", "Create TEST_ talent profile", "tested", unique);
      await audit.check(page, FLOW.candidateCreate, "Add Candidate modal did not close after successful talent profile creation.", async () => {
        await expect(page.locator(".modal")).toHaveCount(0, { timeout: 30_000 });
      });
    });

    await audit.runFlow(page, FLOW.candidatePersistence, async () => {
      await requireAuthenticated(() => authenticated);
      if (!createdCandidate) {
        throw new Error("Talent profile creation did not produce a TEST_ profile to verify search and persistence.");
      }

      await openNav(page, "candidates", "Talent Database");
      await page.locator(".search-input").first().fill(createdCandidate.name);
      const testCandidateRow = page.locator("tbody tr", { hasText: createdCandidate.name });
      await expect(testCandidateRow, "New TEST_ talent profile should appear in Talent Database").toBeVisible({ timeout: 30_000 });
      await audit.check(page, FLOW.candidatePersistence, "New TEST_ talent profile email does not match submitted email.", async () => {
        await expect(testCandidateRow).toContainText(createdCandidate.email);
      });
      await audit.check(page, FLOW.candidatePersistence, "Talent profile created without a production job should have zero active applications.", async () => {
        await expect(testCandidateRow.locator("td").nth(4)).toHaveText("0");
      });

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAtsShell(page, "after reloading to prove TEST_ talent profile persistence");
      await openNav(page, "candidates", "Talent Database");
      await page.locator(".search-input").first().fill(createdCandidate.name);
      const persistedCandidateRow = page.locator("tbody tr", { hasText: createdCandidate.name });
      await expect(persistedCandidateRow, "New TEST_ talent profile should still be searchable after page reload").toBeVisible({ timeout: 30_000 });
      await audit.check(page, FLOW.candidatePersistence, "Persisted TEST_ talent profile email no longer matches after reload.", async () => {
        await expect(persistedCandidateRow).toContainText(createdCandidate.email);
      });
      await audit.check(page, FLOW.candidatePersistence, "Persisted TEST_ talent profile active-application count changed after reload.", async () => {
        await expect(persistedCandidateRow.locator("td").nth(4)).toHaveText("0");
      });
      await testInfo.attach("candidate-persistence-check.txt", {
        body: `Created and reloaded TEST_ talent profile:\nname=${createdCandidate.name}\nemail=${createdCandidate.email}\napiStatus=${createdCandidate.apiStatus}\n`,
        contentType: "text/plain",
      });
      audit.recordAction("Talent Database", "Search/reload persistence", "tested", createdCandidate.name);
    });

    await audit.runFlow(page, FLOW.talentApplicationSeparation, async () => {
      await requireAuthenticated(() => authenticated);
      if (!createdCandidate?.id) {
        throw new Error("Talent profile creation did not return an id, so QA could not prove profile/application separation.");
      }

      separationFixture = await ensureTestPipelineFixture(page, testInfo, audit, createdCandidate, {
        artifactPrefix: "qa-separation",
        title: `QA Separation Role ${Date.now()}`,
        moveStage: false,
        moduleName: "Talent Database / Active Hiring Pipeline",
      });
      if (!separationFixture?.application?.id) {
        throw new Error("Could not create a TEST_ application fixture for separation validation.");
      }

      const rejectResponse = await qaApiRequest(page, "POST", `/applications/${separationFixture.application.id}/disqualify`, {
        reason: "TEST_ QA separation check: reject one requisition application only.",
      });
      await attachJson(testInfo, "qa-separation-application-reject-response.json", rejectResponse.result);
      if (!rejectResponse.response.ok()) {
        throw new Error(`Rejecting one TEST_ application failed (${rejectResponse.result.status}) at ${rejectResponse.result.url}.\n${rejectResponse.result.raw || "No response body"}`);
      }
      audit.recordAction("Talent Database / Active Hiring Pipeline", "Reject one TEST_ application only", "tested", `${createdCandidate.name} -> ${separationFixture.position.title}`);

      await openNav(page, "candidates", "Talent Database");
      await page.locator(".search-input").first().fill(createdCandidate.name);
      const row = page.locator("tbody tr", { hasText: createdCandidate.name });
      await expect(row, "Talent profile should remain after rejecting one requisition application").toBeVisible({ timeout: 30_000 });
      await expect(row).toContainText(createdCandidate.email);
      audit.recordAction("Talent Database / Active Hiring Pipeline", "Talent profile remains centralized", "tested", createdCandidate.name);
    });

    await audit.runFlow(page, FLOW.candidateActions, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "candidates", "Talent Database");

      await audit.check(page, FLOW.candidateActions, "Candidate Export Excel button did not trigger a download or remain usable.", async () => {
        const exportButton = page.getByRole("button", { name: /export excel/i }).first();
        await expect(exportButton).toBeVisible({ timeout: 10_000 });
        const download = await waitForOptionalDownload(page, () => exportButton.click(), 8_000);
        audit.recordAction("Talent Database", "Export Excel", download.downloaded ? "downloaded" : "clicked", download.suggestedFilename || download.error || "No browser download observed");
      }, {
        severity: "Medium",
      });

      for (const label of ["Position", "Department", "Source", "Stage"]) {
        await audit.check(page, FLOW.candidateActions, `Candidate ${label} filter is missing.`, async () => {
          await expect(page.getByText(new RegExp(`^${label}$`, "i")).first()).toBeVisible({ timeout: 10_000 });
          audit.recordAction("Talent Database", `${label} filter`, "tested");
        });
      }

      await audit.check(page, FLOW.candidateActions, "Add Candidate validation did not keep an empty required form open.", async () => {
        await page.getByTestId("open-add-candidate").click();
        const currentModal = modal(page);
        await expect(currentModal.locator(".modal-title")).toContainText(/Add Candidate/i, { timeout: 10_000 });
        await page.getByTestId("submit-add-candidate").click();
        await expect(currentModal, "Add Candidate modal should remain open when required name/email are empty").toBeVisible({ timeout: 5_000 });
        audit.recordAction("Talent Database", "Required-field validation", "tested", "Empty Add Candidate form stayed open");
        await closeModalIfVisible(page);
      }, {
        severity: "Medium",
      });

      await audit.check(page, FLOW.candidateActions, "Referral source did not require a referred-by field.", async () => {
        await page.getByTestId("open-add-candidate").click();
        const currentModal = modal(page);
        await page.getByTestId("candidate-source-select").selectOption({ label: "Referral" });
        await expect(currentModal.getByText(/Referred by/i)).toBeVisible({ timeout: 10_000 });
        const submitButton = page.getByTestId("submit-add-candidate");
        await expect(submitButton).toBeDisabled();
        audit.recordAction("Talent Database", "Referral referred-by validation", "tested");
        await closeModalIfVisible(page);
      }, {
        severity: "Medium",
      });

      await openNav(page, "candidates", "Talent Database");
      const profileCandidate = createdCandidate?.name || TEST_PREFIX;
      await page.locator(".search-input").first().fill(profileCandidate);
      const profileRow = createdCandidate ? await findFirstRowContaining(page, createdCandidate.name) : await findFirstTestRow(page);
      if (profileRow) {
        await audit.check(page, FLOW.candidateActions, "Candidate profile opened with an automatic CV download.", async () => {
          const downloadPromise = page.waitForEvent("download", { timeout: 5_000 }).then(download => download.suggestedFilename()).catch(() => null);
          await profileRow.getByRole("button", { name: /view/i }).first().click();
          await expect(modal(page)).toBeVisible({ timeout: 10_000 });
          const downloadedFile = await downloadPromise;
          if (downloadedFile) {
            throw new Error(`Opening candidate profile automatically downloaded ${downloadedFile}. Users should choose View CV or Download CV manually.`);
          }
          audit.recordAction("Talent Database", "View candidate profile", "tested", "No automatic CV download observed");
          await closeModalIfVisible(page);
        }, {
          category: "real product bug",
          severity: "High",
          suggestedFix: "Ensure candidate profile rendering never points an iframe/link at a direct-download URL until the user explicitly clicks Download CV.",
          uxRecommendation: "Show View CV and Download CV as separate user-controlled actions.",
        });
      } else {
        audit.addRecommendation("Talent Database", "No TEST_ talent profile row was available for profile/open/delete checks. Keep test data creation healthy so QA can inspect talent profiles without touching real records.");
      }

      await openNav(page, "candidates", "Talent Database");
      const deleteCandidateRow = createdCandidate ? await findFirstRowContaining(page, createdCandidate.name) : await findFirstTestRow(page);
      if (deleteCandidateRow) {
        const deleteButton = deleteCandidateRow.getByRole("button", { name: /^delete$/i }).first();
        if (await deleteButton.isVisible().catch(() => false)) {
          audit.recordAction("Talent Database", "Candidate delete button", "available", "Delete action exists on TEST_ row; not executed so later QA flows can reuse the record");
        } else {
          audit.addRecommendation("Talent Database", "Admins need a small Delete action for bad TEST_ talent-profile uploads and mistaken records, with confirmation and audit logging.");
        }
      }
    });

    await audit.runFlow(page, FLOW.pipeline, async () => {
      await requireAuthenticated(() => authenticated);
      if (!testPipelineFixture && createdCandidate?.id) {
        testPipelineFixture = await ensureTestPipelineFixture(page, testInfo, audit, createdCandidate);
      }
      await openNav(page, "pipeline", "Active Hiring Pipeline");
      audit.recordAction("Active Hiring Pipeline", "Open page", "tested");
      await audit.check(page, FLOW.pipeline, "Recruiter workbench panel did not render in the Active Hiring Pipeline.", async () => {
        await expect(page.getByTestId("recruiter-workbench-panel")).toBeVisible({ timeout: 15_000 });
        audit.recordAction("Active Hiring Pipeline", "Recruiter workbench panel", "tested");
      }, {
        severity: "Medium",
      });
      await audit.check(page, FLOW.pipeline, "Active Hiring Pipeline kanban board did not render.", async () => {
        await expect(page.locator(".kanban")).toBeVisible({ timeout: 15_000 });
      });
      await audit.check(page, FLOW.pipeline, "Active Hiring Pipeline search input is missing.", async () => {
        await expect(page.locator(".search-input").first()).toBeVisible({ timeout: 10_000 });
      });
      const delayedSummary = page.getByText(/applications delayed|delayed/i).first();
      if (await delayedSummary.isVisible().catch(() => false)) {
        audit.recordAction("Active Hiring Pipeline", "Stuck applications summary", "tested", normalizeText(await delayedSummary.innerText().catch(() => "")));
      } else {
        audit.addRecommendation("Active Hiring Pipeline", "Add or keep a visible stuck-applications summary so recruiters can immediately focus on delayed applications.");
      }
      await audit.check(page, FLOW.pipeline, "Upload CVs button did not open the CV upload workflow.", async () => {
        const uploadButton = page.getByRole("button", { name: /upload cvs/i }).first();
        await expect(uploadButton).toBeVisible({ timeout: 10_000 });
        await uploadButton.click();
        audit.recordAction("Active Hiring Pipeline", "Upload CVs", "tested", "Opened upload workflow");
        await expect(page.locator(".modal, input[type='file']").first()).toBeVisible({ timeout: 10_000 });
        await closeModalIfVisible(page);
      }, {
        severity: "Medium",
      });

      const testCard = page.locator(".kanban-card", { hasText: TEST_PREFIX }).first();
      if (await testCard.isVisible().catch(() => false)) {
        for (const action of ["View Candidate", "Move", "Shortlist", "Reject"]) {
          await audit.check(page, FLOW.pipeline, `Active Hiring Pipeline TEST_ card is missing quick action: ${action}.`, async () => {
            await expect(testCard.getByRole("button", { name: new RegExp(action, "i") }).first()).toBeVisible({ timeout: 10_000 });
            audit.recordAction("Active Hiring Pipeline", `${action} quick action`, "tested", "TEST_ card only");
          }, {
            severity: "Medium",
          });
        }
      } else if (testPipelineFixture) {
        throw new Error(`TEST_ active hiring pipeline fixture was created for ${testPipelineFixture.candidate.name}, but no TEST_ kanban card was visible.`);
      } else {
        audit.addRecommendation("Active Hiring Pipeline", "No TEST_ active hiring pipeline card was available, so card quick actions and bulk actions were inspected only at page level. Add a dedicated TEST_ application fixture for richer pipeline QA.");
      }
    });

    await audit.runFlow(page, FLOW.interviews, async () => {
      await requireAuthenticated(() => authenticated);
      if (!testPipelineFixture && createdCandidate?.id) {
        testPipelineFixture = await ensureTestPipelineFixture(page, testInfo, audit, createdCandidate);
      }
      await openNav(page, "interviews", "Interviews & Scorecards");
      audit.recordAction("Interviews", "Open page", "tested");
      await audit.check(page, FLOW.interviews, "Hiring manager workspace panel did not render on Interviews & Scorecards.", async () => {
        await expect(page.getByTestId("hiring-manager-workspace-panel")).toBeVisible({ timeout: 15_000 });
        audit.recordAction("Interviews", "Hiring manager workspace panel", "tested");
      }, {
        severity: "Medium",
      });
      for (const tab of ["Scheduled", "Completed"]) {
        await audit.check(page, FLOW.interviews, `Interview ${tab} tab is missing.`, async () => {
          await expect(page.getByText(new RegExp(tab, "i")).first()).toBeVisible({ timeout: 10_000 });
          audit.recordAction("Interviews", `${tab} tab`, "tested");
        }, {
          severity: "Medium",
        });
      }
      const scheduleButton = page.getByRole("button", { name: /schedule interview/i });
      await expect(scheduleButton, "Schedule Interview action should be visible for QA admin").toBeVisible({ timeout: 10_000 });
      await scheduleButton.click();
      const modal = page.locator(".modal").last();
      await expect(modal.locator(".modal-title"), "Schedule Interview modal should open").toContainText("Schedule Interview", { timeout: 10_000 });

      const candidateSelect = modal.locator("select.form-select").first();
      const optionTexts = await candidateSelect.locator("option").allTextContents().catch(() => []);
      const testOption = optionTexts.find(text => text.includes(TEST_PREFIX));
      if (!testOption) {
        if (testPipelineFixture) {
          throw new Error(`A TEST_ active hiring pipeline fixture exists (${testPipelineFixture.candidate.name}) but Schedule Interview did not offer any TEST_ application.`);
        }
        audit.addRecommendation("Interviews", `No eligible ${TEST_PREFIX} application was available in Schedule Interview, so the QA agent opened and inspected the modal but did not submit an interview against a production application.`);
        await closeModalIfVisible(page);
        return;
      }

      await candidateSelect.selectOption({ label: testOption });
      const interviewerSelect = modal.locator("select.form-select").last();
      const interviewerValue = await interviewerSelect.inputValue().catch(() => "");
      if (!interviewerValue) {
        throw new Error("Schedule Interview showed an interviewer dropdown, but no interviewerId/value was selected.");
      }
      const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
      await modal.locator('input[type="datetime-local"]').fill(scheduledAt);

      const interviewResponsePromise = page.waitForResponse(response =>
        response.url().startsWith(`${API_BASE}/interviews`) &&
        response.request().method() === "POST",
        { timeout: 30_000 },
      ).catch(error => {
        throw new Error(`Interview schedule API request was not observed after clicking Schedule Interview.\n${error.message}`);
      });
      await modal.getByRole("button", { name: /^schedule interview$/i }).click();
      const interviewResponse = await interviewResponsePromise;
      const interviewResult = await readApiResponse(interviewResponse);
      await attachJson(testInfo, "interview-schedule-response.json", interviewResult);
      if (!interviewResponse.ok()) {
        throw new Error(`Interview schedule API failed (${interviewResponse.status()}) at ${interviewResponse.url()}.\n${interviewResult.raw || "No response body"}`);
      }
      audit.recordAction("Interviews", "Schedule Interview", "tested", testOption);
    });

    await audit.runFlow(page, FLOW.offers, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "offers", "Offer Approvals");
      audit.recordAction("Offers", "Open page", "tested");
      await audit.check(page, FLOW.offers, "Offer table or empty state did not render.", async () => {
        await expect(page.locator(".card").first()).toBeVisible({ timeout: 15_000 });
      });
      const createOfferButton = page.getByRole("button", { name: /create offer/i }).first();
      if (await createOfferButton.isVisible().catch(() => false)) {
        await audit.check(page, FLOW.offers, "Create Offer modal did not open.", async () => {
          await createOfferButton.click();
          await expect(modal(page).locator(".modal-title")).toContainText(/Create Offer/i, { timeout: 10_000 });
          audit.recordAction("Offers", "Create Offer button", "tested", "Opened modal without submitting offer");
          await closeModalIfVisible(page);
        }, {
          severity: "Medium",
        });
      } else {
        audit.addRecommendation("Offers", "Create Offer was not visible to the QA account. If admin can approve but not create offers by policy, keep this intentional and document the role behavior.");
      }
    });

    await audit.runFlow(page, FLOW.permissions, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "settings", "Settings");
      audit.recordAction("Settings", "Open page", "tested");
      await audit.check(page, FLOW.permissions, "Settings users area did not render for QA admin.", async () => {
        await expect(page.getByText(/All team members|Role assignments/i).first()).toBeVisible({ timeout: 15_000 });
      });
      for (const tab of ["Users", "Permissions", "Approvals", "Audit", "Product Audit", "Templates", "Automation", "Security", "Roadmap", "Stages", "Entities"]) {
        await audit.check(page, FLOW.permissions, `Settings ${tab} tab did not open.`, async () => {
          const tabLocator = page.getByText(new RegExp(`^${tab}$`, "i")).first();
          await expect(tabLocator).toBeVisible({ timeout: 10_000 });
          await tabLocator.click();
          audit.recordAction("Settings", `${tab} tab`, "tested");
        }, {
          severity: "Medium",
        });
      }
      const settingsPanels = [
        ["Product Audit", "product-audit-page"],
        ["Templates", "communication-templates-panel"],
        ["Automation", "automation-preferences-panel"],
        ["Security", "audit-security-panel"],
        ["Roadmap", "enterprise-roadmap-panel"],
      ];
      for (const [tab, testId] of settingsPanels) {
        await audit.check(page, FLOW.permissions, `Settings ${tab} panel did not render its enterprise-readiness content.`, async () => {
          await page.getByText(new RegExp(`^${tab}$`, "i")).first().click();
          await expect(page.getByTestId(testId)).toBeVisible({ timeout: 15_000 });
          audit.recordAction("Settings", `${tab} enterprise panel`, "tested", testId);
        }, {
          severity: "Medium",
        });
      }
      await page.getByText(/^Users$/i).first().click().catch(() => {});
      const addUserButton = page.getByRole("button", { name: /add user/i }).first();
      if (await addUserButton.isVisible().catch(() => false)) {
        await audit.check(page, FLOW.permissions, "Add User modal did not open.", async () => {
          await addUserButton.click();
          await expect(modal(page).locator(".modal-title")).toContainText(/Add(?: ATS)? User/i, { timeout: 10_000 });
          audit.recordAction("Settings", "Add User button", "tested", "Opened modal without saving");
          await closeModalIfVisible(page);
        }, {
          severity: "Medium",
        });
      }
      const userRow = page.locator("tbody tr").first();
      if (await userRow.isVisible().catch(() => false)) {
        const editable = await userRow.locator("button, select").count().catch(() => 0);
        if (editable === 0) {
          audit.addRecommendation("Settings/RBAC", "All team members rows show roles and permissions but do not expose an obvious Edit action. Add an Edit User control so admins can change role, access scope, department, salary, offers, and requisition permissions.");
        } else {
          audit.recordAction("Settings", "User row edit controls", "available", `${editable} controls found in first user row`);
        }
      }
    });

    await audit.runFlow(page, FLOW.mobile, async () => {
      await requireAuthenticated(() => authenticated);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAtsShell(page, "after mobile viewport reload");
      await audit.check(page, FLOW.mobile, "Mobile viewport did not show the authenticated dashboard title.", async () => {
        await expect(page.locator(".page-title")).toBeVisible({ timeout: 20_000 });
      }, {
        severity: "Medium",
      });
      await audit.check(page, FLOW.mobile, "Mobile viewport did not keep navigation or logout accessible.", async () => {
        await expect(page.locator(".sidebar-nav, .sidebar-user").first()).toBeVisible({ timeout: 10_000 });
      }, {
        severity: "Medium",
      });
      audit.recordAction("Responsive UX", "Mobile viewport reload", "tested", "390x844");
      await page.setViewportSize({ width: 1280, height: 900 });
    });

    const forbiddenResponses = forbiddenResponsesByTest.get(testInfo) || [];
    const forbiddenResponsePromises = forbiddenResponsePromisesByTest.get(testInfo) || [];
    await Promise.allSettled(forbiddenResponsePromises);
    if (forbiddenResponses.length > 0) {
      await audit.addBug(page, FLOW.permissions, new Error(`Unexpected 403 API responses observed:\n${JSON.stringify(forbiddenResponses, null, 2)}`), {
        category: "real product bug",
        severity: "High",
        bug: `The QA admin session received ${forbiddenResponses.length} forbidden backend response(s).`,
        suggestedFix: "Review http-403-responses.json for the exact method and endpoint. Admin QA should not hit forbidden routes during the full audit unless the frontend is calling routes it should hide.",
        uxRecommendation: "Handle permission errors gracefully and avoid calling restricted endpoints for users who cannot access them.",
        evidence: forbiddenResponses,
      });
    }

    const report = await audit.attachReport();
    if (report.bugs.length > 0) {
      throw new Error(`Full ATS audit completed with ${report.bugs.length} finding(s). See qa-full-audit-report.md and qa-full-audit-report.json for the complete prioritized bug list.`);
    }
  });
});
