# HRIS Platform API — Complete Reference
Version 1.0.0 | Base URL: `http://localhost:3001/api/v1`

---

## Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

### POST /auth/login
```json
// Request
{ "email": "nour.elsayed@company.com", "password": "Recruiter@2026" }

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",       // expires in 15 minutes
    "refreshToken": "abc123...",   // expires in 7 days
    "expiresIn": 900,
    "user": {
      "id": "clxxx",
      "email": "nour.elsayed@company.com",
      "fullName": "Nour Elsayed",
      "role": "recruiter",
      "entities": ["egypt","cyprus","uk","tunisia"]
    }
  }
}
```

### POST /auth/refresh
```json
// Request
{ "refreshToken": "abc123..." }

// Response 200
{ "success": true, "data": { "accessToken": "eyJ...", "refreshToken": "xyz...", "expiresIn": 900 } }
```

### POST /auth/logout
```json
// Request (with access token in header)
{ "refreshToken": "abc123..." }

// Response 200
{ "success": true, "data": { "message": "Logged out successfully" } }
```

### GET /auth/me
Returns full user profile including employee record if linked.

---

## Response Envelope

All responses follow this shape:
```json
{
  "success": true | false,
  "data": { ... } | [...],        // present on success
  "error": {                       // present on failure
    "code": "NOT_FOUND",
    "message": "Position not found",
    "errors": [...]                // validation errors array
  },
  "meta": {                        // present on paginated responses
    "page": 1,
    "pageSize": 25,
    "total": 47,
    "totalPages": 2,
    "hasNext": true,
    "hasPrev": false
  },
  "timestamp": "2026-04-28T10:00:00.000Z"
}
```

---

## Role Permissions

| Role          | Positions | Candidates | Offers | Analytics | HC Approval |
|---------------|-----------|------------|--------|-----------|-------------|
| system_admin  | FULL      | FULL       | FULL   | ✓         | ✓           |
| hr_director   | FULL      | FULL       | FULL   | ✓         | ✓           |
| hr_ops        | R/W       | R/W        | R/W    | ✓         | —           |
| recruiter     | R/W       | R/W        | R/W    | —         | —           |
| manager       | Read      | Read       | Read   | —         | —           |
| finance       | Read      | —          | Read   | ✓         | —           |
| executive     | Read      | —          | Read   | ✓         | —           |
| employee      | —         | —          | —      | —         | —           |

Entity scoping: users only see data for entities in their `entities` array.
hr_director and system_admin bypass entity filtering.

---

## Positions

### GET /positions
```
Query params:
  page, pageSize          — pagination (default: 1, 25)
  entity                  — egypt | cyprus | uk | tunisia
  department              — department name (partial match)
  status                  — draft | pending_approval | open | on_hold | closed
  priority                — low | normal | high | urgent
  search                  — searches title and description
  hiringManagerId         — filter by HM
  recruiterId             — filter by recruiter
  sortBy, sortDir         — field + asc|desc

Response: paginated list of positions with department, grade band, candidate count
```

### POST /positions
```json
// Required: title, departmentId, entity, currency, salaryMin, salaryMax
// Optional: seniority, employmentType, gradeBandId, priority, hiringManagerId,
//           scorecardTemplateId, description, requirements[], targetCloseDate,
//           headcountRationale
{
  "title": "Senior Data Engineer",
  "departmentId": "dept-engineering-egypt",
  "entity": "egypt",
  "seniority": "senior",
  "employmentType": "full_time",
  "gradeBandId": "band-ic5-egypt",
  "currency": "EGP",
  "salaryMin": 100000,
  "salaryMax": 150000,
  "priority": "high",
  "description": "We are looking for...",
  "requirements": ["5+ years Spark/Kafka", "Python proficiency"],
  "targetCloseDate": "2026-07-01",
  "headcountRationale": "Data team growing to support new analytics product."
}
```

### GET /positions/:id
Full position detail with department, grade band, HM, recruiter, template, applications.
Includes `stageCounts` aggregation and `daysOpen`.

### PATCH /positions/:id
Partial update. Allowed fields: title, description, requirements, priority,
salaryMin, salaryMax, targetCloseDate, hiringManagerId, scorecardTemplateId, headcountRationale.

### POST /positions/:id/approve-headcount
**Required role: hr_director | system_admin**
```json
{ "note": "Approved — within headcount plan." }
// Sets headcountStatus: approved, status: open, openDate: now
```

### POST /positions/:id/reject-headcount
```json
{ "reason": "Not in Q2 headcount plan — defer to Q3." }
```

