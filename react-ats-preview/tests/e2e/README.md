# ATS QA Product Agent - Phase 1

This Playwright suite tests the live ATS as a human QA/product reviewer without resetting the database or seeding demo data.

The main live test now runs in full audit mode: each ATS flow is wrapped independently, failures are collected, and the GitHub Action only fails after the final structured report is generated.

## GitHub Secrets Required

Add these repository secrets before running the workflow:

- `ATS_QA_LOGIN_SECRET`: secret used by the temporary QA login endpoint.
- `ATS_TEST_EMAIL`: Microsoft 365 test user email, kept as fallback coverage.
- `ATS_TEST_PASSWORD`: Microsoft 365 test user password, kept as fallback coverage.

Recommended repository variables:

- `ATS_AUTH_MODE`: `qa-login`
- `ATS_QA_LOGIN_ENABLED`: `true`
- `ATS_API_BASE_URL`: live backend `/api/v1` URL.

The test user should be a real Karm Microsoft account that already has access to Karm. ATS. For stable CI runs, avoid MFA/conditional-access prompts on this dedicated test account or the Microsoft login step will stop for manual verification.

## Manual Run

GitHub -> Actions -> `ATS QA Product Agent - Phase 1` -> `Run workflow`.

Inputs:

- `base_url`: defaults to `https://karm-ats-web.azurewebsites.net`.
- `test_prefix`: defaults to `TEST_`.

## Safety Rules

- The suite only creates records whose names/titles start with `TEST_`.
- It may create a `TEST_` candidate, `TEST_` requisition, and `TEST_` application fixture so pipeline and interview flows can be tested without touching production records.
- Interview scheduling is submitted only against generated or available `TEST_` application fixtures.
- It does not reset the database.
- It does not run demo seed scripts.
- It does not change production environment variables.
- Screenshots, videos, traces, HTML report, JSON report, and JUnit report are uploaded as GitHub Actions artifacts after every run.
- `qa-full-audit-report.md/json` are attached to the Playwright test.
- `test-results/qa-bug-summary.md` and `test-results/qa-bug-summary.json` are generated after every run with category, module, bug, severity, reproduction steps, evidence, suggested fix, and UX recommendation.

## Audit Flows

- Dashboard loads.
- Job requisitions open.
- Candidate creation.
- Candidate search and persistence.
- Pipeline page opens.
- Interview scheduling flow.
- Offer page access.
- Role and permission checks.
