# Karm ATS Production Go-Live Checklist

This backend is being moved from demo mode to secure internal ATS mode.

## Authentication

Use Microsoft 365 / Azure AD as the identity provider.

Required environment variables:

```bash
AUTH_PROVIDER=microsoft
AUTH_AUTO_PROVISION=false
AZURE_AD_TENANT_ID=<company-tenant-id>
AZURE_AD_CLIENT_ID=<app-registration-client-id>
AZURE_AD_ALLOWED_DOMAINS=karmsolar.com
JWT_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<different-strong-random-secret>
DATABASE_URL=postgresql://...
FILE_STORAGE_DIR=/secure/private/ats-files
CORS_ORIGINS=https://ats.karmsolar.com
```

Flow:

1. Frontend signs the user in with Microsoft.
2. Frontend sends the Microsoft ID token to `POST /api/v1/auth/microsoft`.
3. Backend verifies the token against Microsoft signing keys, tenant, client ID, issuer, and company email domain.
4. Backend checks the user exists and is active in ATS.
5. Backend issues short-lived ATS access token plus refresh token.

Password login should stay disabled in production.

## Roles

Only these four ATS roles should be used:

- `admin`
- `recruiter`
- `hiring_manager`
- `interviewer`

Extra access is controlled by permission flags, not extra roles:

- `canViewSalary`
- `canApproveOffers`
- `canApproveRequisitions`
- `accessScope`
- `departmentId`
- assigned job/interview relationships

## Backend RBAC Rules

Admin:

- Full access to all ATS data and settings.
- Can view salary and offers.
- Can approve offers/requisitions if permission flags are enabled.
- Can delete records and manage users.

Recruiter:

- Owns recruitment operations.
- Can create requisitions, candidates, applications, interviews, notes, draft offers, and move candidates.
- Can see salary only if `canViewSalary=true`.
- Cannot approve offers unless explicitly granted.

Hiring Manager:

- Can see only assigned jobs/candidates or department-scoped jobs.
- Can submit feedback and recommendations.
- Can approve requisitions/offers only if permission flags allow it.
- Salary hidden unless `canViewSalary=true`.

Interviewer:

- Can see only assigned interviews and related candidates/CVs.
- Can submit scorecards and recommendations.
- Cannot see full pipeline, offers, salaries, requisitions, or settings.

## Database

Use PostgreSQL. Do not use browser `localStorage` for production data.

Production tables include:

- users
- departments
- positions
- candidates
- applications
- interviews
- scorecards
- offers
- application notes
- file objects
- audit logs
- refresh tokens

Run migrations before first production use:

```bash
npm install
npm run db:generate
npm run db:migrate:prod
```

## CV / File Storage

Files are not public web assets.

Upload CV:

```http
POST /api/v1/files/cv
Authorization: Bearer <ATS token>
Content-Type: application/json
```

The file is stored under `FILE_STORAGE_DIR`, and access is checked through backend RBAC before download.

## Audit Trail

The backend logs sensitive actions:

- login/logout
- candidate created
- candidate moved
- candidate rejected
- interview scheduled
- feedback submitted
- requisition approved/rejected
- offer created/approved/rejected
- file uploaded
- role changed

Each log stores:

- action
- user
- date/time
- entity
- old value
- new value
- IP address
- user agent

## Before Real Data

Do not load real production data until:

1. Azure app registration is configured.
2. PostgreSQL production database is ready.
3. Environment variables are set.
4. Database migrations pass.
5. Admin users are created.
6. Salary visibility permissions are reviewed.
7. CV storage folder is private and backed up.
8. Frontend is changed to call backend APIs instead of local demo state.
9. Demo data is reset.

The current React prototype must be connected to this backend before it is considered production-ready.
