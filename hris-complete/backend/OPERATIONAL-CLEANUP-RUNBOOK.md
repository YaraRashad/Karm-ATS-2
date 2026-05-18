# ATS Operational Cleanup Runbook

This runbook prepares a **live operational data cleanup** for the ATS without resetting the database and without reseeding demo data.

## Safety guarantees

The cleanup tooling is designed to:

- **not** reset the database
- **not** run demo seed
- **not** delete users
- **not** delete departments, grade bands, employees, scorecard templates, roles, stages, entities, or other system configuration
- **not** delete audit logs
- **not** touch Azure AD / Microsoft login configuration
- **not** execute deletion unless `CLEANUP_CONFIRM=DELETE_OPERATIONAL_ATS_DATA`

## What will be cleared

Operational ATS records only:

- `hiring_requests`
- `positions`
- `candidates`
- `applications`
- `application_stage_history`
- `application_notes`
- `interviews`
- `scorecards`
- `scorecard_ratings`
- `offers`
- `approval_steps`
- `offer_notes`
- `offer_history`
- `file_objects`
- physical CV/resume files under `FILE_STORAGE_DIR`

## What will NOT be touched

- `users`
- `refresh_tokens`
- `departments`
- `grade_bands`
- `employees`
- `scorecard_templates`
- `scorecard_template_categories`
- `audit_logs`
- database schema, enums, stages, entities, roles
- Azure / Microsoft login setup
- environment variables and app settings

## Scripts

Available npm commands:

```bash
npm run ops:cleanup:preview
npm run ops:cleanup:backup
npm run ops:cleanup:execute
```

These map to:

- preview mode: counts only, no writes
- backup mode: exports JSON snapshots and copies resume files where available
- execute mode: deletes only operational ATS data after explicit confirmation

## Recommended execution location

Run from an environment that can already reach the production database, for example:

- Azure backend App Service SSH / Console
- Azure Cloud Shell with database firewall/network access
- a trusted machine with live `DATABASE_URL` access

## Step 1: Preview counts only

```bash
cd /home/site/wwwroot
npm run ops:cleanup:preview
```

Expected outcome:

- counts by operational module/table
- counts by preserved module/table
- exact cleanup scope

## Step 2: Backup all operational ATS data

Choose a backup directory, then run:

```bash
cd /home/site/wwwroot
export CLEANUP_BACKUP_DIR=/home/site/ats-cleanup-backups/$(date +%Y%m%d-%H%M%S)
npm run ops:cleanup:backup
```

Expected artifacts:

- `cleanup-summary.json`
- one JSON export per operational table
- `file-backup-manifest.json`
- copied resume/CV files under `files/` when the storage path is reachable

## Step 3: Approval checkpoint

Before execution, confirm:

- preview counts are correct
- backup completed successfully
- backup files are stored safely
- only operational ATS records are included

## Step 4: Execute cleanup

```bash
cd /home/site/wwwroot
export CLEANUP_CONFIRM=DELETE_OPERATIONAL_ATS_DATA
npm run ops:cleanup:execute
```

This removes:

- ATS operational database rows listed above
- physical files referenced by `file_objects`

This does **not** remove:

- users
- settings/configuration
- audit logs
- Azure login setup

## Step 5: Post-cleanup validation

After cleanup:

1. Run preview again and confirm operational tables are zeroed.
2. Confirm preserved tables still contain data.
3. Log into the ATS and verify:
   - users still authenticate
   - settings still exist
   - departments/entities/stages remain available
4. Run QA smoke test using only safe TEST_ flows.

## Notes

- If a physical CV file is missing from disk, cleanup still deletes the `file_objects` row and records the missing file in backup metadata.
- There is **no separate requisition-notes table** in the current schema.
- Audit logs are preserved intentionally for traceability.
