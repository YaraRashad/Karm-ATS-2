import "dotenv/config";
import XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";

const workbookPath =
  process.argv[2] ||
  "/Users/yaraessam/Downloads/Copy of Karm_ATS_Matched_Scorecard_Import.xlsx";

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

const ATS_INTERVIEW_TYPE_MAP = new Map([
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
  ["case study", "case_study"],
]);

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

function rowRef(index, row) {
  const sourceRow = Number(row.Source_Row || row.sourceRow || 0);
  return sourceRow > 0 ? sourceRow : index + 2;
}

function addIssue(bucket, type, rowNumber, details) {
  bucket[type].push({ rowNumber, ...details });
}

function addConflict(bucket, type, rowNumber, details) {
  bucket[type].push({ rowNumber, ...details });
}

function parseDateValue(value) {
  if (!hasValue(value)) return null;
  const text = String(value).trim();
  const asDate = new Date(text);
  return Number.isNaN(asDate.getTime()) ? null : asDate.toISOString();
}

function toDateKey(value) {
  const parsed = parseDateValue(value);
  return parsed ? parsed.slice(0, 10) : null;
}

function splitName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizedFullName(firstName, lastName) {
  return normalize(`${firstName || ""} ${lastName || ""}`);
}

function createSummaryBase(totalRows) {
  return {
    totalRows,
    readyRows: 0,
    rowsNeedingReview: 0,
    readyRowNumbers: [],
    reviewRowNumbers: [],
  };
}

function uniqueSorted(numbers) {
  return Array.from(new Set(numbers)).sort((a, b) => a - b);
}

function summarizeIssueMap(issueMap) {
  const reviewRows = new Set();
  const issueCounts = {};
  for (const [key, entries] of Object.entries(issueMap)) {
    issueCounts[key] = {
      count: entries.length,
      rows: entries.map((entry) => entry.rowNumber),
    };
    for (const entry of entries) reviewRows.add(entry.rowNumber);
  }
  return { issueCounts, reviewRows };
}

function summarizeConflictMap(conflictMap) {
  const blockedRows = new Set();
  const reviewRows = new Set();
  const safeRows = new Set();
  const conflictCounts = {};
  for (const [key, entries] of Object.entries(conflictMap)) {
    conflictCounts[key] = {
      count: entries.length,
      rows: entries.map((entry) => entry.rowNumber),
    };
    for (const entry of entries) {
      if (entry.severity === "blocked") blockedRows.add(entry.rowNumber);
      else if (entry.severity === "safe") safeRows.add(entry.rowNumber);
      else reviewRows.add(entry.rowNumber);
    }
  }
  return { conflictCounts, blockedRows, reviewRows, safeRows };
}

function finalizeSection(summary, issueMap, createCounts = {}, conflictMap = null) {
  const { issueCounts, reviewRows: issueReviewRows } = summarizeIssueMap(issueMap);
  const reviewRows = new Set(issueReviewRows);
  const blockedRows = new Set();
  let conflictCounts = {};

  if (conflictMap) {
    const conflictSummary = summarizeConflictMap(conflictMap);
    conflictCounts = conflictSummary.conflictCounts;
    for (const rowNumber of conflictSummary.reviewRows) reviewRows.add(rowNumber);
    for (const rowNumber of conflictSummary.blockedRows) {
      blockedRows.add(rowNumber);
      reviewRows.add(rowNumber);
    }
  }

  const readyRows = summary.readyRowNumbers.filter(
    (rowNumber) => !reviewRows.has(rowNumber) && !blockedRows.has(rowNumber),
  );
  const allReviewRows = uniqueSorted([
    ...summary.reviewRowNumbers,
    ...Array.from(reviewRows),
  ]);
  const blockedRowNumbers = uniqueSorted(Array.from(blockedRows));

  return {
    ...summary,
    readyRows: readyRows.length,
    readyRowNumbers: readyRows,
    rowsNeedingReview: allReviewRows.length,
    reviewRowNumbers: allReviewRows,
    blockedByConflicts: blockedRowNumbers.length,
    blockedRowNumbers,
    issues: issueCounts,
    conflicts: conflictCounts,
    creates: createCounts,
  };
}

function classifyTalentRows(rows) {
  const summary = createSummaryBase(rows.length);
  const issues = {
    missingCandidateName: [],
    missingEmailMobile: [],
    duplicateCandidates: [],
    reviewFlagged: [],
  };

  const byEmail = new Map();
  const byMobile = new Map();
  const byName = new Map();

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const email = normalize(row.Email);
    const mobile = normalize(row.Mobile);
    const name = normalize(row.Candidate_Name);

    if (email) byEmail.set(email, [...(byEmail.get(email) || []), rowNumber]);
    if (mobile) byMobile.set(mobile, [...(byMobile.get(mobile) || []), rowNumber]);
    if (name) byName.set(name, [...(byName.get(name) || []), rowNumber]);
  });

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const name = normalize(row.Candidate_Name);
    const email = normalize(row.Email);
    const mobile = normalize(row.Mobile);
    let needsReview = false;

    if (!name) {
      addIssue(issues, "missingCandidateName", rowNumber, {});
      needsReview = true;
    }
    if (!email && !mobile) {
      addIssue(issues, "missingEmailMobile", rowNumber, {});
      needsReview = true;
    }

    const duplicateReasons = [];
    if (email && (byEmail.get(email) || []).length > 1) duplicateReasons.push("email");
    if (mobile && (byMobile.get(mobile) || []).length > 1) duplicateReasons.push("mobile");
    if (name && (byName.get(name) || []).length > 1) duplicateReasons.push("name");
    if (duplicateReasons.length > 0) {
      addIssue(issues, "duplicateCandidates", rowNumber, { duplicateBy: duplicateReasons });
      needsReview = true;
    }

    if (hasValue(row.Review_Flag)) {
      addIssue(issues, "reviewFlagged", rowNumber, { reviewFlag: String(row.Review_Flag).trim() });
      needsReview = true;
    }

    if (needsReview) summary.reviewRowNumbers.push(rowNumber);
    else summary.readyRowNumbers.push(rowNumber);
  });

  return { summary, issues, creates: { talentDatabaseProfiles: summary.readyRowNumbers.length } };
}

