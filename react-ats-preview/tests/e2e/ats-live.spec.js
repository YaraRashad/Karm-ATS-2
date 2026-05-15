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
      ...report.recommendations.map(item => `- **${escapeMd(item.module)}:** ${escapeMd(item.recommendation)}`),
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

function createAudit(testInfo) {
  const bugs = [];
  const flows = [];
  const recommendations = [];

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

  const addRecommendation = (module, recommendation) => {
    recommendations.push({ module, recommendation });
  };

  const attachReport = async () => {
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
      flows,
      bugs,
      recommendations,
    };
    await attachJson(testInfo, "qa-full-audit-report.json", report);
    await testInfo.attach("qa-full-audit-report.md", {
      body: makeReportMarkdown(report),
      contentType: "text/markdown",
    });
    return report;
  };

  return { bugs, flows, recommendations, addBug, runFlow, check, addRecommendation, attachReport };
}

const FLOW = {
  dashboard: {
    name: "Dashboard loads",
    module: "Dashboard/Auth",
    reproductionSteps: ["Open the live ATS.", "Authenticate with the configured QA auth mode.", "Wait for the ATS shell and dashboard to load."],
    suggestedFix: "Confirm QA auth, backend health, app shell rendering, and initial dashboard data loading.",
    uxRecommendation: "Show a clear authenticated loading state and a specific backend/auth error when the dashboard cannot load.",
  },
  jobs: {
    name: "Job requisitions open",
    module: "Job Requisitions",
    reproductionSteps: ["Log in to ATS.", "Open Job Requisitions from the sidebar.", "Verify filters and actions render."],
    suggestedFix: "Check job requisition page routing, RBAC visibility, and position list API responses.",
    uxRecommendation: "Keep job filters and action buttons aligned and explain empty/error states.",
  },
  candidateCreate: {
    name: "Candidate creation",
    module: "Candidates",
    reproductionSteps: ["Open Candidate Database.", "Click Add Candidate.", "Create a candidate whose name starts with TEST_.", "Save without assigning to a production job."],
    suggestedFix: "Check Add Candidate form validation, POST /candidates response handling, and post-save modal state.",
    uxRecommendation: "Show a success toast and keep the newly created candidate searchable immediately.",
  },
  candidatePersistence: {
    name: "Candidate search and persistence",
    module: "Candidates",
    reproductionSteps: ["Search for the TEST_ candidate.", "Verify the row values.", "Reload the page.", "Search again and verify persistence."],
    suggestedFix: "Verify the candidate is written to the production database and refetched after reload.",
    uxRecommendation: "Make saved records immediately visible and searchable after refresh.",
  },
  pipeline: {
    name: "Pipeline page opens",
    module: "Pipeline",
    reproductionSteps: ["Open Candidate Pipeline.", "Verify the pipeline page renders without writing to non-TEST records."],
    suggestedFix: "Check pipeline page routing, stage rendering, and candidate API loading.",
    uxRecommendation: "Show a useful empty state when no active applications are visible.",
  },
  interviews: {
    name: "Interview scheduling flow",
    module: "Interviews",
    reproductionSteps: ["Open Interviews.", "Open Schedule Interview.", "Only submit if a TEST_ eligible candidate is available."],
    suggestedFix: "Check Schedule Interview form binding, interviewerId submission, and POST /interviews validation.",
    uxRecommendation: "Disable scheduling or show a clear message when no eligible candidate is available.",
  },
  offers: {
    name: "Offer page access",
    module: "Offers",
    reproductionSteps: ["Open Offer Approvals.", "Verify the page renders without unauthorized salary/offer data calls."],
    suggestedFix: "Check offer page RBAC, salary visibility logic, and backend offer list routes.",
    uxRecommendation: "Show masked salary/offer details unless the user has permission.",
  },
  permissions: {
    name: "Role and permission checks",
    module: "Settings/RBAC",
    reproductionSteps: ["Open Settings as the QA admin user.", "Verify user/permission controls are visible.", "Review captured 403 responses."],
    suggestedFix: "Check admin RBAC, settings page API calls, and frontend handling of forbidden routes.",
    uxRecommendation: "Make restricted actions explicit by role instead of failing silently.",
  },
};

