# Karm ATS Production Readiness Checklist

Status: not live yet. Real users should not use the ATS for production recruitment until every item below is complete and signed off.

## 1. Required Inputs

### IT / Microsoft 365 Admin

- Azure tenant ID
- Azure app registration client ID
- Approved redirect URIs for production and staging
- Allowed domain confirmation: `karmsolar.com`
- Microsoft login test accounts for:
  - Admin
  - Recruiter
  - Hiring Manager
  - Interviewer

### Infrastructure / Backend Owner

- Production PostgreSQL database URL
- Staging PostgreSQL database URL
- Secure file storage location for CVs
- Backup schedule and retention policy
- Restore test owner
- Production domain and HTTPS certificate
- Backend deployment environment variables

### HR / ATS Admin

- First Admin user email
- Initial recruiters
- Hiring managers and assigned departments/jobs
- Interviewers
- Salary visibility exceptions
- Offer approver list
- Approved manpower plan to import after reset

## 2. Environment Configuration

### Frontend

Set:

```env
VITE_API_BASE_URL=https://<production-api-domain>/api/v1
VITE_AZURE_AD_TENANT_ID=<tenant-id>
VITE_AZURE_AD_CLIENT_ID=<client-id>
```

### Backend

Set:

```env
NODE_ENV=production
AUTH_PROVIDER=microsoft
AUTH_AUTO_PROVISION=false
AZURE_AD_TENANT_ID=<tenant-id>
AZURE_AD_CLIENT_ID=<client-id>
AZURE_AD_ALLOWED_DOMAINS=karmsolar.com
DATABASE_URL=postgresql://...
JWT_SECRET=<strong-secret>
JWT_REFRESH_SECRET=<strong-secret>
FILE_STORAGE_DIR=<secure-private-storage-path>
CORS_ORIGINS=https://<production-frontend-domain>
```

## 3. Database Readiness

- Create production database.
- Run Prisma migrations against production.
- Seed first Admin user.
- Confirm Admin can log in with Microsoft 365.
- Confirm demo/test data is not present after final reset.

## 4. Secure CV / File Storage

- Configure private storage for CV files.
- Confirm files are not publicly accessible by URL.
- Confirm CV preview/download goes through backend authorization.
- Confirm Interviewers and Hiring Managers can only access CVs for assigned candidates.
- Confirm deleted candidates/files follow retention policy.

## 5. Backup And Restore

- Enable automated PostgreSQL backups.
- Enable file storage backups.
- Define retention period.
- Run at least one restore test before go-live.
- Document who can restore and who approves a restore.

## 6. End-To-End Test Matrix

Test using real company Microsoft accounts.

### Admin

- Login.
- View dashboard.
- View all jobs, candidates, interviews, offers, settings, and audit trail.
- Create/edit user.
- Assign roles and permission toggles.
- View salary and offer details.
- Approve requisition.
- Approve/reject offer.
- Confirm audit logs are created.

### Recruiter

- Login.
- Create requisition.
- Add candidate.
- Upload CV.
- Move candidate across pipeline.
- Schedule interview.
- Add notes.
- Create draft offer.
- Confirm cannot access settings.
- Confirm cannot approve offer unless explicitly granted.

### Hiring Manager

- Login.
- See only assigned jobs/candidates.
- Open candidate profile and CV.
- Add feedback/comment.
- Submit recommendation.
- Approve/reject assigned requisition if permitted.
- Confirm salary and offer details are hidden unless permission is granted.
- Confirm cannot see unrelated jobs/candidates.

### Interviewer

- Login.
- See only assigned interviews.
- Open candidate CV for assigned interview.
- Submit scorecard.
- Submit recommendation.
- Confirm cannot see full pipeline, salary, offers, settings, or unrelated candidates.

## 7. Full Recruitment Flow Test

Run this full scenario in staging first:

1. Login as Recruiter.
2. Create requisition.
3. Login as Admin or assigned approver.
4. Approve requisition.
5. Login as Recruiter.
6. Add candidate.
7. Upload CV.
8. Move candidate through pipeline.
9. Schedule interview.
10. Login as Interviewer.
11. Submit scorecard.
12. Login as Recruiter.
13. Create offer.
14. Login as Admin or offer approver.
15. Approve/reject offer.
16. Check audit trail.
17. Confirm role-based visibility at every step.

## 8. Final Production Reset

Only after successful staging tests:

- Execute the production data reset plan.
- Remove all demo candidates, jobs, applications, interviews, offers, files, and test audit logs.
- Keep Admin users, departments, entities, and approved configuration.
- Import the approved manpower plan as the first production dataset.
- Re-run smoke tests after reset.

## 9. Go-Live Risks

- Misconfigured Azure redirect URIs can block login.
- Missing seeded Admin user can lock everyone out.
- Incorrect RBAC assignments can expose candidates or salary details.
- File storage misconfiguration can expose CVs.
- Untested backups create recovery risk.
- Demo data left in production can confuse reporting and audit trail.
- Browser-only testing is not enough; backend access must be verified directly.

## 10. Go / No-Go Rule

Go-live is allowed only when:

- Microsoft login works for all four roles.
- Backend RBAC is verified with real accounts.
- Production DB is migrated and backed up.
- CV storage is private and access-controlled.
- Audit trail records sensitive actions.
- Demo data is reset.
- HR and IT both sign off.