function classifyRequisitionRows(rows) {
  const summary = createSummaryBase(rows.length);
  const issues = {
    missingPositionTitle: [],
    invalidDepartment: [],
    invalidStatus: [],
    reviewFlagged: [],
  };

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const positionTitle = normalize(row["ATS Positions"] || row.Position_Title);
    const department = normalize(row.ATS_Department_Matched);
    const status = normalize(row.Requisition_Status);
    let needsReview = false;

    if (!positionTitle) {
      addIssue(issues, "missingPositionTitle", rowNumber, {});
      needsReview = true;
    }
    if (!department || !VALID_DEPARTMENTS.has(department)) {
      addIssue(issues, "invalidDepartment", rowNumber, { value: row.ATS_Department_Matched });
      needsReview = true;
    }
    if (!status || !VALID_REQUISITION_STATUSES.has(status)) {
      addIssue(issues, "invalidStatus", rowNumber, { value: row.Requisition_Status });
      needsReview = true;
    }
    if (hasValue(row.Review_Flag)) {
      addIssue(issues, "reviewFlagged", rowNumber, { reviewFlag: String(row.Review_Flag).trim() });
      needsReview = true;
    }

    if (needsReview) summary.reviewRowNumbers.push(rowNumber);
    else summary.readyRowNumbers.push(rowNumber);
  });

  return { summary, issues, creates: { requisitions: summary.readyRowNumbers.length } };
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

function classifyPipelineRows(rows, requisitionLookup) {
  const summary = createSummaryBase(rows.length);
  const issues = {
    missingCandidateName: [],
    missingPosition: [],
    invalidCurrentStage: [],
    unmatchedRequisitions: [],
    reviewFlagged: [],
  };

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const candidateName = normalize(row.Candidate_Name);
    const position = normalize(row.Position_Title);
    const stage = normalize(row.Current_Stage);
    let needsReview = false;

    if (!candidateName) {
      addIssue(issues, "missingCandidateName", rowNumber, {});
      needsReview = true;
    }
    if (!position) {
      addIssue(issues, "missingPosition", rowNumber, {});
      needsReview = true;
    }
    if (!stage || !VALID_PIPELINE_STAGES.has(stage)) {
      addIssue(issues, "invalidCurrentStage", rowNumber, { value: row.Current_Stage });
      needsReview = true;
    }
    if (position && !requisitionLookup.has(position)) {
      addIssue(issues, "unmatchedRequisitions", rowNumber, { positionTitle: row.Position_Title });
      needsReview = true;
    }
    if (hasValue(row.Review_Flag)) {
      addIssue(issues, "reviewFlagged", rowNumber, { reviewFlag: String(row.Review_Flag).trim() });
      needsReview = true;
    }

    if (needsReview) summary.reviewRowNumbers.push(rowNumber);
    else summary.readyRowNumbers.push(rowNumber);
  });

  return {
    summary,
    issues,
    creates: { activeHiringPipelineApplications: summary.readyRowNumbers.length },
  };
}

function classifyInterviewRows(rows, requisitionLookup) {
  const summary = createSummaryBase(rows.length);
  const issues = {
    missingCandidateOrPosition: [],
    invalidInterviewType: [],
    invalidInterviewStatus: [],
    invalidInterviewDate: [],
    unmatchedRequisitions: [],
    reviewFlagged: [],
  };

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const candidateName = normalize(row.Candidate_Name);
    const position = normalize(row.Position_Title);
    const type = normalize(row.Interview_Type);
    const status = normalize(row.Interview_Status);
    const parsedDate = parseDateValue(row.Interview_Date);
    let needsReview = false;

    if (!candidateName || !position) {
      addIssue(issues, "missingCandidateOrPosition", rowNumber, {});
      needsReview = true;
    }
    if (!type || !VALID_INTERVIEW_TYPES.has(type)) {
      addIssue(issues, "invalidInterviewType", rowNumber, { value: row.Interview_Type });
      needsReview = true;
    }
    if (!status || !VALID_INTERVIEW_STATUSES.has(status)) {
      addIssue(issues, "invalidInterviewStatus", rowNumber, { value: row.Interview_Status });
      needsReview = true;
    }
    if (!parsedDate) {
      addIssue(issues, "invalidInterviewDate", rowNumber, { value: row.Interview_Date });
      needsReview = true;
    }
    if (position && !requisitionLookup.has(position)) {
      addIssue(issues, "unmatchedRequisitions", rowNumber, { positionTitle: row.Position_Title });
      needsReview = true;
    }
    if (hasValue(row.Review_Flag)) {
      addIssue(issues, "reviewFlagged", rowNumber, { reviewFlag: String(row.Review_Flag).trim() });
      needsReview = true;
    }

    if (needsReview) summary.reviewRowNumbers.push(rowNumber);
    else summary.readyRowNumbers.push(rowNumber);
  });

  return { summary, issues, creates: { interviewsOrScorecards: summary.readyRowNumbers.length } };
}