### PATCH /positions/:id/status
```json
{ "status": "on_hold" }  // open | on_hold | closed
```

### GET /positions/:id/pipeline
Returns candidates grouped by stage with scores, days metrics, upcoming interviews.

---

## Candidates

### GET /candidates
```
Query: page, pageSize, search, source, tags (comma-separated)
```

### POST /candidates
```json
{
  "firstName": "Mariam",  "lastName": "Fouad",
  "email": "mariam.fouad@gmail.com",
  "phone": "+20 101 000 0000",
  "currentTitle": "Product Manager", "currentCompany": "Careem",
  "totalYearsExp": 6,
  "source": "linkedin",
  "salaryExpectation": 120000, "salaryCurrency": "EGP",
  "noticePeriodDays": 30,
  "tags": ["product","agile"]
}
```

### GET /candidates/:id
Full profile with all applications and scorecard scores.

### PATCH /candidates/:id
Partial update of any candidate field.

---

## Applications

### GET /applications
```
Query: page, pageSize, positionId, stage, entity, source, candidateId, search
```

### POST /applications
```json
{ "candidateId": "cand-xxx", "positionId": "pos-xxx" }
// Creates in 'applied' stage. Reactivates if previously withdrawn.
```

### PATCH /applications/:id/stage
```json
{
  "stage": "interview",     // applied|screening|interview|assessment|offer|hired|rejected
  "reason": "Passed technical screen"
}
// Records stage history with timestamp and actor
```

### POST /applications/:id/disqualify
```json
{ "reason": "Withdrew — accepted another offer" }
// Sets stage: rejected, isActive: false
```

### POST /applications/:id/notes
```json
{ "content": "Very strong candidate — recommend fast-tracking.", "isInternal": true }
```

---

## Scorecards

### GET /scorecards
```
Query: applicationId, interviewerId, submitted (true|false), positionId
```

### POST /scorecards
```json
{
  "applicationId": "app-xxx",
  "templateId": "tpl-engineering-v1",
  "interviewType": "technical",
  "ratings": [
    { "categoryId": "cat-xxx", "score": 5, "notes": "Outstanding system design." },
    { "categoryId": "cat-yyy", "score": 4, "notes": "Clear communicator." },
    { "categoryId": "cat-zzz", "score": 5, "notes": "" },
    { "categoryId": "cat-www", "score": 4, "notes": "" }
  ],
  "submitNow": false    // true to immediately compute composite and lock
}
```

### POST /scorecards/:id/submit
Lock the scorecard, compute weighted composite score, record timestamp.
```json
{
  "recommendation": "strong_yes",    // strong_yes|yes|neutral|no|strong_no
  "strengthsSummary": "Exceptional technical depth across full stack.",
  "concernsSummary": "Notice period 30 days — manageable."
}
// Response includes compositeScore computed from weighted category ratings
```

---

## Offers

### GET /offers
```
Query: page, pageSize, status, entity, positionId
Status values: draft|pending_approval|approved|sent|accepted|declined|expired|withdrawn
```

### POST /offers
```json
{
  "applicationId": "app-xxx",
  "positionId": "pos-xxx",
  "gradeBandId": "band-m1-cyprus",
  "currency": "EUR",
  "baseSalary": 62000,
  "bonusTargetPct": 15,
  "signingBonus": 0,
  "annualLeaveDays": 21,
  "startDate": "2026-07-15",
  "respondByDate": "2026-05-20"
}
// Auto-creates 4-step approval chain. Validates salary against grade band.
// bandException: true if salary outside band — exception note added automatically.
```

### POST /offers/:id/submit
Moves draft → pending_approval, activates first approval step, notifies recruiter.

### POST /offers/:id/approve-step
```json
{ "note": "Strong candidate — approve." }
// Advances approval chain. If Finance step and no band exception: auto-approves.
// On final step: status → sent, sentAt recorded.
```

### POST /offers/:id/reject-step
```json
{ "reason": "Salary above band — needs HR Director exception sign-off first." }
// Returns offer to draft. Resets subsequent steps.
```

### POST /offers/:id/mark-accepted
No body required. Sets status: accepted, moves application to hired stage.

### POST /offers/:id/mark-declined
```json
{
  "reason": "Accepted competing offer",
  "notes": "Accepted Majid Al Futtaim — 18% above our offer."
}
// Valid reasons: "Accepted competing offer" | "Salary below expectation" |
//               "Role not a fit (post-interview)" | "Location / remote policy" |
//               "Start date conflict" | "Personal reasons" |
//               "Counter-offer from current employer" | "Other"
```

