import fs from "node:fs";
import path from "node:path";

const resultsPath = path.resolve("test-results/results.json");
const outputDir = path.resolve("test-results");
const markdownPath = path.join(outputDir, "qa-bug-summary.md");
const jsonPath = path.join(outputDir, "qa-bug-summary.json");

function parseBooleanFlag(value) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function resolveAuthMode() {
  const configured = String(process.env.ATS_AUTH_MODE || "").trim().toLowerCase();
  if (["qa", "qa-login", "test", "test-login"].includes(configured)) return "qa-login";
  if (["microsoft", "microsoft-login", "msal"].includes(configured)) return "microsoft-login";
  return parseBooleanFlag(process.env.ATS_QA_LOGIN_ENABLED) ? "qa-login" : "microsoft-login";
}

function getAuthConfigSummary() {
  return {
    authMode: resolveAuthMode(),
    qaLoginEnabled: parseBooleanFlag(process.env.ATS_QA_LOGIN_ENABLED),
    qaLoginEnabledRaw: process.env.ATS_QA_LOGIN_ENABLED || "",
    apiBaseConfigured: !!process.env.ATS_API_BASE_URL,
    qaLoginSecretConfigured: !!process.env.ATS_QA_LOGIN_SECRET,
    microsoftEmailConfigured: !!process.env.ATS_TEST_EMAIL,
    microsoftPasswordConfigured: !!process.env.ATS_TEST_PASSWORD,
  };
}

function ensureOutputDir() {
  fs.mkdirSync(outputDir, { recursive: true });
}

function readResults() {
  if (!fs.existsSync(resultsPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(resultsPath, "utf8"));
}

function resolveAttachmentPath(attachmentPath) {
  if (!attachmentPath) return null;
  if (fs.existsSync(attachmentPath)) return attachmentPath;

  const marker = `${path.sep}test-results${path.sep}`;
  const index = attachmentPath.indexOf(marker);
  if (index === -1) return null;

  const localPath = path.join(outputDir, attachmentPath.slice(index + marker.length));
  return fs.existsSync(localPath) ? localPath : null;
}

function readAttachmentText(attachments = []) {
  const usefulAttachments = attachments.filter(attachment =>
    /auth-mode|browser-events|current-page-state|error-context|qa-login-response|qa-login-session|http-403-responses|candidate-create-response|candidate-persistence/i.test(attachment.name || attachment.path || ""),
  );

  return usefulAttachments.map(attachment => {
    let text = "";
    if (attachment.body) {
      text = Buffer.from(attachment.body, "base64").toString("utf8");
    } else {
      const localPath = resolveAttachmentPath(attachment.path);
      if (localPath) {
        text = fs.readFileSync(localPath, "utf8");
      }
    }

    if (!text.trim()) return "";
    return `Attachment ${attachment.name || path.basename(attachment.path)}:\n${text.trim().slice(0, 6_000)}`;
  }).filter(Boolean).join("\n\n");
}

function flattenSpecs(suite, titlePath = []) {
  const rows = [];
  const nextTitlePath = suite.title ? [...titlePath, suite.title] : titlePath;
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const results = test.results || [];
      const finalResult = results[results.length - 1] || {};
      const attachments = finalResult.attachments || [];
      rows.push({
        titlePath: [...nextTitlePath, spec.title].filter(Boolean),
        projectName: test.projectName,
        location: spec.file ? `${spec.file}:${spec.line}:${spec.column}` : "",
        expectedStatus: test.expectedStatus,
        outcome: test.status,
        status: finalResult.status || test.status || "unknown",
        retry: finalResult.retry || 0,
        duration: finalResult.duration || 0,
        errors: finalResult.errors || [],
        error: finalResult.error,
        attachments,
        attachmentText: readAttachmentText(attachments),
        attempts: results.map(result => ({
          status: result.status,
          retry: result.retry,
          duration: result.duration,
          error: result.error?.message || result.errors?.[0]?.message || "",
        })),
      });
    }
  }
  for (const child of suite.suites || []) {
    rows.push(...flattenSpecs(child, nextTitlePath));
  }
  return rows;
}