function classifyOfferRows(rows, requisitionLookup) {
  const summary = createSummaryBase(rows.length);
  const issues = {
    missingCandidateOrPosition: [],
    invalidOfferApprovalStatus: [],
    invalidCandidateOutcome: [],
    unmatchedRequisitions: [],
    reviewFlagged: [],
  };

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const candidateName = normalize(row.Candidate_Name);
    const position = normalize(row.Position_Title);
    const approvalStatus = normalize(row.Offer_Approval_Status);
    const candidateOutcome = normalize(row.Candidate_Offer_Status);
    let needsReview = false;

    if (!candidateName || !position) {
      addIssue(issues, "missingCandidateOrPosition", rowNumber, {});
      needsReview = true;
    }
    if (!approvalStatus || !VALID_OFFER_APPROVAL_STATUSES.has(approvalStatus)) {
      addIssue(issues, "invalidOfferApprovalStatus", rowNumber, { value: row.Offer_Approval_Status });
      needsReview = true;
    }
    if (!candidateOutcome || !VALID_CANDIDATE_OUTCOMES.has(candidateOutcome)) {
      addIssue(issues, "invalidCandidateOutcome", rowNumber, { value: row.Candidate_Offer_Status });
      needsReview = true;
    }
    if (position && !requisitionLookup.has(position)) {
      addIssue(issues, "unmatchedRequisitions", rowNumber, { positionTitle: row.Position_Title });
      needsReview = true;
    }
    if (hasValue(row.Review_Flag)) {
      addIssue(issues, "reviewFlagged", rowNumber, { reviewFlag: String(row.Review_Flag).trim() });
      needsReview = true;
    }

    if (needsReview) summary.reviewRowNumbers.push(rowNumber);
    else summary.readyRowNumbers.push(rowNumber);
  });

  return { summary, issues, creates: { offersOrOutcomes: summary.readyRowNumbers.length } };
}

function makeSheetInfo(workbook) {
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });
    return {
      sheetName,
      rowCount: Math.max(rows.length - 1, 0),
      headers: rows[0] || [],
    };
  });
}

function bucketBy(map, key, value) {
  if (!key) return;
  map.set(key, [...(map.get(key) || []), value]);
}

function makeRequisitionConflictKey(title, department) {
  return `${normalize(title)}||${normalize(department)}`;
}

function makeApplicationConflictKey(candidateId, positionId) {
  return `${candidateId}||${positionId}`;
}

function makeWorkbookApplicationKey(candidateName, positionTitle, department) {
  return `${normalize(candidateName)}||${makeRequisitionConflictKey(positionTitle, department)}`;
}

function makeInterviewConflictKey(candidateId, positionId, interviewType, dateKey) {
  return `${candidateId}||${positionId}||${normalize(interviewType)}||${dateKey || ""}`;
}

function makeOfferConflictKey(candidateId, positionId) {
  return `${candidateId}||${positionId}`;
}

function normalizeInterviewTypeForAts(value) {
  return ATS_INTERVIEW_TYPE_MAP.get(normalize(value)) || null;
}