### POST /offers/:id/trigger-onboarding
Marks onboardingTriggered: true. Returns list of initiated onboarding tasks.

---

## Analytics

All analytics endpoints require: hr_ops | hr_director | finance | executive | system_admin

### GET /analytics/pipeline
```
Query: entity, positionId, fromDate, toDate

Response:
{
  "total": 43,
  "byStage": { "applied": 8, "screening": 12, "interview": 9, "assessment": 5, "offer": 3, "hired": 4, "rejected": 2 },
  "bySource": { "linkedin": 18, "referral": 9, "direct": 7, "agency": 5, "job_board": 4 },
  "conversions": [
    { "from": "applied", "to": "screening", "rate": 74 },
    { "from": "screening", "to": "interview", "rate": 63 },
    ...
  ],
  "newThisWeek": 5
}
```

### GET /analytics/offers
```
Response:
{
  "summary": {
    "total": 12, "accepted": 8, "declined": 2, "sent": 1, "pending": 1,
    "bandExceptions": 1, "acceptanceRate": 80, "avgTimeToAcceptDays": 7
  },
  "declineReasons": [{ "reason": "Accepted competing offer", "count": 2 }],
  "bandCompliance": { "withinBand": 11, "exceptions": 1, "compliancePct": 92 }
}
```

### GET /analytics/scorecards
```
Response:
{
  "summary": { "total": 28, "submitted": 22, "pending": 6, "overdue": 2, "avgScore": 3.87 },
  "distribution": { "1.0-2.0": 1, "2.0-3.0": 4, "3.0-4.0": 11, "4.0-5.0": 6 },
  "recommendations": { "strong_yes": 4, "yes": 12, "neutral": 4, "no": 2 }
}
```

### GET /analytics/time-to-hire
```
Response:
{
  "overall": { "count": 8, "avgDays": 34 },
  "byEntity": [
    { "entity": "egypt", "count": 5, "avgDays": 31 },
    { "entity": "cyprus", "count": 2, "avgDays": 41 }
  ],
  "benchmark": { "target": 30, "industry": 42 }
}
```

### GET /analytics/headcount
```
Response:
{
  "total": 214,
  "byEntity": [{ "entity": "egypt", "count": 132 }, ...],
  "openPositions": 4
}
```

---

## Error Codes

| Code             | HTTP | Meaning                                    |
|------------------|------|--------------------------------------------|
| BAD_REQUEST      | 400  | Validation failed — check `errors` array   |
| UNAUTHORIZED     | 401  | Missing/expired/invalid token              |
| FORBIDDEN        | 403  | Insufficient role or entity access         |
| NOT_FOUND        | 404  | Resource does not exist                    |
| CONFLICT         | 409  | Duplicate — unique constraint violated     |
| UNPROCESSABLE    | 422  | Business rule violation                    |
| INTERNAL_ERROR   | 500  | Server error — contact system admin        |

---

## Setup & Deployment

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill environment config
cp .env.example .env
# Edit DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET

# 3. Generate Prisma client
npm run db:generate

# 4. Run migrations (creates all tables)
npm run db:migrate

# 5. Seed with realistic test data
npm run db:seed

# 6. Start development server
npm run dev

# Production
npm run db:migrate:prod
npm start
```

---

## Database Quick Reference

```sql
-- Check open positions with candidate counts
SELECT p.title, p.entity, p.status, p.priority,
       COUNT(a.id) as total_candidates
FROM positions p
LEFT JOIN applications a ON a.position_id = p.id AND a.is_active = true
WHERE p.status = 'open'
GROUP BY p.id
ORDER BY p.priority DESC;

-- Offers pending approval
SELECT o.id, c.first_name || ' ' || c.last_name as candidate,
       pos.title, o.base_salary, o.currency, o.status
FROM offers o
JOIN applications app ON app.id = o.application_id
JOIN candidates c ON c.id = app.candidate_id
JOIN positions pos ON pos.id = o.position_id
WHERE o.status = 'pending_approval';

-- Scorecard averages per position
SELECT pos.title, pos.entity,
       AVG(s.composite_score::numeric) as avg_score,
       COUNT(s.id) as scorecard_count
FROM scorecards s
JOIN applications a ON a.id = s.application_id
JOIN positions pos ON pos.id = a.position_id
WHERE s.submitted_at IS NOT NULL
GROUP BY pos.id
ORDER BY avg_score DESC;
```