function titleIncludes(row, pattern) {
  return row.titlePath.join(" ").toLowerCase().includes(pattern);
}

function classifyFailure(row) {
  const title = row.titlePath.join(" > ");
  const errorText = [
    row.error?.message,
    row.error?.stack,
    ...row.errors.map(error => error?.message || error?.stack || ""),
    row.attachmentText,
  ].filter(Boolean).join("\n");
  const normalized = `${title}\n${errorText}`.toLowerCase();

  if (normalized.includes("qa login was requested") && normalized.includes("ats_qa_login_secret is missing")) {
    return {
      severity: "Critical",
      bug: "Temporary QA login was requested, but the GitHub Actions QA login secret was missing.",
      suggestedFix: "Add ATS_QA_LOGIN_SECRET as a GitHub Actions secret, confirm it matches QA_TEST_LOGIN_SECRET in the backend App Service, then rerun the QA workflow.",
      uxRecommendation: "Fail fast with the configured auth mode and missing secret status so QA setup issues are not reported as Microsoft login product bugs.",
    };
  }
  if (normalized.includes("qa test login failed") || normalized.includes("/auth/qa-login")) {
    return {
      severity: "Critical",
      bug: "Temporary QA login did not create an authenticated ATS session.",
      suggestedFix: "Confirm QA_TEST_LOGIN_ENABLED and QA_TEST_LOGIN_SECRET are set in the backend App Service, ATS_QA_LOGIN_SECRET matches in GitHub Actions, and ATS_API_BASE_URL points to the live backend /api/v1 base URL.",
      uxRecommendation: "Keep QA login failures separate from Microsoft login failures in the report so product bugs are not mixed with test-environment setup issues.",
    };
  }
  if (normalized.includes("/auth/me rejected") || normalized.includes("qa test login returned tokens, but /auth/me rejected")) {
    return {
      severity: "Critical",
      bug: "Temporary QA login returned tokens, but the ATS backend rejected the authenticated session.",
      suggestedFix: "Check JWT_SECRET consistency on the backend, confirm the QA login endpoint and /auth/me are served by the same deployed backend, and verify the workflow ATS_API_BASE_URL points to the live /api/v1 backend.",
      uxRecommendation: "Report QA login token failures separately from product-flow bugs so recruiters are not asked to retest candidate workflows until the test session is valid.",
    };
  }
  if (normalized.includes("expected the isolated qa account to be admin") || normalized.includes("returned role \"recruiter\"")) {
    return {
      severity: "Critical",
      bug: "Temporary QA login authenticated successfully but returned a non-admin QA role.",
      suggestedFix: "Deploy the latest backend QA-login code or update the isolated ats.qa@karmsolar.com test account so it returns role admin, accessScope all_data, and admin permissions only for automated QA.",
      uxRecommendation: "Keep auth setup failures separate from ATS product bugs and show the returned QA user role in every report.",
    };
  }
  if (normalized.includes("candidate created without assigning to a production job should have zero active apps")) {
    return {
      severity: "Medium",
      bug: "The QA test created a TEST_ candidate successfully but validated the active-app count using concatenated table-row text.",
      suggestedFix: "Assert the Candidate Database Active Apps table cell directly instead of matching the whole row text, because row text can concatenate values such as source, active-app count, and current stage.",
      uxRecommendation: "Keep table columns machine-readable with stable cells/test IDs so automated QA can distinguish values that are visually separate to users.",
    };
  }
  if (normalized.includes("unexpected 403 api responses observed") || normalized.includes("http-403-responses")) {
    return {
      severity: "High",
      bug: "The authenticated ATS session received one or more 403 Forbidden responses from the live backend API.",
      suggestedFix: "Open http-403-responses.json in the Playwright artifacts to review the exact method, endpoint, and response body. Confirm whether the route should allow the QA admin account, or update the frontend to avoid unauthorized calls and handle expected 403 responses gracefully.",
      uxRecommendation: "Show role/access errors inline with the blocked action instead of only logging 403 responses in the browser console.",
    };
  }
  if (normalized.includes("enter your email, phone, or skype") || normalized.includes("email entry screen")) {
    return {
      severity: "Critical",
      bug: "Microsoft login stopped on the email entry screen before the ATS shell loaded.",
      suggestedFix: "Use a resilient Microsoft login loop that submits ATS_TEST_EMAIL, handles account picker/password/stay-signed-in screens, and reports the exact blocking auth page when it cannot continue.",
      uxRecommendation: "Attach current-page-state.txt to every QA failure so reviewers can see whether the user is on Microsoft login, ATS login, or the ATS dashboard.",
    };
  }
  if (normalized.includes("enter password") || normalized.includes("password screen")) {
    return {
      severity: "Critical",
      bug: "Microsoft login reached the password step but did not complete.",
      suggestedFix: "Verify ATS_TEST_PASSWORD, confirm the QA account supports non-interactive CI login, and make the login helper submit the password form reliably.",
      uxRecommendation: "Keep the QA account setup documented in the test report, including when MFA or passwordless login blocks automation.",
    };
  }
  if (normalized.includes("multi-factor") || normalized.includes("authenticator") || normalized.includes("verify your identity") || normalized.includes("more information required")) {
    return {
      severity: "Critical",
      bug: "Microsoft login is blocked by MFA, authenticator setup, or conditional access.",
      suggestedFix: "Use a dedicated ATS QA account with the approved CI authentication policy, or switch the QA workflow to a pre-authenticated storage state managed as a GitHub secret.",
      uxRecommendation: "Show a clear QA setup checklist for test accounts so login failures are not mistaken for ATS product defects.",
    };
  }
  if (normalized.includes("request sent") || normalized.includes("needs admin approval") || normalized.includes("admin has been notified")) {
    return {
      severity: "Critical",
      bug: "The Microsoft QA user is not assigned to or consented for the Karm. ATS application.",
      suggestedFix: "Assign the QA user to the Enterprise Application and grant tenant-wide admin consent before running live QA.",
      uxRecommendation: "Add an access-request troubleshooting note to the QA report with the exact Entra screen to review.",
    };
  }
  if (normalized.includes("login") || normalized.includes("aadsts") || normalized.includes("microsoft")) {
    return {
      severity: "Critical",
      bug: "Microsoft login or authenticated ATS shell did not load successfully.",
      suggestedFix: "Verify Azure AD redirect URI, test account access, admin consent, and that the test waits for the authenticated ATS shell instead of the login card.",
      uxRecommendation: "Show a precise login error on the ATS login screen with the failed Azure AD code and the expected support action.",
    };
  }
  if (normalized.includes("backend api") || normalized.includes("api is not reachable") || normalized.includes("load failed")) {
    return {
      severity: "Critical",
      bug: "Frontend could not reach the live backend API.",
      suggestedFix: "Check VITE_API_BASE_URL, backend App Service health, CORS_ORIGINS, and Azure App Service environment variables.",
      uxRecommendation: "Display backend connectivity status with the API URL and a retry action before allowing users to continue.",
    };
  }
  if (normalized.includes("candidate create api request was not observed")) {
    return {
      severity: "High",
      bug: "Add Candidate UI did not send a candidate-create API request.",
      suggestedFix: "Check the Add Candidate button handler, required field validation, modal state, and API base configuration. The QA test now waits for POST /candidates so UI-only failures are isolated.",
      uxRecommendation: "Show inline validation beside the blocked field instead of silently leaving the modal open.",
    };
  }
  if (normalized.includes("strict mode violation")) {
    return {
      severity: "Medium",
      bug: "The QA test matched more than one UI element, so it could not prove the product flow succeeded.",
      suggestedFix: "Use stable data-testid selectors or scope locators to the relevant page/modal before treating the result as an ATS product bug.",
      uxRecommendation: "Expose stable automation hooks on critical recruiter actions such as open modal, submit, save, and confirm.",
    };
  }
  if (normalized.includes("candidate create api failed") || normalized.includes("candidate-create-response")) {
    return {
      severity: "High",
      bug: "TEST_ candidate creation API failed.",
      suggestedFix: "Inspect candidate-create-response.json for the exact HTTP status and backend validation message. Check QA user write permissions, required candidate fields, duplicate email handling, and candidate API response handling.",
      uxRecommendation: "After a failed save, show the backend validation message directly in the Add Candidate modal.",
    };
  }
  if (normalized.includes("after reloading to prove test_ candidate persistence") || normalized.includes("candidate-persistence")) {
    return {
      severity: "High",
      bug: "TEST_ candidate was created but did not persist or reload into Candidate Database.",
      suggestedFix: "Verify the candidate was written to the production database, fetchAtsData reloads candidates after save, and the Candidate Database search includes newly created records after refresh.",
      uxRecommendation: "Show a post-save success toast and keep the new candidate visible immediately after save and refresh.",
    };
  }
  if (titleIncludes(row, "creates only a test_ candidate") || normalized.includes("candidate")) {
    return {
      severity: "High",
      bug: "TEST_ candidate creation flow failed or did not prove persistence in Candidate Database.",
      suggestedFix: "Validate Add Candidate form submission, backend candidate API response handling, permissions for the QA user, and post-save reload behavior.",
      uxRecommendation: "After saving a candidate, show a clear success message and keep the candidate searchable immediately.",
    };
  }
  if (titleIncludes(row, "opens key operational pages") || normalized.includes("navigation") || normalized.includes("page title")) {
    return {
      severity: "Medium",
      bug: "One or more operational pages did not open or expose the expected page title for the QA user.",
      suggestedFix: "Confirm RBAC visibility, page routing, and that each permitted page renders a stable title and empty/loading/error state.",
      uxRecommendation: "Use consistent page headers and explain when a page is hidden because of role permissions.",
    };
  }
  return {
    severity: "Medium",
    bug: "Playwright detected an ATS workflow failure.",
    suggestedFix: "Inspect the screenshot, trace, browser events, and error context to identify the broken selector, validation, API, or permission issue.",
    uxRecommendation: "Add clearer inline validation and success/error states so recruiters know exactly what happened.",
  };
}