async function loadAtsState() {
  if (!process.env.DATABASE_URL) {
    return {
      databaseConnected: false,
      reason: "DATABASE_URL is not configured in the current environment.",
    };
  }

  const [
    candidates,
    positions,
    applications,
    interviews,
    offers,
  ] = await Promise.all([
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
        department: { select: { name: true } },
        status: true,
        isActive: true,
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

  const candidateByEmail = new Map();
  const candidateByMobile = new Map();
  const candidateByName = new Map();
  const requisitionByKey = new Map();
  const applicationByKey = new Map();
  const interviewByKey = new Map();
  const offerByKey = new Map();

  for (const candidate of candidates) {
    const nameKey = normalizedFullName(candidate.firstName, candidate.lastName);
    bucketBy(candidateByEmail, normalize(candidate.email), candidate);
    bucketBy(candidateByMobile, normalize(candidate.phone), candidate);
    bucketBy(candidateByName, nameKey, candidate);
  }

  for (const position of positions) {
    const key = makeRequisitionConflictKey(position.title, position.department?.name);
    bucketBy(requisitionByKey, key, position);
  }

  for (const application of applications) {
    const key = makeApplicationConflictKey(application.candidateId, application.positionId);
    bucketBy(applicationByKey, key, application);
  }

  for (const interview of interviews) {
    const key = makeInterviewConflictKey(
      interview.application.candidateId,
      interview.application.positionId,
      interview.type,
      toDateKey(interview.scheduledAt),
    );
    bucketBy(interviewByKey, key, interview);
  }

  for (const offer of offers) {
    const key = makeOfferConflictKey(
      offer.application.candidateId,
      offer.application.positionId,
    );
    bucketBy(offerByKey, key, offer);
  }

  return {
    databaseConnected: true,
    counts: {
      candidates: candidates.length,
      positions: positions.length,
      applications: applications.length,
      interviews: interviews.length,
      offers: offers.length,
    },
    lookups: {
      candidateByEmail,
      candidateByMobile,
      candidateByName,
      requisitionByKey,
      applicationByKey,
      interviewByKey,
      offerByKey,
    },
  };
}

function applyTalentConflicts(rows, sectionResult, atsState) {
  const conflicts = {
    existingCandidateByEmail: [],
    existingCandidateByMobile: [],
    existingCandidateByNormalizedName: [],
    duplicateNeedsReview: [],
  };

  if (!atsState?.databaseConnected) {
    return finalizeSection(
      sectionResult.summary,
      sectionResult.issues,
      sectionResult.creates,
      conflicts,
    );
  }

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const email = normalize(row.Email);
    const mobile = normalize(row.Mobile);
    const name = normalize(row.Candidate_Name);

    const emailMatches = email ? atsState.lookups.candidateByEmail.get(email) || [] : [];
    const mobileMatches = mobile ? atsState.lookups.candidateByMobile.get(mobile) || [] : [];
    const nameMatches = name ? atsState.lookups.candidateByName.get(name) || [] : [];

    if (emailMatches.length > 0) {
      addConflict(conflicts, "existingCandidateByEmail", rowNumber, {
        severity: "review",
        email: row.Email,
        matchedCandidateIds: emailMatches.map((item) => item.id),
      });
    }
    if (mobileMatches.length > 0) {
      addConflict(conflicts, "existingCandidateByMobile", rowNumber, {
        severity: "review",
        mobile: row.Mobile,
        matchedCandidateIds: mobileMatches.map((item) => item.id),
      });
    }
    if (nameMatches.length > 0) {
      addConflict(conflicts, "existingCandidateByNormalizedName", rowNumber, {
        severity: "review",
        candidateName: row.Candidate_Name,
        matchedCandidateIds: nameMatches.map((item) => item.id),
      });
    }
    if (emailMatches.length > 1 || mobileMatches.length > 1 || nameMatches.length > 1) {
      addConflict(conflicts, "duplicateNeedsReview", rowNumber, {
        severity: "review",
        reason: "Multiple ATS candidates match the same workbook row.",
      });
    }
  });

  return finalizeSection(
    sectionResult.summary,
    sectionResult.issues,
    sectionResult.creates,
    conflicts,
  );
}

function applyRequisitionConflicts(rows, sectionResult, atsState) {
  const conflicts = {
    existingRequisitionByPositionDepartment: [],
    safeToCreate: [],
    conflictNeedsReview: [],
  };

  if (!atsState?.databaseConnected) {
    return finalizeSection(
      sectionResult.summary,
      sectionResult.issues,
      sectionResult.creates,
      conflicts,
    );
  }

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const title = row["ATS Positions"] || row.Position_Title;
    const department = row.ATS_Department_Matched;
    const key = makeRequisitionConflictKey(title, department);
    const matches = atsState.lookups.requisitionByKey.get(key) || [];

    if (matches.length > 0) {
      addConflict(conflicts, "existingRequisitionByPositionDepartment", rowNumber, {
        severity: "review",
        matchedPositionIds: matches.map((item) => item.id),
      });
      if (matches.length > 1) {
        addConflict(conflicts, "conflictNeedsReview", rowNumber, {
          severity: "review",
          reason: "Multiple ATS requisitions match the same position title + department.",
        });
      }
    } else {
      addConflict(conflicts, "safeToCreate", rowNumber, { severity: "safe" });
    }
  });

  return finalizeSection(
    sectionResult.summary,
    sectionResult.issues,
    sectionResult.creates,
    conflicts,
  );
}

function buildWorkbookImportState(requisitionRows, talentRows, pipelineRows, workbookOnly) {
  const safeTalentRows = new Set(workbookOnly.talentDatabase.summary.readyRowNumbers);
  const safeRequisitionRows = new Set(
    workbookOnly.hiringRequestsRequisitions.summary.readyRowNumbers,
  );
  const safePipelineRows = new Set(workbookOnly.activeHiringPipeline.summary.readyRowNumbers);

  const safeTalentByEmail = new Map();
  const safeTalentByMobile = new Map();
  const safeTalentByName = new Map();
  const safeRequisitionKeys = new Set();
  const safeWorkbookApplicationKeys = new Set();

  talentRows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    if (!safeTalentRows.has(rowNumber)) return;
    bucketBy(safeTalentByEmail, normalize(row.Email), { rowNumber, row });
    bucketBy(safeTalentByMobile, normalize(row.Mobile), { rowNumber, row });
    bucketBy(safeTalentByName, normalize(row.Candidate_Name), { rowNumber, row });
  });

  requisitionRows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    if (!safeRequisitionRows.has(rowNumber)) return;
    safeRequisitionKeys.add(
      makeRequisitionConflictKey(
        row["ATS Positions"] || row.Position_Title,
        row.ATS_Department_Matched,
      ),
    );
  });

  pipelineRows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    if (!safePipelineRows.has(rowNumber)) return;
    safeWorkbookApplicationKeys.add(
      makeWorkbookApplicationKey(
        row.Candidate_Name,
        row.Position_Title,
        row.ATS_Department_Matched,
      ),
    );
  });

  return {
    safeTalentByEmail,
    safeTalentByMobile,
    safeTalentByName,
    safeRequisitionKeys,
    safeWorkbookApplicationKeys,
  };
}