async function closeModalIfVisible(page) {
  const modal = page.locator(".modal").last();
  if (await modal.isVisible().catch(() => false)) {
    const closeButton = modal.locator(".modal-close").first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await expect(modal).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
    }
  }
}

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

    await audit.runFlow(page, FLOW.dashboard, async () => {
      await openAts(page, testInfo);
      authenticated = true;
      await audit.check(page, FLOW.dashboard, "Dashboard title did not prove the authenticated app loaded.", async () => {
        await expect(page.locator(".page-title")).toContainText(/Karm\. ATS Dashboard|Dashboard/i, { timeout: 20_000 });
      });
      for (const navId of ["jobs", "candidates", "pipeline"]) {
        await audit.check(page, FLOW.dashboard, `Dashboard shell is missing required navigation item: ${navId}.`, async () => {
          await expect(page.getByTestId(`nav-${navId}`)).toBeVisible({ timeout: 10_000 });
        });
      }
    });

    await audit.runFlow(page, FLOW.jobs, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "jobs", "Job Requisitions");
      await audit.check(page, FLOW.jobs, "Job Requisitions search input is missing.", async () => {
        await expect(page.locator(".search-input").first()).toBeVisible({ timeout: 10_000 });
      });
      await audit.check(page, FLOW.jobs, "Job Requisitions table did not render.", async () => {
        await expect(page.locator(".table-wrap table").first()).toBeVisible({ timeout: 15_000 });
      });
    });

    await audit.runFlow(page, FLOW.candidateCreate, async () => {
      await requireAuthenticated(() => authenticated);
      const unique = `${TEST_PREFIX}QA Candidate ${Date.now()}`;
      const email = `test.qa.${Date.now()}@example.com`;
      if (!unique.startsWith(TEST_PREFIX)) {
        throw new Error(`QA-created records must use the configured ${TEST_PREFIX} prefix.`);
      }

      await openNav(page, "candidates", "Candidate Database");
      await page.getByTestId("open-add-candidate").click();
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
        throw new Error(`Candidate create API request was not observed after clicking Add Candidate. The UI may not be submitting, may be blocked by validation, or may be using the wrong API base URL.\n${error.message}`);
      });

      await page.getByTestId("submit-add-candidate").click();
      const createResponse = await createResponsePromise;
      const createResult = await readApiResponse(createResponse);
      await attachJson(testInfo, "candidate-create-response.json", createResult);

      if (!createResponse.ok()) {
        throw new Error(`Candidate create API failed (${createResponse.status()}) at ${createResponse.url()}.\n${createResult.raw || "No response body"}`);
      }

      createdCandidate = { name: unique, email, apiStatus: createResponse.status() };
      await audit.check(page, FLOW.candidateCreate, "Candidate modal did not close after successful creation.", async () => {
        await expect(page.locator(".modal")).toHaveCount(0, { timeout: 30_000 });
      });
    });

    await audit.runFlow(page, FLOW.candidatePersistence, async () => {
      await requireAuthenticated(() => authenticated);
      if (!createdCandidate) {
        throw new Error("Candidate creation did not produce a TEST_ candidate to verify search and persistence.");
      }

      await openNav(page, "candidates", "Candidate Database");
      await page.locator(".search-input").first().fill(createdCandidate.name);
      const testCandidateRow = page.locator("tbody tr", { hasText: createdCandidate.name });
      await expect(testCandidateRow, "New TEST_ candidate should appear in Candidate Database").toBeVisible({ timeout: 30_000 });
      await audit.check(page, FLOW.candidatePersistence, "New TEST_ candidate email does not match submitted email.", async () => {
        await expect(testCandidateRow).toContainText(createdCandidate.email);
      });
      await audit.check(page, FLOW.candidatePersistence, "Candidate created without a production job should have zero active apps.", async () => {
        await expect(testCandidateRow.locator("td").nth(4)).toHaveText("0");
      });

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForAtsShell(page, "after reloading to prove TEST_ candidate persistence");
      await openNav(page, "candidates", "Candidate Database");
      await page.locator(".search-input").first().fill(createdCandidate.name);
      const persistedCandidateRow = page.locator("tbody tr", { hasText: createdCandidate.name });
      await expect(persistedCandidateRow, "New TEST_ candidate should still be searchable after page reload").toBeVisible({ timeout: 30_000 });
      await audit.check(page, FLOW.candidatePersistence, "Persisted TEST_ candidate email no longer matches after reload.", async () => {
        await expect(persistedCandidateRow).toContainText(createdCandidate.email);
      });
      await audit.check(page, FLOW.candidatePersistence, "Persisted TEST_ candidate active-app count changed after reload.", async () => {
        await expect(persistedCandidateRow.locator("td").nth(4)).toHaveText("0");
      });
      await testInfo.attach("candidate-persistence-check.txt", {
        body: `Created and reloaded TEST_ candidate:\nname=${createdCandidate.name}\nemail=${createdCandidate.email}\napiStatus=${createdCandidate.apiStatus}\n`,
        contentType: "text/plain",
      });
    });

    await audit.runFlow(page, FLOW.pipeline, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "pipeline", "Candidate Pipeline");
      await audit.check(page, FLOW.pipeline, "Pipeline kanban board did not render.", async () => {
        await expect(page.locator(".kanban")).toBeVisible({ timeout: 15_000 });
      });
      await audit.check(page, FLOW.pipeline, "Pipeline search input is missing.", async () => {
        await expect(page.locator(".search-input").first()).toBeVisible({ timeout: 10_000 });
      });
    });

    await audit.runFlow(page, FLOW.interviews, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "interviews", "Interviews & Scorecards");
      const scheduleButton = page.getByRole("button", { name: /schedule interview/i });
      await expect(scheduleButton, "Schedule Interview action should be visible for QA admin").toBeVisible({ timeout: 10_000 });
      await scheduleButton.click();
      const modal = page.locator(".modal").last();
      await expect(modal.locator(".modal-title"), "Schedule Interview modal should open").toContainText("Schedule Interview", { timeout: 10_000 });

      const candidateSelect = modal.locator("select.form-select").first();
      const optionTexts = await candidateSelect.locator("option").allTextContents().catch(() => []);
      const testOption = optionTexts.find(text => text.includes(TEST_PREFIX));
      if (!testOption) {
        audit.addRecommendation("Interviews", `No eligible ${TEST_PREFIX} candidate was available in Schedule Interview, so the QA agent opened and inspected the modal but did not submit an interview against a production candidate.`);
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
    });

    await audit.runFlow(page, FLOW.offers, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "offers", "Offer Approvals");
      await audit.check(page, FLOW.offers, "Offer table or empty state did not render.", async () => {
        await expect(page.locator(".card").first()).toBeVisible({ timeout: 15_000 });
      });
    });

    await audit.runFlow(page, FLOW.permissions, async () => {
      await requireAuthenticated(() => authenticated);
      await openNav(page, "settings", "Settings");
      await audit.check(page, FLOW.permissions, "Settings users area did not render for QA admin.", async () => {
        await expect(page.getByText(/All team members|Role assignments/i).first()).toBeVisible({ timeout: 15_000 });
      });
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