function makeBug(row, index) {
  const classification = classifyFailure(row);
  const title = row.titlePath.join(" > ");
  const errorMessage = row.error?.message || row.errors[0]?.message || "No Playwright error message captured.";
  const authConfig = getAuthConfigSummary();
  const attachments = row.attachments.map(attachment => ({
    name: attachment.name,
    contentType: attachment.contentType,
    path: attachment.path,
  }));

  return {
    id: `ATS-QA-${String(index + 1).padStart(3, "0")}`,
    title,
    project: row.projectName || "unknown",
    location: row.location,
    status: row.status,
    retry: row.retry,
    durationMs: row.duration,
    bug: classification.bug,
    severity: classification.severity,
    reproductionSteps: [
      `Open the live ATS at ${process.env.ATS_BASE_URL || "the configured ATS_BASE_URL"}.`,
      authConfig.authMode === "qa-login"
        ? "Authenticate with the temporary QA test login endpoint."
        : "Sign in with the Microsoft 365 QA test account.",
      `Run the Playwright scenario: ${title}.`,
      "Review the attached screenshot/video/trace and browser-events.txt for the failed step.",
    ],
    suggestedFix: classification.suggestedFix,
    uxRecommendation: classification.uxRecommendation,
    evidence: {
      errorMessage,
      attachmentText: row.attachmentText || "",
      attachments,
    },
  };
}