function resolveWorkbookCandidate(row, atsState) {
  const email = normalize(row.Email);
  const mobile = normalize(row.Mobile);
  const name = normalize(row.Candidate_Name);

  const emailMatches = email ? atsState.lookups.candidateByEmail.get(email) || [] : [];
  const mobileMatches = mobile ? atsState.lookups.candidateByMobile.get(mobile) || [] : [];
  const nameMatches = name ? atsState.lookups.candidateByName.get(name) || [] : [];

  const uniqueIds = new Set([
    ...emailMatches.map((item) => item.id),
    ...mobileMatches.map((item) => item.id),
    ...nameMatches.map((item) => item.id),
  ]);

  if (uniqueIds.size === 1) {
    const match = [...emailMatches, ...mobileMatches, ...nameMatches].find((item) =>
      uniqueIds.has(item.id),
    );
    return { resolved: match, ambiguous: false };
  }

  if (uniqueIds.size > 1) {
    return { resolved: null, ambiguous: true };
  }

  return { resolved: null, ambiguous: false };
}

function resolveWorkbookCandidateAvailability(row, workbookState) {
  const email = normalize(row.Email);
  const mobile = normalize(row.Mobile);
  const name = normalize(row.Candidate_Name);

  const emailMatches = email ? workbookState.safeTalentByEmail.get(email) || [] : [];
  const mobileMatches = mobile ? workbookState.safeTalentByMobile.get(mobile) || [] : [];
  const nameMatches = name ? workbookState.safeTalentByName.get(name) || [] : [];

  const uniqueRows = new Set([
    ...emailMatches.map((item) => item.rowNumber),
    ...mobileMatches.map((item) => item.rowNumber),
    ...nameMatches.map((item) => item.rowNumber),
  ]);

  return {
    available: uniqueRows.size > 0,
    ambiguous: uniqueRows.size > 1,
  };
}

function buildWorkbookTalentRowMap(rows) {
  const map = new Map();
  for (const [index, row] of rows.entries()) {
    const name = normalize(row.Candidate_Name);
    const rowNumber = rowRef(index, row);
    if (name && !map.has(name)) map.set(name, { row, rowNumber });
  }
  return map;
}

function applyPipelineConflicts(rows, talentRows, sectionResult, atsState, workbookState) {
  const conflicts = {
    existingApplicationForSameCandidateRequisition: [],
    duplicateApplicationNeedsReview: [],
    blockedBecauseRequisitionUnmatched: [],
    blockedBecauseCandidateUnmatched: [],
    safeToCreate: [],
  };

  if (!atsState?.databaseConnected) {
    return finalizeSection(
      sectionResult.summary,
      sectionResult.issues,
      sectionResult.creates,
      conflicts,
    );
  }

  const workbookTalentMap = buildWorkbookTalentRowMap(talentRows);

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const talentRow = workbookTalentMap.get(normalize(row.Candidate_Name));
    const candidateResolution = resolveWorkbookCandidate(
      talentRow?.row || row,
      atsState,
    );
    const workbookCandidateResolution = resolveWorkbookCandidateAvailability(
      talentRow?.row || row,
      workbookState,
    );
    const requisitionKey = makeRequisitionConflictKey(
      row.Position_Title,
      row.ATS_Department_Matched,
    );
    const positions = atsState.lookups.requisitionByKey.get(requisitionKey) || [];
    const requisitionAvailableInWorkbook = workbookState.safeRequisitionKeys.has(requisitionKey);

    if (positions.length === 0 && !requisitionAvailableInWorkbook) {
      addConflict(conflicts, "blockedBecauseRequisitionUnmatched", rowNumber, {
        severity: "blocked",
        positionTitle: row.Position_Title,
      });
      return;
    }

    if (!candidateResolution.resolved && !workbookCandidateResolution.available) {
      addConflict(conflicts, "blockedBecauseCandidateUnmatched", rowNumber, {
        severity: "blocked",
        candidateName: row.Candidate_Name,
      });
      return;
    }
    if (candidateResolution.ambiguous || workbookCandidateResolution.ambiguous) {
      addConflict(conflicts, "duplicateApplicationNeedsReview", rowNumber, {
        severity: "review",
        reason: "Candidate match is ambiguous across ATS or workbook-safe talent rows.",
      });
      return;
    }

    const matches = positions.flatMap((position) =>
      atsState.lookups.applicationByKey.get(
        makeApplicationConflictKey(candidateResolution.resolved.id, position.id),
      ) || [],
    );

    if (matches.length > 0) {
      addConflict(conflicts, "existingApplicationForSameCandidateRequisition", rowNumber, {
        severity: "review",
        matchedApplicationIds: matches.map((item) => item.id),
      });
      if (matches.length > 1) {
        addConflict(conflicts, "duplicateApplicationNeedsReview", rowNumber, {
          severity: "review",
          reason: "Multiple ATS applications already exist for the same candidate + requisition.",
        });
      }
    } else {
      addConflict(conflicts, "safeToCreate", rowNumber, { severity: "safe" });
    }
  });

  return finalizeSection(
    sectionResult.summary,
    sectionResult.issues,
    sectionResult.creates,
    conflicts,
  );
}

