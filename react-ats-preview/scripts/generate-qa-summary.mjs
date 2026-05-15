import fs from "node:fs";
import path from "node:path";

const resultsPath = path.resolve("test-results/results.json");
const outputDir = path.resolve("test-results");
const markdownPath = path.join(outputDir, "qa-bug-summary.md");
const jsonPath = path.join(outputDir, "qa-bug-summary.json");

function ensureOutputDir() {
  fs.mkdirSync(outputDir, { recursive: true });
}

function readResults() {
  if (!fs.existsSync(resultsPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(resultsPath, "utf8"));
}

function flattenSpecs(suite, titlePath = []) {
  const rows = [];
  const nextTitlePath = suite.title ? [...titlePath, suite.title] : titlePath;
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const results = test.results || [];
      const finalResult = results[results.length - 1] || {};
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
        attachments: finalResult.attachments || [],
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
  ].filter(Boolean).join("\n");
  const normalized = `${title}\n${errorText}`.toLowerCase();

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
      "Sign in with the Microsoft 365 QA test account.",
      `Run the Playwright scenario: ${title}.`,
      "Review the attached screenshot/video/trace and browser-events.txt for the failed step.",
    ],
    suggestedFix: classification.suggestedFix,
    uxRecommendation: classification.uxRecommendation,
    evidence: {
      errorMessage,
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
  totals: {
    total: rows.length,
    passed: rows.filter(row => row.status === "passed").length,
    failed: failedRows.length,
    skipped: rows.filter(row => row.status === "skipped").length,
  },
  bugs,
});

console.log(`Wrote ${markdownPath}`);