function escapeMd(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function writeReports(summary) {
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);

  const lines = [
    "# ATS QA Product Agent Bug Summary",
    "",
    `- Generated: ${summary.generatedAt}`,
    `- Target: ${summary.target}`,
    `- Test prefix: ${summary.testPrefix}`,
    `- Auth mode used: ${summary.auth.authMode}`,
    `- QA login enabled flag: ${summary.auth.qaLoginEnabled ? "true" : "false"}${summary.auth.qaLoginEnabledRaw ? ` (raw: ${summary.auth.qaLoginEnabledRaw})` : ""}`,
    `- API base configured: ${summary.auth.apiBaseConfigured ? "yes" : "no"}`,
    `- QA login secret configured: ${summary.auth.qaLoginSecretConfigured ? "yes" : "no"}`,
    `- Microsoft test email configured: ${summary.auth.microsoftEmailConfigured ? "yes" : "no"}`,
    `- Microsoft test password configured: ${summary.auth.microsoftPasswordConfigured ? "yes" : "no"}`,
    `- Total tests: ${summary.totals.total ?? "unknown"}`,
    `- Passed: ${summary.totals.passed ?? "unknown"}`,
    `- Failed: ${summary.totals.failed ?? summary.bugs.length}`,
    "",
  ];

  if (summary.bugs.length === 0) {
    lines.push("## Result", "", "No bugs found in this run.", "");
  } else {
    lines.push(
      "## Bugs",
      "",
      "| ID | Severity | Bug | Suggested Fix | UX Recommendation |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const bug of summary.bugs) {
      lines.push(`| ${bug.id} | ${bug.severity} | ${escapeMd(bug.bug)} | ${escapeMd(bug.suggestedFix)} | ${escapeMd(bug.uxRecommendation)} |`);
    }
    lines.push("");
    for (const bug of summary.bugs) {
      lines.push(
        `## ${bug.id}: ${bug.severity}`,
        "",
        `**Scenario:** ${bug.title}`,
        "",
        `**Bug:** ${bug.bug}`,
        "",
        "**Reproduction Steps:**",
        ...bug.reproductionSteps.map(step => `- ${step}`),
        "",
        `**Suggested Fix:** ${bug.suggestedFix}`,
        "",
        `**UX Recommendation:** ${bug.uxRecommendation}`,
        "",
        `**Evidence:** ${bug.evidence.errorMessage}`,
        "",
      );
      if (bug.evidence.attachmentText) {
        lines.push(
          "**Failure Context:**",
          "",
          "```text",
          bug.evidence.attachmentText.slice(0, 2_000),
          "```",
          "",
        );
      }
    }
  }

  fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`);
}

ensureOutputDir();
const results = readResults();

if (!results) {
  writeReports({
    generatedAt: new Date().toISOString(),
    target: process.env.ATS_BASE_URL || "unknown",
    testPrefix: process.env.ATS_TEST_PREFIX || "TEST_",
    auth: getAuthConfigSummary(),
    totals: { total: 0, passed: 0, failed: 1 },
    bugs: [{
      id: "ATS-QA-001",
      title: "Playwright results missing",
      project: "unknown",
      location: resultsPath,
      status: "missing",
      retry: 0,
      durationMs: 0,
      bug: "Playwright did not produce test-results/results.json.",
      severity: "High",
      reproductionSteps: [
        "Run the ATS QA Product Agent workflow.",
        "Open the uploaded artifacts.",
        "Confirm test-results/results.json is missing.",
      ],
      suggestedFix: "Ensure the Playwright JSON reporter is configured and that the QA workflow runs from react-ats-preview.",
      uxRecommendation: "Keep a clear CI error when the QA report itself cannot be generated.",
      evidence: { errorMessage: "Missing results.json", attachments: [] },
    }],
  });
  console.log(`Wrote ${markdownPath}`);
  process.exit(0);
}

const rows = (results.suites || []).flatMap(suite => flattenSpecs(suite));
const failedRows = rows.filter(row => row.outcome === "unexpected" || ["failed", "timedOut", "interrupted"].includes(row.status));
const bugs = failedRows.map(makeBug);

writeReports({
  generatedAt: new Date().toISOString(),
  target: process.env.ATS_BASE_URL || "unknown",
  testPrefix: process.env.ATS_TEST_PREFIX || "TEST_",
  auth: getAuthConfigSummary(),
  totals: {
    total: rows.length,
    passed: rows.filter(row => row.status === "passed").length,
    failed: failedRows.length,
    skipped: rows.filter(row => row.status === "skipped").length,
  },
  bugs,
});

console.log(`Wrote ${markdownPath}`);