function applyInterviewConflicts(rows, talentRows, sectionResult, atsState, workbookState) {
  const conflicts = {
    existingInterviewForSameCandidateRequisitionTypeDate: [],
    duplicateInterviewNeedsReview: [],
    blockedBecauseCandidateRequisitionApplicationUnmatched: [],
    safeToCreate: [],
  };

  if (!atsState?.databaseConnected) {
    return finalizeSection(
      sectionResult.summary,
      sectionResult.issues,
      sectionResult.creates,
      conflicts,
    );
  }

  const workbookTalentMap = buildWorkbookTalentRowMap(talentRows);

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const talentRow = workbookTalentMap.get(normalize(row.Candidate_Name));
    const candidateResolution = resolveWorkbookCandidate(
      talentRow?.row || row,
      atsState,
    );
    const workbookCandidateResolution = resolveWorkbookCandidateAvailability(
      talentRow?.row || row,
      workbookState,
    );
    const requisitionKey = makeRequisitionConflictKey(
      row.Position_Title,
      row.ATS_Department_Matched,
    );
    const positions = atsState.lookups.requisitionByKey.get(requisitionKey) || [];
    const requisitionAvailableInWorkbook = workbookState.safeRequisitionKeys.has(requisitionKey);
    const interviewType = normalizeInterviewTypeForAts(row.Interview_Type);
    const interviewDateKey = toDateKey(row.Interview_Date);

    if (
      (positions.length === 0 && !requisitionAvailableInWorkbook) ||
      (!candidateResolution.resolved && !workbookCandidateResolution.available) ||
      candidateResolution.ambiguous ||
      workbookCandidateResolution.ambiguous
    ) {
      addConflict(conflicts, "blockedBecauseCandidateRequisitionApplicationUnmatched", rowNumber, {
        severity: "blocked",
        candidateName: row.Candidate_Name,
        positionTitle: row.Position_Title,
      });
      return;
    }

    const applicationMatches = positions.flatMap((position) =>
      atsState.lookups.applicationByKey.get(
        makeApplicationConflictKey(candidateResolution.resolved.id, position.id),
      ) || [],
    );
    const workbookApplicationAvailable = workbookState.safeWorkbookApplicationKeys.has(
      makeWorkbookApplicationKey(
        row.Candidate_Name,
        row.Position_Title,
        row.ATS_Department_Matched,
      ),
    );

    if (
      (applicationMatches.length === 0 && !workbookApplicationAvailable) ||
      !interviewType ||
      !interviewDateKey
    ) {
      addConflict(conflicts, "blockedBecauseCandidateRequisitionApplicationUnmatched", rowNumber, {
        severity: "blocked",
        reason: "Candidate, requisition, application, type, or date could not be resolved.",
      });
      return;
    }

    const interviewMatches = positions.flatMap((position) =>
      atsState.lookups.interviewByKey.get(
        makeInterviewConflictKey(
          candidateResolution.resolved.id,
          position.id,
          interviewType,
          interviewDateKey,
        ),
      ) || [],
    );

    if (interviewMatches.length > 0) {
      addConflict(conflicts, "existingInterviewForSameCandidateRequisitionTypeDate", rowNumber, {
        severity: "review",
        matchedInterviewIds: interviewMatches.map((item) => item.id),
      });
      if (interviewMatches.length > 1) {
        addConflict(conflicts, "duplicateInterviewNeedsReview", rowNumber, {
          severity: "review",
          reason: "Multiple ATS interviews already match the same candidate + requisition + type + date.",
        });
      }
    } else {
      addConflict(conflicts, "safeToCreate", rowNumber, { severity: "safe" });
    }
  });

  return finalizeSection(
    sectionResult.summary,
    sectionResult.issues,
    sectionResult.creates,
    conflicts,
  );
}

