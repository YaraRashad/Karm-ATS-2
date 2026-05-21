import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";

const workbookPath =
  process.argv[2] ||
  "/Users/yaraessam/Downloads/Copy of Karm_ATS_Matched_Scorecard_Import.xlsx";

const executeMode =
  process.env.HISTORICAL_IMPORT_CONFIRM === "IMPORT_ALL_SAFE_HISTORICAL";

const SHEETS = {
  requisitions: "Hiring_Requests_Requisitions",
  pipeline: "Active_Hiring_Pipeline",
  talent: "Talent_Database",
  interviews: "Interviews_Scorecards",
  offers: "Offers_Outcomes",
};

const VALID_REQUISITION_STATUSES = new Set([
  "open",
  "closed",
  "draft",
  "on hold",
  "on_hold",
  "pending approval",
  "pending_approval",
]);

const VALID_DEPARTMENTS = new Set([
  "business development",
  "digital transformation",
  "facility management",
  "finance",
  "gr",
  "grc",
  "hse",
  "innovation center",
  "innovation centre",
  "investment",
  "karm cy",
  "legal affairs",
  "logistics",
  "o&m office",
  "operations",
  "technical office",
]);

const VALID_PIPELINE_STAGES = new Set([
  "applied",
  "hr screening",
  "screening",
  "1st interview",
  "first interview",
  "technical interview",
  "final interview",
  "offer",
  "hired",
  "rejected",
]);

const VALID_INTERVIEW_TYPES = new Set([
  "hr screening",
  "1st interview",
  "first interview",
  "technical interview",
  "final interview",
  "panel",
  "behavioral",
  "phone screen",
  "phone screening",
]);

const VALID_INTERVIEW_STATUSES = new Set([
  "completed",
  "scheduled",
  "cancelled",
  "rescheduled",
  "no show",
  "no-show",
  "pending",
]);

const VALID_OFFER_APPROVAL_STATUSES = new Set([
  "approved",
  "pending approval",
  "pending_approval",
  "rejected",
  "draft",
  "sent",
]);

const VALID_CANDIDATE_OUTCOMES = new Set([
  "accepted",
  "rejected",
  "declined",
  "withdrawn",
  "pending",
  "hired",
]);

const entityMap = new Map([
  ["karm egypt", "egypt"],
  ["egypt", "egypt"],
  ["karm cyprus", "cyprus"],
  ["cyprus", "cyprus"],
  ["holdco. (uk)", "uk"],
  ["sub holdco. (nl)", "uk"],
  ["uk", "uk"],
  ["karm tunisia", "tunisia"],
  ["tunisia", "tunisia"],
]);

const positionStatusMap = new Map([
  ["open", "open"],
  ["closed", "closed"],
  ["draft", "draft"],
  ["on hold", "on_hold"],
  ["on_hold", "on_hold"],
  ["pending approval", "pending_approval"],
  ["pending_approval", "pending_approval"],
]);

const priorityMap = new Map([
  ["low", "low"],
  ["normal", "normal"],
  ["medium", "normal"],
  ["high", "high"],
  ["urgent", "urgent"],
]);

const sourceMap = new Map([
  ["linkedin", "linkedin"],
  ["referral", "referral"],
  ["wuzzuf", "job_board"],
  ["indeed", "job_board"],
  ["job board", "job_board"],
  ["job_board", "job_board"],
  ["direct application", "direct"],
  ["direct", "direct"],
  ["headhunt", "agency"],
  ["recruitment agency", "agency"],
  ["agency", "agency"],
  ["cv upload", "direct"],
  ["internal", "internal"],
  ["other", "other"],
]);

const pipelineStageMap = new Map([
  ["applied", "applied"],
  ["hr screening", "screening"],
  ["screening", "screening"],
  ["1st interview", "interview"],
  ["first interview", "interview"],
  ["technical interview", "interview"],
  ["final interview", "interview"],
  ["offer", "offer"],
  ["hired", "hired"],
  ["rejected", "rejected"],
]);

const interviewTypeMap = new Map([
  ["hr screening", "phone_screen"],
  ["screening", "phone_screen"],
  ["phone screen", "phone_screen"],
  ["phone screening", "phone_screen"],
  ["1st interview", "behavioral"],
  ["first interview", "behavioral"],
  ["technical interview", "technical"],
  ["technical", "technical"],
  ["behavioral", "behavioral"],
  ["panel", "panel"],
  ["final interview", "final"],
  ["final", "final"],
]);

const currencyByEntity = {
  egypt: "EGP",
  cyprus: "EUR",
  uk: "GBP",
  tunisia: "TND",
};

const OUTPUT_DIRNAME = "historical-import-output";

function normalize(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hasValue(value) {
  return normalize(value) !== "";
}

function toRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    blankrows: false,
  });
}

function splitName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function rowRef(index, row) {
  const sourceRow = Number(row.Source_Row || row.sourceRow || 0);
  return sourceRow > 0 ? sourceRow : index + 2;
}

function worksheetRow(index) {
  return index + 2;
}

