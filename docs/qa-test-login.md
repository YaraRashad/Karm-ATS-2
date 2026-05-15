# Temporary QA Test Login

This login path is for Playwright QA automation only. Microsoft 365 remains the only login path for real users.

## How It Works

- Backend route: `POST /api/v1/auth/qa-login`
- Hidden unless `QA_TEST_LOGIN_ENABLED=true` is set in the backend Azure App Service.
- Requires header `x-qa-login-secret` matching `QA_TEST_LOGIN_SECRET`.
- Creates or reuses one dedicated QA user only.
- Forces the QA user to a limited `recruiter` role:
  - `accessScope: recruitment_data`
  - `canViewSalary: false`
  - `canApproveOffers: false`
  - `canApproveRequisitions: false`
- The Playwright suite must only create/touch records using the configured `TEST_` prefix.

## Backend Azure App Service Settings

Set these only while QA automation needs the bypass:

```text
QA_TEST_LOGIN_ENABLED=true
QA_TEST_LOGIN_SECRET=<long-random-secret>
QA_TEST_USER_EMAIL=ats.qa@karmsolar.com
QA_TEST_USER_NAME=ATS QA
```

`QA_TEST_USER_EMAIL` must be a dedicated QA/test account. The backend rejects non-test-looking emails to avoid changing a real user's role.

## GitHub Actions Secrets

Set these in GitHub repo secrets:

```text
ATS_API_BASE_URL=https://karm-ats-api-g4dzhfe3buagc7e2.centralus-01.azurewebsites.net/api/v1
ATS_QA_LOGIN_ENABLED=true
ATS_QA_LOGIN_SECRET=<same value as QA_TEST_LOGIN_SECRET>
```

Microsoft login secrets can remain configured as fallback:

```text
ATS_TEST_EMAIL=<Microsoft QA user email>
ATS_TEST_PASSWORD=<Microsoft QA user password>
```

## How To Disable After Testing

1. In backend Azure App Service settings, set `QA_TEST_LOGIN_ENABLED=false` or remove it.
2. Remove `QA_TEST_LOGIN_SECRET`.
3. Restart the backend App Service.
4. In GitHub repo secrets, set `ATS_QA_LOGIN_ENABLED=false` or remove it.
5. Keep Microsoft login and normal RBAC enabled for production users.

Disabling the flag makes `/api/v1/auth/qa-login` return `404`, so the bypass is not exposed.