function applyOfferConflicts(rows, talentRows, sectionResult, atsState, workbookState) {
  const conflicts = {
    existingOfferOutcomeForSameCandidateRequisition: [],
    duplicateNeedsReview: [],
    blockedBecauseCandidateRequisitionApplicationUnmatched: [],
    safeToCreate: [],
  };

  if (!atsState?.databaseConnected) {
    return finalizeSection(
      sectionResult.summary,
      sectionResult.issues,
      sectionResult.creates,
      conflicts,
    );
  }

  const workbookTalentMap = buildWorkbookTalentRowMap(talentRows);

  rows.forEach((row, index) => {
    const rowNumber = rowRef(index, row);
    const talentRow = workbookTalentMap.get(normalize(row.Candidate_Name));
    const candidateResolution = resolveWorkbookCandidate(
      talentRow?.row || row,
      atsState,
    );
    const workbookCandidateResolution = resolveWorkbookCandidateAvailability(
      talentRow?.row || row,
      workbookState,
    );
    const requisitionKey = makeRequisitionConflictKey(
      row.Position_Title,
      row.ATS_Department_Matched,
    );
    const positions = atsState.lookups.requisitionByKey.get(requisitionKey) || [];
    const requisitionAvailableInWorkbook = workbookState.safeRequisitionKeys.has(requisitionKey);

    if (
      (positions.length === 0 && !requisitionAvailableInWorkbook) ||
      (!candidateResolution.resolved && !workbookCandidateResolution.available) ||
      candidateResolution.ambiguous ||
      workbookCandidateResolution.ambiguous
    ) {
      addConflict(conflicts, "blockedBecauseCandidateRequisitionApplicationUnmatched", rowNumber, {
        severity: "blocked",
        candidateName: row.Candidate_Name,
        positionTitle: row.Position_Title,
      });
      return;
    }

    const workbookApplicationAvailable = workbookState.safeWorkbookApplicationKeys.has(
      makeWorkbookApplicationKey(
        row.Candidate_Name,
        row.Position_Title,
        row.ATS_Department_Matched,
      ),
    );
    const offerMatches = positions.flatMap((position) =>
      atsState.lookups.offerByKey.get(
        makeOfferConflictKey(candidateResolution.resolved.id, position.id),
      ) || [],
    );

    const applicationMatches = candidateResolution.resolved
      ? positions.flatMap((position) =>
          atsState.lookups.applicationByKey.get(
            makeApplicationConflictKey(candidateResolution.resolved.id, position.id),
          ) || [],
        )
      : [];

    if (applicationMatches.length === 0 && !workbookApplicationAvailable) {
      addConflict(conflicts, "blockedBecauseCandidateRequisitionApplicationUnmatched", rowNumber, {
        severity: "blocked",
        reason: "Candidate, requisition, or application could not be resolved.",
      });
      return;
    }

    if (offerMatches.length > 0) {
      addConflict(conflicts, "existingOfferOutcomeForSameCandidateRequisition", rowNumber, {
        severity: "review",
        matchedOfferIds: offerMatches.map((item) => item.id),
      });
      if (offerMatches.length > 1) {
        addConflict(conflicts, "duplicateNeedsReview", rowNumber, {
          severity: "review",
          reason: "Multiple ATS offers already exist for the same candidate + requisition.",
        });
      }
    } else {
      addConflict(conflicts, "safeToCreate", rowNumber, { severity: "safe" });
    }
  });

  return finalizeSection(
    sectionResult.summary,
    sectionResult.issues,
    sectionResult.creates,
    conflicts,
  );
}

function recommendedImportOrder(sections) {
  return [
    {
      step: 1,
      module: "Talent Database",
      rationale: "Candidate profiles should exist before any applications, interviews, or offers can be linked safely.",
      safeRows: sections.talentDatabase.readyRows,
      blockedRows: sections.talentDatabase.blockedByConflicts,
    },
    {
      step: 2,
      module: "Hiring Requests / Requisitions",
      rationale: "Requisitions should be created before pipeline applications, interviews, and offers reference them.",
      safeRows: sections.hiringRequestsRequisitions.readyRows,
      blockedRows: sections.hiringRequestsRequisitions.blockedByConflicts,
    },
    {
      step: 3,
      module: "Active Hiring Pipeline",
      rationale: "Applications depend on both candidate profiles and requisitions existing first.",
      safeRows: sections.activeHiringPipeline.readyRows,
      blockedRows: sections.activeHiringPipeline.blockedByConflicts,
    },
    {
      step: 4,
      module: "Interviews / Scorecards",
      rationale: "Interview and scorecard records should only follow once candidate applications are present.",
      safeRows: sections.interviewsScorecards.readyRows,
      blockedRows: sections.interviewsScorecards.blockedByConflicts,
    },
    {
      step: 5,
      module: "Offers / Outcomes",
      rationale: "Offer records should be imported last because they depend on candidate, requisition, and application context.",
      safeRows: sections.offersOutcomes.readyRows,
      blockedRows: sections.offersOutcomes.blockedByConflicts,
    },
  ];
}

function renderSectionTable(title, section) {
  const lines = [
    "",
    `=== ${title} ===`,
    `Total rows: ${section.totalRows}`,
    `Ready rows: ${section.readyRows}`,
    `Rows needing review: ${section.rowsNeedingReview}`,
    `Rows blocked by ATS conflicts: ${section.blockedByConflicts}`,
  ];

  for (const [issueName, details] of Object.entries(section.issues)) {
    lines.push(`- issue.${issueName}: ${details.count}`);
  }
  for (const [conflictName, details] of Object.entries(section.conflicts || {})) {
    lines.push(`- conflict.${conflictName}: ${details.count}`);
  }
  for (const [createName, count] of Object.entries(section.creates || {})) {
    lines.push(`- create.${createName}: ${count}`);
  }
  return lines.join("\n");
}

