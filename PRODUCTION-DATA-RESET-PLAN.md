# Karm ATS Production Data Reset Plan

This ATS is not live until Microsoft login, backend RBAC, database storage, CV storage, and audit logging have been tested end to end.

## Before Reset

1. Confirm production environment variables are set for Microsoft Entra ID, database, JWT secrets, CORS, and file storage.
2. Confirm at least two Admin users can log in with Microsoft 365.
3. Export any useful MVP/demo reference data if needed.
4. Take a database backup, even if it only contains demo data.
5. Confirm CV/file storage bucket or folder is separated from test storage.

## Reset Scope

Delete demo/test records for:

- Candidates
- Applications
- Interviews
- Scorecards
- Offers
- Offer history and notes
- Application notes
- Uploaded CV/file objects
- Positions/requisitions
- Audit logs generated during testing

Keep:

- Admin users
- Approved role assignments
- Departments
- Entities
- Production configuration

## Reset Execution

Run the reset only from the backend with Admin approval. Do not expose a frontend “reset everything” button in production.

Recommended order:

1. Disable user access temporarily.
2. Run database backup.
3. Delete dependent records first: files, notes, scorecards, interviews, offers, applications.
4. Delete requisitions/positions.
5. Clear test audit logs or archive them outside production reporting.
6. Verify Admin login still works.
7. Import approved manpower plan as the first production dataset.
8. Re-enable user access.

## Post Reset Checks

- Admin sees empty operational ATS tables.
- Recruiters see no candidates until imported/created.
- Hiring Managers only see assigned jobs/candidates.
- Interviewers only see assigned interviews.
- Salary and offer details are hidden unless permission is granted.
- New actions create audit logs.