function parseDateOrNull(value) {
  if (!hasValue(value)) return null;
  const parsed = new Date(String(value).trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(value) {
  const parsed = parseDateOrNull(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

function makeRequisitionKey(title, department) {
  return `${normalize(title)}||${normalize(department)}`;
}

function makePositionKeyByDepartmentId(title, departmentId) {
  return `${normalize(title)}||${departmentId}`;
}

function makeAppToken(candidateToken, positionToken) {
  return `${candidateToken}||${positionToken}`;
}

function makeInterviewToken(candidateToken, positionToken, type, dateKey) {
  return `${candidateToken}||${positionToken}||${normalize(type)}||${dateKey || ""}`;
}

function normalizeEntity(value) {
  return entityMap.get(normalize(value)) || null;
}

function normalizePositionStatus(value) {
  return positionStatusMap.get(normalize(value)) || null;
}

function normalizePriority(value) {
  return priorityMap.get(normalize(value)) || "normal";
}

function normalizeSource(value) {
  return sourceMap.get(normalize(value)) || "other";
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function makeIssue(code, reason, suggestedFix, needs) {
  return {
    code,
    reason,
    suggestedFix,
    needs: Array.isArray(needs) ? needs : [needs],
  };
}

function summarizeIssues(issues) {
  return {
    reason: uniqueValues(issues.map((issue) => issue.reason)).join("; "),
    suggestedFix: uniqueValues(issues.map((issue) => issue.suggestedFix)).join(" | "),
    needs: uniqueValues(issues.flatMap((issue) => issue.needs || [])),
    issueCodes: uniqueValues(issues.map((issue) => issue.code)),
  };
}

function safeBasename(filepath) {
  return path
    .basename(filepath, path.extname(filepath))
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "historical-import";
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeExceptionArtifacts(summary) {
  const outputDir = path.join(process.cwd(), OUTPUT_DIRNAME);
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = summary.generatedAt.replace(/[:.]/g, "-");
  const stem = `${safeBasename(summary.workbookPath)}-${timestamp}`;
  const jsonPath = path.join(outputDir, `${stem}.exceptions.json`);
  const csvPath = path.join(outputDir, `${stem}.exceptions.csv`);

  const jsonPayload = {
    workbookPath: summary.workbookPath,
    generatedAt: summary.generatedAt,
    mode: summary.mode,
    exceptionCount: summary.exceptions.length,
    exceptions: summary.exceptions,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2));

  const csvHeaders = [
    "module",
    "sourceSheet",
    "worksheetRow",
    "sourceRow",
    "candidateName",
    "position",
    "issueReason",
    "suggestedFix",
    "needs",
    "issueCodes",
  ];
  const csvLines = [
    csvHeaders.join(","),
    ...summary.exceptions.map((record) =>
      [
        record.module,
        record.sourceSheet,
        record.worksheetRow,
        record.sourceRow,
        record.candidateName,
        record.position,
        record.issueReason,
        record.suggestedFix,
        (record.needs || []).join("|"),
        (record.issueCodes || []).join("|"),
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];
  fs.writeFileSync(csvPath, `${csvLines.join("\n")}\n`);

  summary.exceptionQueue = {
    count: summary.exceptions.length,
    jsonPath,
    csvPath,
  };
}

function normalizedName(firstName, lastName) {
  return normalize(`${firstName || ""} ${lastName || ""}`);
}

function bucketBy(map, key, value) {
  if (!key) return;
  map.set(key, [...(map.get(key) || []), value]);
}

function buildTalentDiagnostics(rows) {
  const byEmail = new Map();
  const byMobile = new Map();
  const byName = new Map();

  rows.forEach((row) => {
    const email = normalize(row.Email);
    const mobile = normalize(row.Mobile);
    const name = normalize(row.Candidate_Name);
    if (email) bucketBy(byEmail, email, true);
    if (mobile) bucketBy(byMobile, mobile, true);
    if (name) bucketBy(byName, name, true);
  });

  return { byEmail, byMobile, byName };
}

function getTalentWorkbookIssues(row, diagnostics) {
  const issues = [];
  const email = normalize(row.Email);
  const mobile = normalize(row.Mobile);
  const name = normalize(row.Candidate_Name);

  if (!name) {
    issues.push(
      makeIssue(
        "missing_candidate_name",
        "Candidate name is missing.",
        "Add the candidate name so ATS matching can be performed safely.",
        "candidate_match",
      ),
    );
  }
  if (!email && !mobile) {
    issues.push(
      makeIssue(
        "missing_email_mobile",
        "Candidate is missing both email and mobile.",
        "Add at least one reliable candidate identifier, preferably email.",
        "candidate_match",
      ),
    );
  }
  if (!email) {
    issues.push(
      makeIssue(
        "missing_email",
        "Candidate email is missing, and the ATS candidate schema requires email for safe creation.",
        "Add a valid email address or manually merge this candidate into an existing ATS profile.",
        "candidate_match",
      ),
    );
  }
  if (hasValue(row.Review_Flag)) {
    issues.push(
      makeIssue(
        "review_flagged",
        "Row is review-flagged in the workbook.",
        "Clear the review flag only after HR confirms the row is safe to import.",
        "candidate_match",
      ),
    );
  }
  if (email && (diagnostics.byEmail.get(email) || []).length > 1) {
    issues.push(
      makeIssue(
        "duplicate_email_in_workbook",
        "Multiple talent rows share the same email in the workbook.",
        "Deduplicate these candidate rows and keep one source-of-truth record before reprocessing.",
        "candidate_match",
      ),
    );
  }
  if (mobile && (diagnostics.byMobile.get(mobile) || []).length > 1) {
    issues.push(
      makeIssue(
        "duplicate_mobile_in_workbook",
        "Multiple talent rows share the same mobile number in the workbook.",
        "Deduplicate these candidate rows and confirm which ATS candidate should own the mobile number.",
        "candidate_match",
      ),
    );
  }
  if (name && (diagnostics.byName.get(name) || []).length > 1) {
    issues.push(
      makeIssue(
        "duplicate_name_in_workbook",
        "Multiple talent rows share the same normalized candidate name in the workbook.",
        "Review these rows and merge or disambiguate them before reprocessing.",
        "candidate_match",
      ),
    );
  }

  return issues;
}

function getRequisitionWorkbookIssues(row) {
  const issues = [];
  const title = normalize(row["ATS Positions"] || row.Position_Title);
  const department = normalize(row.ATS_Department_Matched);
  const status = normalize(row.Requisition_Status);

  if (!title) {
    issues.push(
      makeIssue(
        "missing_position_title",
        "Requisition position title is missing.",
        "Add the ATS position title so the requisition can be matched safely.",
        "requisition_match",
      ),
    );
  }
  if (!department || !VALID_DEPARTMENTS.has(department)) {
    issues.push(
      makeIssue(
        "invalid_department",
        "Requisition department is missing or invalid.",
        "Correct the matched ATS department name and ensure it exists in ATS for the target entity.",
        "requisition_match",
      ),
    );
  }
  if (!status || !VALID_REQUISITION_STATUSES.has(status)) {
    issues.push(
      makeIssue(
        "invalid_requisition_status",
        "Requisition status is missing or invalid.",
        "Map the requisition status to a valid ATS status before reprocessing.",
        "requisition_match",
      ),
    );
  }
  if (hasValue(row.Review_Flag)) {
    issues.push(
      makeIssue(
        "review_flagged",
        "Requisition row is review-flagged in the workbook.",
        "Clear the review flag only after HR confirms the requisition is safe to import.",
        "requisition_match",
      ),
    );
  }

  return issues;
}

function buildRequisitionLookup(rows) {
  const lookup = new Set();
  for (const row of rows) {
    const title = normalize(row["ATS Positions"] || row.Position_Title);
    const original = normalize(row.Position_Title);
    if (title) lookup.add(title);
    if (original) lookup.add(original);
  }
  return lookup;
}

function getPipelineWorkbookIssues(row, requisitionLookup) {
  const issues = [];
  const candidateName = normalize(row.Candidate_Name);
  const position = normalize(row.Position_Title);
  const stage = normalize(row.Current_Stage);

  if (!candidateName) {
    issues.push(
      makeIssue(
        "missing_candidate_name",
        "Pipeline row is missing candidate name.",
        "Add the candidate name so the application can be matched safely.",
        "candidate_match",
      ),
    );
  }
  if (!position) {
    issues.push(
      makeIssue(
        "missing_position",
        "Pipeline row is missing position title.",
        "Add the position title so the requisition can be matched safely.",
        "requisition_match",
      ),
    );
  }
  if (!stage || !VALID_PIPELINE_STAGES.has(stage)) {
    issues.push(
      makeIssue(
        "invalid_pipeline_stage",
        "Pipeline stage is missing or invalid.",
        "Map the pipeline stage to a valid ATS application stage before reprocessing.",
        "application_match",
      ),
    );
  }
  if (position && !requisitionLookup.has(position)) {
    issues.push(
      makeIssue(
        "unmatched_requisition_in_workbook",
        "Pipeline row references a requisition that is not present in the workbook requisition set.",
        "Fix the position title or add the missing requisition to the workbook before reprocessing.",
        "requisition_match",
      ),
    );
  }
  if (hasValue(row.Review_Flag)) {
    issues.push(
      makeIssue(
        "review_flagged",
        "Pipeline row is review-flagged in the workbook.",
        "Clear the review flag only after HR confirms the application can be imported safely.",
        "application_match",
      ),
    );
  }

  return issues;
}

function getInterviewWorkbookIssues(row, requisitionLookup) {
  const issues = [];
  const candidateName = normalize(row.Candidate_Name);
  const position = normalize(row.Position_Title);
  const type = normalize(row.Interview_Type);
  const status = normalize(row.Interview_Status);

  if (!candidateName || !position) {
    issues.push(
      makeIssue(
        "missing_candidate_or_position",
        "Interview row is missing candidate name or position title.",
        "Add both candidate and position values so the interview can be matched safely.",
        ["candidate_match", "requisition_match"],
      ),
    );
  }
  if (!type || !VALID_INTERVIEW_TYPES.has(type)) {
    issues.push(
      makeIssue(
        "invalid_interview_type",
        "Interview type is missing or invalid.",
        "Map the interview type to a supported ATS interview type before reprocessing.",
        "interview_date_fix",
      ),
    );
  }
  if (!status || !VALID_INTERVIEW_STATUSES.has(status)) {
    issues.push(
      makeIssue(
        "invalid_interview_status",
        "Interview status is missing or invalid.",
        "Map the interview status to a valid ATS value before reprocessing.",
        "interview_date_fix",
      ),
    );
  }
  if (!parseDateOrNull(row.Interview_Date)) {
    issues.push(
      makeIssue(
        "invalid_interview_date",
        "Interview date is missing or invalid.",
        "Correct the interview date format/value before reprocessing.",
        "interview_date_fix",
      ),
    );
  }
  if (!hasValue(row.Interviewer)) {
    issues.push(
      makeIssue(
        "missing_interviewer",
        "Interviewer value is blank.",
        "Fill in the interviewer name or email with an active ATS user before reprocessing.",
        "interviewer_value",
      ),
    );
  }
  if (position && !requisitionLookup.has(position)) {
    issues.push(
      makeIssue(
        "unmatched_requisition_in_workbook",
        "Interview row references a requisition that is not present in the workbook requisition set.",
        "Fix the position title or add the missing requisition to the workbook before reprocessing.",
        "requisition_match",
      ),
    );
  }

  return issues;
}

function getOfferWorkbookIssues(row, requisitionLookup) {
  const issues = [];
  const candidateName = normalize(row.Candidate_Name);
  const position = normalize(row.Position_Title);
  const approvalStatus = normalize(row.Offer_Approval_Status);
  const candidateOutcome = normalize(row.Candidate_Offer_Status);

  if (!candidateName || !position) {
    issues.push(
      makeIssue(
        "missing_candidate_or_position",
        "Offer row is missing candidate name or position title.",
        "Add both candidate and position values so the offer can be matched safely.",
        ["candidate_match", "requisition_match"],
      ),
    );
  }
  if (!approvalStatus || !VALID_OFFER_APPROVAL_STATUSES.has(approvalStatus)) {
    issues.push(
      makeIssue(
        "invalid_offer_approval_status",
        "Offer approval status is missing or invalid.",
        "Map the offer approval status to a valid ATS value before reprocessing.",
        "offer_fix",
      ),
    );
  }
  if (!candidateOutcome || !VALID_CANDIDATE_OUTCOMES.has(candidateOutcome)) {
    issues.push(
      makeIssue(
        "invalid_candidate_outcome",
        "Candidate offer outcome is missing or invalid.",
        "Map the candidate outcome to a valid ATS value before reprocessing.",
        "offer_fix",
      ),
    );
  }
  if (position && !requisitionLookup.has(position)) {
    issues.push(
      makeIssue(
        "unmatched_requisition_in_workbook",
        "Offer row references a requisition that is not present in the workbook requisition set.",
        "Fix the position title or add the missing requisition to the workbook before reprocessing.",
        "requisition_match",
      ),
    );
  }

  return issues;
}

function resolveUnique(matches) {
  if (matches.length === 1) return { value: matches[0], ambiguous: false };
  if (matches.length > 1) return { value: null, ambiguous: true };
  return { value: null, ambiguous: false };
}

async function loadRuntimeState() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const [departments, users, candidates, positions, applications, interviews, offers] =
    await Promise.all([
      prisma.department.findMany({
        where: { isActive: true },
        select: { id: true, name: true, entity: true },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      prisma.candidate.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      }),
      prisma.position.findMany({
        select: {
          id: true,
          title: true,
          entity: true,
          departmentId: true,
          currency: true,
          salaryMin: true,
          salaryMax: true,
          recruiterId: true,
          scorecardTemplateId: true,
          department: { select: { name: true } },
        },
      }),
      prisma.application.findMany({
        select: {
          id: true,
          candidateId: true,
          positionId: true,
        },
      }),
      prisma.interview.findMany({
        select: {
          id: true,
          type: true,
          scheduledAt: true,
          application: {
            select: {
              candidateId: true,
              positionId: true,
            },
          },
        },
      }),
      prisma.offer.findMany({
        select: {
          id: true,
          application: {
            select: {
              candidateId: true,
              positionId: true,
            },
          },
        },
      }),
    ]);

  const departmentsByKey = new Map(
    departments.map((department) => [
      `${normalize(department.name)}||${department.entity}`,
      department,
    ]),
  );
  const usersByName = new Map();
  const usersByEmail = new Map();
  users.forEach((user) => {
    bucketBy(usersByName, normalizedName(user.firstName, user.lastName), user);
    bucketBy(usersByEmail, normalize(user.email), user);
  });

  const candidatesByEmail = new Map();
  const candidatesByMobile = new Map();
  const candidatesByName = new Map();
  candidates.forEach((candidate) => {
    bucketBy(candidatesByEmail, normalize(candidate.email), candidate);
    bucketBy(candidatesByMobile, normalize(candidate.phone), candidate);
    bucketBy(
      candidatesByName,
      normalizedName(candidate.firstName, candidate.lastName),
      candidate,
    );
  });

  const positionsByWorkbookKey = new Map();
  positions.forEach((position) => {
    bucketBy(
      positionsByWorkbookKey,
      makeRequisitionKey(position.title, position.department?.name),
      position,
    );
  });

  const applicationsByKey = new Map();
  applications.forEach((application) => {
    bucketBy(
      applicationsByKey,
      makeAppToken(`live:${application.candidateId}`, `live:${application.positionId}`),
      application,
    );
  });

  const interviewsByKey = new Map();
  interviews.forEach((interview) => {
    bucketBy(
      interviewsByKey,
      makeInterviewToken(
        `live:${interview.application.candidateId}`,
        `live:${interview.application.positionId}`,
        interview.type,
        toDateKey(interview.scheduledAt),
      ),
      interview,
    );
  });

  const offersByKey = new Map();
  offers.forEach((offer) => {
    bucketBy(
      offersByKey,
      makeAppToken(`live:${offer.application.candidateId}`, `live:${offer.application.positionId}`),
      offer,
    );
  });

  return {
    counts: {
      candidates: candidates.length,
      positions: positions.length,
      applications: applications.length,
      interviews: interviews.length,
      offers: offers.length,
    },
    departmentsByKey,
    usersByName,
    usersByEmail,
    candidatesByEmail,
    candidatesByMobile,
    candidatesByName,
    positionsByWorkbookKey,
    applicationsByKey,
    interviewsByKey,
    offersByKey,
  };
}

function resolveCandidateAgainstLive(row, state) {
  const email = normalize(row.Email);
  const mobile = normalize(row.Mobile);
  const name = normalize(row.Candidate_Name);

  const emailMatches = email ? state.candidatesByEmail.get(email) || [] : [];
  const mobileMatches = mobile ? state.candidatesByMobile.get(mobile) || [] : [];
  const nameMatches = name ? state.candidatesByName.get(name) || [] : [];

  const unique = new Map();
  [...emailMatches, ...mobileMatches, ...nameMatches].forEach((candidate) => {
    unique.set(candidate.id, candidate);
  });

  return resolveUnique([...unique.values()]);
}

function resolveCandidateAgainstPlan(row, planState) {
  const email = normalize(row.Email);
  const mobile = normalize(row.Mobile);
  const name = normalize(row.Candidate_Name);

  const emailMatches = email ? planState.plannedCandidatesByEmail.get(email) || [] : [];
  const mobileMatches = mobile ? planState.plannedCandidatesByMobile.get(mobile) || [] : [];
  const nameMatches = name ? planState.plannedCandidatesByName.get(name) || [] : [];

  const unique = new Map();
  [...emailMatches, ...mobileMatches, ...nameMatches].forEach((candidate) => {
    unique.set(candidate.token, candidate);
  });

  return resolveUnique([...unique.values()]);
}

function resolvePositionAgainstLive(requisitionKey, state) {
  return resolveUnique(state.positionsByWorkbookKey.get(requisitionKey) || []);
}

function resolvePositionAgainstPlan(requisitionKey, planState) {
  const planned = planState.plannedPositionsByWorkbookKey.get(requisitionKey);
  return planned
    ? { value: planned, ambiguous: false }
    : { value: null, ambiguous: false };
}

function resolveUserIdentifier(value, state) {
  const normalized = normalize(value);
  if (!normalized) return { value: null, ambiguous: false };

  const emailMatches = state.usersByEmail.get(normalized) || [];
  if (emailMatches.length > 0) {
    return resolveUnique(emailMatches);
  }

  return resolveUnique(state.usersByName.get(normalized) || []);
}

function normalizeInterviewStatus(value) {
  const normalized = normalize(value);
  if (normalized === "no show" || normalized === "no-show") return "no_show";
  if (normalized === "pending" || normalized === "rescheduled") return "scheduled";
  return normalized;
}

function mapOfferStatus(approvalStatus, candidateOutcome) {
  const approval = normalize(approvalStatus);
  const outcome = normalize(candidateOutcome);

  if (outcome === "accepted" || outcome === "hired") return "accepted";
  if (outcome === "declined" || outcome === "rejected") return "declined";
  if (outcome === "withdrawn") return "withdrawn";
  if (approval === "sent") return "sent";
  if (approval === "approved") return "approved";
  if (approval === "pending approval" || approval === "pending_approval") {
    return "pending_approval";
  }
  return "draft";
}

function buildWorkbookTalentMap(rows) {
  const map = new Map();
  rows.forEach((row, index) => {
    const key = normalize(row.Candidate_Name);
    if (key && !map.has(key)) {
      map.set(key, { row, worksheetRow: worksheetRow(index), sourceRow: rowRef(index, row) });
    }
  });
  return map;
}

function buildSummaryBase(workbookPath, databaseCounts) {
  return {
    workbookPath,
    mode: executeMode ? "execute" : "dry-run",
    generatedAt: new Date().toISOString(),
    databaseConnected: true,
    databaseCounts,
    created: {
      talent: 0,
      requisitions: 0,
      applications: 0,
      interviews: 0,
      offers: 0,
    },
    resolvedInAts: {
      talent: 0,
      requisitions: 0,
      applications: 0,
      interviews: 0,
      offers: 0,
    },
    importable: {
      talent: 0,
      requisitions: 0,
      applications: 0,
      interviews: 0,
      offers: 0,
    },
    exceptions: [],
    exceptionQueue: {
      count: 0,
      jsonPath: null,
      csvPath: null,
    },
    blocked: {
      talent: [],
      requisitions: [],
      applications: [],
      interviews: [],
      offers: [],
    },
  };
}

function addException(summary, module, sheetName, row, index, issues, extra = {}) {
  const issueList = Array.isArray(issues) ? issues : [issues];
  const normalizedIssues = issueList.filter(Boolean);
  if (normalizedIssues.length === 0) return;

  const issueSummary = summarizeIssues(normalizedIssues);
  const record = {
    module,
    sourceSheet: sheetName,
    worksheetRow: worksheetRow(index),
    sourceRow: rowRef(index, row),
    candidateName: String(row.Candidate_Name || "").trim(),
    position: String(row.Position_Title || row["ATS Positions"] || "").trim(),
    issueReason: issueSummary.reason,
    suggestedFix: issueSummary.suggestedFix,
    needs: issueSummary.needs,
    issueCodes: issueSummary.issueCodes,
    reason: issueSummary.reason,
    ...extra,
  };

  summary.blocked[module].push(record);
  summary.exceptions.push(record);
}

function parseAppToken(token) {
  const parts = String(token || "").split("||");
  return {
    candidateToken: parts[0] || null,
    positionToken: parts[1] || null,
  };
}

function resolveApplicationIdForWrite(applicationToken, state, createdApplicationIds) {
  if (!applicationToken) return null;
  const created = createdApplicationIds.get(applicationToken);
  if (created) return created;

  const { candidateToken, positionToken } = parseAppToken(applicationToken);
  if (!candidateToken || !positionToken) return null;

  const liveMatches =
    state.applicationsByKey.get(makeAppToken(candidateToken, positionToken)) || [];
  return liveMatches[0]?.id || null;
}

async function main() {
  const workbook = XLSX.readFile(workbookPath);
  const talentRows = toRows(workbook.Sheets[SHEETS.talent]);
  const requisitionRows = toRows(workbook.Sheets[SHEETS.requisitions]);
  const pipelineRows = toRows(workbook.Sheets[SHEETS.pipeline]);
  const interviewRows = toRows(workbook.Sheets[SHEETS.interviews]);
  const offerRows = toRows(workbook.Sheets[SHEETS.offers]);

  const requisitionLookup = buildRequisitionLookup(requisitionRows);
  const talentDiagnostics = buildTalentDiagnostics(talentRows);
  const workbookTalentMap = buildWorkbookTalentMap(talentRows);
  const state = await loadRuntimeState();

  const summary = buildSummaryBase(workbookPath, state.counts);

  const planState = {
    plannedCandidatesByEmail: new Map(),
    plannedCandidatesByMobile: new Map(),
    plannedCandidatesByName: new Map(),
    plannedPositionsByWorkbookKey: new Map(),
    plannedApplicationsByKey: new Map(),
    plannedInterviewsByKey: new Map(),
    plannedOffersByKey: new Map(),
  };

  const candidatePlans = [];
  const requisitionPlans = [];
  const applicationPlans = [];
  const interviewPlans = [];
  const offerPlans = [];

  for (const [index, row] of talentRows.entries()) {
    const workbookIssues = getTalentWorkbookIssues(row, talentDiagnostics);
    if (workbookIssues.length > 0) {
      addException(summary, "talent", SHEETS.talent, row, index, workbookIssues);
      continue;
    }

    const sheetRow = worksheetRow(index);
    const email = String(row.Email || "").trim().toLowerCase();
    const liveCandidate = resolveCandidateAgainstLive(row, state);
    if (liveCandidate.ambiguous) {
      addException(
        summary,
        "talent",
        SHEETS.talent,
        row,
        index,
        makeIssue(
          "ambiguous_candidate_match",
          "Candidate matches multiple ATS candidates.",
          "Manually choose the correct ATS candidate match before reprocessing.",
          "candidate_match",
        ),
      );
      continue;
    }
    if (liveCandidate.value) {
      summary.resolvedInAts.talent += 1;
      continue;
    }

    const { firstName, lastName } = splitName(row.Candidate_Name);
    const token = `plan:candidate:${sheetRow}`;
    const plan = {
      token,
      worksheetRow: sheetRow,
      sourceRow: rowRef(index, row),
      data: {
        firstName,
        lastName,
        email,
        phone: hasValue(row.Mobile) ? String(row.Mobile).trim() : null,
        currentTitle: hasValue(row.Current_Title) ? String(row.Current_Title).trim() : null,
        currentCompany: hasValue(row.Current_Company) ? String(row.Current_Company).trim() : null,
        totalYearsExp: hasValue(row.Years_of_Experience)
          ? Number.parseInt(String(row.Years_of_Experience), 10) || null
          : null,
        location: hasValue(row.Location) ? String(row.Location).trim() : null,
        nationality: hasValue(row.Nationality) ? String(row.Nationality).trim() : null,
        source: normalizeSource(row.Source),
        tags: [],
      },
    };

    candidatePlans.push(plan);
    bucketBy(planState.plannedCandidatesByEmail, normalize(email), plan);
    bucketBy(planState.plannedCandidatesByMobile, normalize(row.Mobile), plan);
    bucketBy(planState.plannedCandidatesByName, normalize(row.Candidate_Name), plan);
  }

  for (const [index, row] of requisitionRows.entries()) {
    const workbookIssues = getRequisitionWorkbookIssues(row);
    if (workbookIssues.length > 0) {
      addException(summary, "requisitions", SHEETS.requisitions, row, index, workbookIssues);
      continue;
    }

    const sheetRow = worksheetRow(index);
    const entity = normalizeEntity(row.Entity);
    const status = normalizePositionStatus(row.Requisition_Status);
    if (!entity || !status) {
      addException(
        summary,
        "requisitions",
        SHEETS.requisitions,
        row,
        index,
        makeIssue(
          "invalid_entity_or_status_mapping",
          "Entity or requisition status could not be mapped to ATS values.",
          "Correct the entity/status mapping so the requisition can be imported safely.",
          "requisition_match",
        ),
      );
      continue;
    }

    const department = state.departmentsByKey.get(
      `${normalize(row.ATS_Department_Matched)}||${entity}`,
    );
    if (!department) {
      addException(
        summary,
        "requisitions",
        SHEETS.requisitions,
        row,
        index,
        makeIssue(
          "missing_live_department",
          "Matching live department does not exist in ATS.",
          `Create or map the department '${row.ATS_Department_Matched}' for entity '${entity}' in ATS before reprocessing.`,
          "requisition_match",
        ),
        {
          department: row.ATS_Department_Matched,
          entity,
        },
      );
      continue;
    }

    const workbookKey = makeRequisitionKey(
      row["ATS Positions"] || row.Position_Title,
      row.ATS_Department_Matched,
    );
    const existing = resolvePositionAgainstLive(workbookKey, state);
    if (existing.ambiguous) {
      addException(
        summary,
        "requisitions",
        SHEETS.requisitions,
        row,
        index,
        makeIssue(
          "ambiguous_requisition_match",
          "Requisition matches multiple ATS positions.",
          "Manually identify the correct ATS requisition or merge duplicate ATS positions before reprocessing.",
          "requisition_match",
        ),
      );
      continue;
    }
    if (existing.value) {
      summary.resolvedInAts.requisitions += 1;
      continue;
    }
    if (planState.plannedPositionsByWorkbookKey.has(workbookKey)) {
      continue;
    }

    const recruiterMatch = resolveUserIdentifier(row.Recruiter, state);
    const openDate = parseDateOrNull(row.Request_Date);
    const isClosed = status === "closed";
    const plan = {
      token: `plan:position:${sheetRow}`,
      worksheetRow: sheetRow,
      sourceRow: rowRef(index, row),
      workbookKey,
      data: {
        title: String(row["ATS Positions"] || row.Position_Title || "").trim(),
        departmentId: department.id,
        entity,
        seniority: "mid",
        employmentType: "full_time",
        currency: currencyByEntity[entity] || "EGP",
        salaryMin: 0,
        salaryMax: 1,
        status,
        priority: normalizePriority(row.Priority),
        headcountStatus: status === "pending_approval" ? "pending" : "approved",
        headcountRationale: hasValue(row.Position_Type)
          ? String(row.Position_Type).trim()
          : "Manpower",
        recruiterId: recruiterMatch.value?.id || null,
        description: hasValue(row.Notes) ? String(row.Notes).trim() : null,
        requirements: [],
        openDate: openDate && status !== "draft" ? openDate : null,
        closedDate: isClosed ? openDate : null,
        isActive: !isClosed,
      },
    };

    requisitionPlans.push(plan);
    planState.plannedPositionsByWorkbookKey.set(workbookKey, plan);
  }

  for (const [index, row] of pipelineRows.entries()) {
    const workbookIssues = getPipelineWorkbookIssues(row, requisitionLookup);
    if (workbookIssues.length > 0) {
      addException(summary, "applications", SHEETS.pipeline, row, index, workbookIssues);
      continue;
    }

    const sheetRow = worksheetRow(index);
    const talentReference = workbookTalentMap.get(normalize(row.Candidate_Name));
    const candidateSourceRow = talentReference?.row || row;
    const liveCandidate = resolveCandidateAgainstLive(candidateSourceRow, state);
    const plannedCandidate = resolveCandidateAgainstPlan(candidateSourceRow, planState);
    if (liveCandidate.ambiguous || plannedCandidate.ambiguous) {
      addException(
        summary,
        "applications",
        SHEETS.pipeline,
        row,
        index,
        makeIssue(
          "ambiguous_candidate_match",
          "Candidate resolution is ambiguous.",
          "Manually match this candidate to the correct ATS profile before reprocessing.",
          "candidate_match",
        ),
      );
      continue;
    }

    const candidateToken = liveCandidate.value
      ? `live:${liveCandidate.value.id}`
      : plannedCandidate.value?.token;
    if (!candidateToken) {
      addException(
        summary,
        "applications",
        SHEETS.pipeline,
        row,
        index,
        makeIssue(
          "candidate_not_resolved",
          "Candidate is not available in ATS or the executable talent import set.",
          "Create or match the candidate in ATS, then reprocess this application.",
          "candidate_match",
        ),
      );
      continue;
    }

    const requisitionKey = makeRequisitionKey(
      row.Position_Title,
      row.ATS_Department_Matched,
    );
    const livePosition = resolvePositionAgainstLive(requisitionKey, state);
    const plannedPosition = resolvePositionAgainstPlan(requisitionKey, planState);
    if (livePosition.ambiguous) {
      addException(
        summary,
        "applications",
        SHEETS.pipeline,
        row,
        index,
        makeIssue(
          "ambiguous_requisition_match",
          "Requisition resolution is ambiguous in ATS.",
          "Manually identify the correct ATS requisition or merge duplicate ATS positions before reprocessing.",
          "requisition_match",
        ),
      );
      continue;
    }
    const positionToken = livePosition.value
      ? `live:${livePosition.value.id}`
      : plannedPosition.value?.token;
    if (!positionToken) {
      addException(
        summary,
        "applications",
        SHEETS.pipeline,
        row,
        index,
        makeIssue(
          "requisition_not_resolved",
          "Requisition is not available in ATS or the executable requisition import set.",
          "Create or match the requisition in ATS, then reprocess this application.",
          "requisition_match",
        ),
      );
      continue;
    }

    const liveAppKey =
      liveCandidate.value && livePosition.value
        ? makeAppToken(candidateToken, positionToken)
        : null;
    if (liveAppKey && (state.applicationsByKey.get(liveAppKey) || []).length > 0) {
      summary.resolvedInAts.applications += 1;
      continue;
    }

    const planAppKey = makeAppToken(candidateToken, positionToken);
    if (planState.plannedApplicationsByKey.has(planAppKey)) {
      continue;
    }

    const stage = pipelineStageMap.get(normalize(row.Current_Stage)) || "applied";
    const appliedAt = parseDateOrNull(row.Requisition_Date) || new Date();
    const plan = {
      token: `plan:application:${sheetRow}`,
      worksheetRow: sheetRow,
      sourceRow: rowRef(index, row),
      candidateName: String(row.Candidate_Name || "").trim(),
      position: String(row.Position_Title || "").trim(),
      candidateToken,
      positionToken,
      data: {
        stage,
        stageEnteredAt: appliedAt,
        appliedAt,
        isActive: !["hired", "rejected"].includes(stage),
        disqualifyReason:
          stage === "rejected" && hasValue(row.Rejection_Reason)
            ? String(row.Rejection_Reason).trim()
            : null,
      },
    };

    applicationPlans.push(plan);
    planState.plannedApplicationsByKey.set(planAppKey, plan);
  }

  for (const [index, row] of interviewRows.entries()) {
    const workbookIssues = getInterviewWorkbookIssues(row, requisitionLookup);
    if (workbookIssues.length > 0) {
      addException(summary, "interviews", SHEETS.interviews, row, index, workbookIssues);
      continue;
    }

    const sheetRow = worksheetRow(index);
    const talentReference = workbookTalentMap.get(normalize(row.Candidate_Name));
    const candidateSourceRow = talentReference?.row || row;
    const liveCandidate = resolveCandidateAgainstLive(candidateSourceRow, state);
    const plannedCandidate = resolveCandidateAgainstPlan(candidateSourceRow, planState);
    if (liveCandidate.ambiguous || plannedCandidate.ambiguous) {
      addException(
        summary,
        "interviews",
        SHEETS.interviews,
        row,
        index,
        makeIssue(
          "ambiguous_candidate_match",
          "Candidate resolution is ambiguous.",
          "Manually match this candidate to the correct ATS profile before reprocessing.",
          "candidate_match",
        ),
      );
      continue;
    }

    const candidateToken = liveCandidate.value
      ? `live:${liveCandidate.value.id}`
      : plannedCandidate.value?.token;
    const requisitionKey = makeRequisitionKey(
      row.Position_Title,
      row.ATS_Department_Matched,
    );
    const livePosition = resolvePositionAgainstLive(requisitionKey, state);
    const plannedPosition = resolvePositionAgainstPlan(requisitionKey, planState);
    if (livePosition.ambiguous) {
      addException(
        summary,
        "interviews",
        SHEETS.interviews,
        row,
        index,
        makeIssue(
          "ambiguous_requisition_match",
          "Requisition resolution is ambiguous in ATS.",
          "Manually identify the correct ATS requisition or merge duplicate ATS positions before reprocessing.",
          "requisition_match",
        ),
      );
      continue;
    }

    const positionToken = livePosition.value
      ? `live:${livePosition.value.id}`
      : plannedPosition.value?.token;
    if (!candidateToken || !positionToken) {
      addException(
        summary,
        "interviews",
        SHEETS.interviews,
        row,
        index,
        makeIssue(
          "candidate_or_requisition_not_resolved",
          "Candidate or requisition is not available in ATS or the executable import set.",
          "Resolve both the candidate and requisition in ATS before reprocessing this interview.",
          ["candidate_match", "requisition_match"],
        ),
      );
      continue;
    }

    const applicationToken = makeAppToken(candidateToken, positionToken);
    const liveApplicationMatches =
      liveCandidate.value && livePosition.value
        ? state.applicationsByKey.get(applicationToken) || []
        : [];
    const plannedApplication = planState.plannedApplicationsByKey.get(applicationToken);
    if (liveApplicationMatches.length === 0 && !plannedApplication) {
      addException(
        summary,
        "interviews",
        SHEETS.interviews,
        row,
        index,
        makeIssue(
          "application_not_resolved",
          "Application is not available in ATS or the executable pipeline import set.",
          "Create or match the candidate application in ATS before reprocessing this interview.",
          "application_match",
        ),
      );
      continue;
    }

    const interviewerMatch = resolveUserIdentifier(row.Interviewer, state);
    if (interviewerMatch.ambiguous || !interviewerMatch.value) {
      addException(
        summary,
        "interviews",
        SHEETS.interviews,
        row,
        index,
        makeIssue(
          "interviewer_not_resolved",
          "Interviewer could not be uniquely matched to an active ATS user.",
          "Set the interviewer to an active ATS user email or full name before reprocessing.",
          "interviewer_value",
        ),
        {
          interviewer: row.Interviewer,
        },
      );
      continue;
    }

    const interviewType = interviewTypeMap.get(normalize(row.Interview_Type));
    const interviewDate = parseDateOrNull(row.Interview_Date);
    const interviewKey = makeInterviewToken(
      candidateToken,
      positionToken,
      interviewType,
      toDateKey(row.Interview_Date),
    );

    if (
      liveCandidate.value &&
      livePosition.value &&
      (state.interviewsByKey.get(interviewKey) || []).length > 0
    ) {
      summary.resolvedInAts.interviews += 1;
      continue;
    }
    if (planState.plannedInterviewsByKey.has(interviewKey)) {
      continue;
    }

    const plan = {
      token: `plan:interview:${sheetRow}`,
      worksheetRow: sheetRow,
      sourceRow: rowRef(index, row),
      candidateName: String(row.Candidate_Name || "").trim(),
      position: String(row.Position_Title || "").trim(),
      applicationToken,
      candidateToken,
      positionToken,
      data: {
        interviewerId: interviewerMatch.value.id,
        type: interviewType,
        scheduledAt: interviewDate,
        durationMinutes: 60,
        location: null,
        meetingLink: null,
        status: normalizeInterviewStatus(row.Interview_Status),
      },
    };

    interviewPlans.push(plan);
    planState.plannedInterviewsByKey.set(interviewKey, plan);
  }

  for (const [index, row] of offerRows.entries()) {
    const workbookIssues = getOfferWorkbookIssues(row, requisitionLookup);
    if (workbookIssues.length > 0) {
      addException(summary, "offers", SHEETS.offers, row, index, workbookIssues);
      continue;
    }

    const sheetRow = worksheetRow(index);
    const talentReference = workbookTalentMap.get(normalize(row.Candidate_Name));
    const candidateSourceRow = talentReference?.row || row;
    const liveCandidate = resolveCandidateAgainstLive(candidateSourceRow, state);
    const plannedCandidate = resolveCandidateAgainstPlan(candidateSourceRow, planState);
    if (liveCandidate.ambiguous || plannedCandidate.ambiguous) {
      addException(
        summary,
        "offers",
        SHEETS.offers,
        row,
        index,
        makeIssue(
          "ambiguous_candidate_match",
          "Candidate resolution is ambiguous.",
          "Manually match this candidate to the correct ATS profile before reprocessing.",
          "candidate_match",
        ),
      );
      continue;
    }

    const candidateToken = liveCandidate.value
      ? `live:${liveCandidate.value.id}`
      : plannedCandidate.value?.token;
    const requisitionKey = makeRequisitionKey(
      row.Position_Title,
      row.ATS_Department_Matched,
    );
    const livePosition = resolvePositionAgainstLive(requisitionKey, state);
    const plannedPosition = resolvePositionAgainstPlan(requisitionKey, planState);
    if (livePosition.ambiguous) {
      addException(
        summary,
        "offers",
        SHEETS.offers,
        row,
        index,
        makeIssue(
          "ambiguous_requisition_match",
          "Requisition resolution is ambiguous in ATS.",
          "Manually identify the correct ATS requisition or merge duplicate ATS positions before reprocessing.",
          "requisition_match",
        ),
      );
      continue;
    }

    const positionToken = livePosition.value
      ? `live:${livePosition.value.id}`
      : plannedPosition.value?.token;
    if (!candidateToken || !positionToken) {
      addException(
        summary,
        "offers",
        SHEETS.offers,
        row,
        index,
        makeIssue(
          "candidate_or_requisition_not_resolved",
          "Candidate or requisition is not available in ATS or the executable import set.",
          "Resolve both the candidate and requisition in ATS before reprocessing this offer.",
          ["candidate_match", "requisition_match"],
        ),
      );
      continue;
    }

    const applicationToken = makeAppToken(candidateToken, positionToken);
    const liveApplicationMatches =
      liveCandidate.value && livePosition.value
        ? state.applicationsByKey.get(applicationToken) || []
        : [];
    const plannedApplication = planState.plannedApplicationsByKey.get(applicationToken);
    if (liveApplicationMatches.length === 0 && !plannedApplication) {
      addException(
        summary,
        "offers",
        SHEETS.offers,
        row,
        index,
        makeIssue(
          "application_not_resolved",
          "Application is not available in ATS or the executable pipeline import set.",
          "Create or match the candidate application in ATS before reprocessing this offer.",
          "application_match",
        ),
      );
      continue;
    }

    if (
      liveCandidate.value &&
      livePosition.value &&
      (state.offersByKey.get(applicationToken) || []).length > 0
    ) {
      summary.resolvedInAts.offers += 1;
      continue;
    }
    if (planState.plannedOffersByKey.has(applicationToken)) {
      continue;
    }

    const entity = livePosition.value?.entity || plannedPosition.value?.data.entity;
    const salaryMin = livePosition.value?.salaryMin ?? plannedPosition.value?.data.salaryMin ?? 0;
    const currency =
      livePosition.value?.currency ||
      plannedPosition.value?.data.currency ||
      currencyByEntity[entity] ||
      "EGP";

    const plan = {
      token: `plan:offer:${sheetRow}`,
      worksheetRow: sheetRow,
      sourceRow: rowRef(index, row),
      candidateName: String(row.Candidate_Name || "").trim(),
      position: String(row.Position_Title || "").trim(),
      applicationToken,
      positionToken,
      data: {
        currency,
        baseSalary: Math.max(1, Number(salaryMin) || 1),
        bonusTargetPct: 0,
        signingBonus: 0,
        annualLeaveDays: 21,
        startDate: null,
        respondByDate: null,
        status: mapOfferStatus(row.Offer_Approval_Status, row.Candidate_Offer_Status),
        sentAt: normalize(row.Offer_Approval_Status) === "sent" ? new Date() : null,
        acceptedAt:
          ["accepted", "hired"].includes(normalize(row.Candidate_Offer_Status)) ? new Date() : null,
        declinedAt:
          ["declined", "rejected", "withdrawn"].includes(
            normalize(row.Candidate_Offer_Status),
          )
            ? new Date()
            : null,
        declineReason:
          ["declined", "rejected"].includes(normalize(row.Candidate_Offer_Status)) &&
          hasValue(row.Comments)
            ? String(row.Comments).trim()
            : null,
        declineNotes: hasValue(row.Comments) ? String(row.Comments).trim() : null,
      },
    };

    offerPlans.push(plan);
    planState.plannedOffersByKey.set(applicationToken, plan);
  }

  summary.importable = {
    talent: candidatePlans.length,
    requisitions: requisitionPlans.length,
    applications: applicationPlans.length,
    interviews: interviewPlans.length,
    offers: offerPlans.length,
  };

  if (executeMode) {
    const createdCandidateIds = new Map();
    const createdPositionIds = new Map();
    const createdApplicationIds = new Map();
    const actualCreated = {
      talent: 0,
      requisitions: 0,
      applications: 0,
      interviews: 0,
      offers: 0,
    };

    await prisma.$transaction(async (tx) => {
      for (const plan of candidatePlans) {
        const created = await tx.candidate.create({ data: plan.data });
        createdCandidateIds.set(plan.token, created.id);
        actualCreated.talent += 1;
      }

      for (const plan of requisitionPlans) {
        const created = await tx.position.create({ data: plan.data });
        createdPositionIds.set(plan.token, created.id);
        actualCreated.requisitions += 1;
      }

      for (const plan of applicationPlans) {
        const candidateId = plan.candidateToken.startsWith("live:")
          ? plan.candidateToken.slice(5)
          : createdCandidateIds.get(plan.candidateToken);
        const positionId = plan.positionToken.startsWith("live:")
          ? plan.positionToken.slice(5)
          : createdPositionIds.get(plan.positionToken);
        const created = await tx.application.create({
          data: {
            candidateId,
            positionId,
            ...plan.data,
          },
        });
        createdApplicationIds.set(plan.token, created.id);
        createdApplicationIds.set(makeAppToken(plan.candidateToken, plan.positionToken), created.id);
        actualCreated.applications += 1;
      }

      for (const plan of interviewPlans) {
        const applicationId = resolveApplicationIdForWrite(
          plan.applicationToken,
          state,
          createdApplicationIds,
        );
        if (!applicationId) {
          addException(
            summary,
            "interviews",
            SHEETS.interviews,
            {
              Candidate_Name: plan.candidateName,
              Position_Title: plan.position,
              Source_Row: plan.sourceRow,
            },
            plan.worksheetRow - 2,
            makeIssue(
              "write_time_application_resolution_failed",
              "Interview could not be linked to a concrete ATS application at write time.",
              "Resolve the candidate/requisition/application path, then reprocess this interview.",
              "application_match",
            ),
          );
          continue;
        }
        await tx.interview.create({
          data: {
            applicationId,
            ...plan.data,
          },
        });
        actualCreated.interviews += 1;
      }

      for (const plan of offerPlans) {
        const applicationId = resolveApplicationIdForWrite(
          plan.applicationToken,
          state,
          createdApplicationIds,
        );

        const positionId = plan.positionToken.startsWith("live:")
          ? plan.positionToken.slice(5)
          : createdPositionIds.get(plan.positionToken);
        if (!applicationId || !positionId) {
          addException(
            summary,
            "offers",
            SHEETS.offers,
            {
              Candidate_Name: plan.candidateName,
              Position_Title: plan.position,
              Source_Row: plan.sourceRow,
            },
            plan.worksheetRow - 2,
            makeIssue(
              "write_time_offer_resolution_failed",
              "Offer could not be linked to a concrete ATS application or requisition at write time.",
              "Resolve the candidate/requisition/application path, then reprocess this offer.",
              ["application_match", "requisition_match", "offer_fix"],
            ),
          );
          continue;
        }

        await tx.offer.create({
          data: {
            applicationId,
            positionId,
            ...plan.data,
          },
        });
        actualCreated.offers += 1;
      }
    });

    summary.created = actualCreated;
  }

  writeExceptionArtifacts(summary);

  const readableSummary = [
    "HISTORICAL ALL-SAFE IMPORT",
    `Workbook: ${summary.workbookPath}`,
    `Mode: ${summary.mode}`,
    `Generated: ${summary.generatedAt}`,
    `Database connected: yes`,
    "",
    `Importable talent rows: ${summary.importable.talent}`,
    `Importable requisition rows: ${summary.importable.requisitions}`,
    `Importable application rows: ${summary.importable.applications}`,
    `Importable interview rows: ${summary.importable.interviews}`,
    `Importable offer rows: ${summary.importable.offers}`,
    "",
    `Resolved in ATS talent rows: ${summary.resolvedInAts.talent}`,
    `Resolved in ATS requisition rows: ${summary.resolvedInAts.requisitions}`,
    `Resolved in ATS application rows: ${summary.resolvedInAts.applications}`,
    `Resolved in ATS interview rows: ${summary.resolvedInAts.interviews}`,
    `Resolved in ATS offer rows: ${summary.resolvedInAts.offers}`,
    "",
    `Blocked talent rows: ${summary.blocked.talent.length}`,
    `Blocked requisition rows: ${summary.blocked.requisitions.length}`,
    `Blocked application rows: ${summary.blocked.applications.length}`,
    `Blocked interview rows: ${summary.blocked.interviews.length}`,
    `Blocked offer rows: ${summary.blocked.offers.length}`,
    "",
    `Exception queue JSON: ${summary.exceptionQueue.jsonPath}`,
    `Exception queue CSV: ${summary.exceptionQueue.csvPath}`,
    "",
    executeMode
      ? `Writes performed: talent=${summary.created.talent}, requisitions=${summary.created.requisitions}, applications=${summary.created.applications}, interviews=${summary.created.interviews}, offers=${summary.created.offers}`
      : "Dry-run only, no writes performed.",
  ].join("\n");

  console.log(JSON.stringify(summary, null, 2));
  console.log("\n--- READABLE SUMMARY ---\n");
  console.log(readableSummary);
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