async function main() {
  const workbook = XLSX.readFile(workbookPath);
  const sheetInfo = makeSheetInfo(workbook);

  const requisitionRows = toRows(workbook.Sheets[SHEETS.requisitions]);
  const talentRows = toRows(workbook.Sheets[SHEETS.talent]);
  const pipelineRows = toRows(workbook.Sheets[SHEETS.pipeline]);
  const interviewRows = toRows(workbook.Sheets[SHEETS.interviews]);
  const offerRows = toRows(workbook.Sheets[SHEETS.offers]);

  const requisitionLookup = buildRequisitionLookup(requisitionRows);

  const workbookOnly = {
    talentDatabase: classifyTalentRows(talentRows),
    activeHiringPipeline: classifyPipelineRows(pipelineRows, requisitionLookup),
    hiringRequestsRequisitions: classifyRequisitionRows(requisitionRows),
    interviewsScorecards: classifyInterviewRows(interviewRows, requisitionLookup),
    offersOutcomes: classifyOfferRows(offerRows, requisitionLookup),
  };
  const workbookState = buildWorkbookImportState(
    requisitionRows,
    talentRows,
    pipelineRows,
    workbookOnly,
  );

  let atsState;
  try {
    atsState = await loadAtsState();
  } catch (error) {
    atsState = {
      databaseConnected: false,
      reason: error.message,
    };
  }

  const sections = {
    talentDatabase: applyTalentConflicts(
      talentRows,
      workbookOnly.talentDatabase,
      atsState,
    ),
    hiringRequestsRequisitions: applyRequisitionConflicts(
      requisitionRows,
      workbookOnly.hiringRequestsRequisitions,
      atsState,
    ),
    activeHiringPipeline: applyPipelineConflicts(
      pipelineRows,
      talentRows,
      workbookOnly.activeHiringPipeline,
      atsState,
      workbookState,
    ),
    interviewsScorecards: applyInterviewConflicts(
      interviewRows,
      talentRows,
      workbookOnly.interviewsScorecards,
      atsState,
      workbookState,
    ),
    offersOutcomes: applyOfferConflicts(
      offerRows,
      talentRows,
      workbookOnly.offersOutcomes,
      atsState,
      workbookState,
    ),
  };

  const preview = {
    workbookPath,
    mode: "preview-only",
    generatedAt: new Date().toISOString(),
    database: atsState.databaseConnected
      ? {
          connected: true,
          counts: atsState.counts,
          mode: "read-only validation",
        }
      : {
          connected: false,
          reason: atsState.reason,
          mode: "workbook-only preview",
        },
    sheetCount: workbook.SheetNames.length,
    sheets: sheetInfo,
    sections,
    totals: {
      safeToImport: Object.values(sections).reduce((sum, section) => sum + section.readyRows, 0),
      blockedBySourceOfTruthConflicts: Object.values(sections).reduce(
        (sum, section) => sum + section.blockedByConflicts,
        0,
      ),
      rowsNeedingReview: Object.values(sections).reduce(
        (sum, section) => sum + section.rowsNeedingReview,
        0,
      ),
      duplicateCounts: {
        talent: (sections.talentDatabase.conflicts.duplicateNeedsReview?.count || 0) +
          (sections.talentDatabase.issues.duplicateCandidates?.count || 0),
        pipelineApplications:
          sections.activeHiringPipeline.conflicts.duplicateApplicationNeedsReview?.count || 0,
        interviews:
          sections.interviewsScorecards.conflicts.duplicateInterviewNeedsReview?.count || 0,
        offers: sections.offersOutcomes.conflicts.duplicateNeedsReview?.count || 0,
      },
      unmatchedCounts: {
        pipeline: sections.activeHiringPipeline.issues.unmatchedRequisitions?.count || 0,
        interviews: sections.interviewsScorecards.issues.unmatchedRequisitions?.count || 0,
        offers: sections.offersOutcomes.issues.unmatchedRequisitions?.count || 0,
      },
    },
    recommendedImportOrder: recommendedImportOrder(sections),
  };

  const readableSummary = [
    "HISTORICAL ATS IMPORT PREVIEW",
    `Workbook: ${workbookPath}`,
    `Generated: ${preview.generatedAt}`,
    `Database connected: ${preview.database.connected ? "yes" : "no"}`,
    preview.database.connected ? "" : `Database note: ${preview.database.reason}`,
    "",
    `Total safe rows: ${preview.totals.safeToImport}`,
    `Total blocked by ATS source-of-truth conflicts: ${preview.totals.blockedBySourceOfTruthConflicts}`,
    `Total rows needing review: ${preview.totals.rowsNeedingReview}`,
    renderSectionTable("Talent Database", preview.sections.talentDatabase),
    renderSectionTable("Active Hiring Pipeline", preview.sections.activeHiringPipeline),
    renderSectionTable("Hiring Requests / Requisitions", preview.sections.hiringRequestsRequisitions),
    renderSectionTable("Interviews / Scorecards", preview.sections.interviewsScorecards),
    renderSectionTable("Offers / Outcomes", preview.sections.offersOutcomes),
    "",
    "=== Recommended Import Order ===",
    ...preview.recommendedImportOrder.map((step) =>
      `${step.step}. ${step.module} — safe rows: ${step.safeRows}, blocked rows: ${step.blockedRows}. ${step.rationale}`,
    ),
  ].filter(Boolean).join("\n");

  console.log(JSON.stringify(preview, null, 2));
  console.log("\n--- READABLE SUMMARY ---\n");
  console.log(readableSummary);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
