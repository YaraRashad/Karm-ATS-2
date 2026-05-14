# ATS QA Product Agent - Phase 1

This Playwright suite tests the live ATS as a human user without resetting the database or seeding demo data.

## GitHub Secrets Required

Add these repository secrets before running the workflow:

- `ATS_TEST_EMAIL`: Microsoft 365 test user email.
- `ATS_TEST_PASSWORD`: Microsoft 365 test user password.

The test user should be a real Karm Microsoft account that already has access to Karm. ATS. For stable CI runs, avoid MFA/conditional-access prompts on this dedicated test account or the Microsoft login step will stop for manual verification.

## Manual Run

GitHub -> Actions -> `ATS QA Product Agent - Phase 1` -> `Run workflow`.

Inputs:

- `base_url`: defaults to `https://karm-ats-web.azurewebsites.net`.
- `test_prefix`: defaults to `TEST_`.

## Safety Rules

- The suite only creates records whose names start with `TEST_`.
- It does not reset the database.
- It does not run demo seed scripts.
- It does not change production environment variables.
- Screenshots, videos, traces, HTML report, JSON report, and JUnit report are uploaded as GitHub Actions artifacts after every run.
