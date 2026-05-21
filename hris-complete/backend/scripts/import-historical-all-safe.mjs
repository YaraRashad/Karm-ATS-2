import "dotenv/config";
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

function isTalentWorkbookSafe(row, diagnostics) {
  const email = normalize(row.Email);
  const mobile = normalize(row.Mobile);
  const name = normalize(row.Candidate_Name);
  if (!name) return false;
  if (!email && !mobile) return false;
  if (hasValue(row.Review_Flag)) return false;
  if (email && (diagnostics.byEmail.get(email) || []).length > 1) return false;
  if (mobile && (diagnostics.byMobile.get(mobile) || []).length > 1) return false;
  if (name && (diagnostics.byName.get(name) || []).length > 1) return false;
  return true;
}

function isRequisitionWorkbookSafe(row) {
  const title = normalize(row["ATS Positions"] || row.Position_Title);
  const department = normalize(row.ATS_Department_Matched);
  const status = normalize(row.Requisition_Status);
  if (!title) return false;
  if (!department || !VALID_DEPARTMENTS.has(department)) return false;
  if (!status || !VALID_REQUISITION_STATUSES.has(status)) return false;
  if (hasValue(row.Review_Flag)) return false;
  return true;
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

function isPipelineWorkbookSafe(row, requisitionLookup) {
  const candidateName = normalize(row.Candidate_Name);
  const position = normalize(row.Position_Title);
  const stage = normalize(row.Current_Stage);
  if (!candidateName || !position) return false;
  if (!stage || !VALID_PIPELINE_STAGES.has(stage)) return false;
  if (!requisitionLookup.has(position)) return false;
  if (hasValue(row.Review_Flag)) return false;
  return true;
}

function isInterviewWorkbookSafe(row, requisitionLookup) {
  const candidateName = normalize(row.Candidate_Name);
  const position = normalize(row.Position_Title);
  const type = normalize(row.Interview_Type);
  const status = normalize(row.Interview_Status);
  if (!candidateName || !position) return false;
  if (!type || !VALID_INTERVIEW_TYPES.has(type)) return false;
  if (!status || !VALID_INTERVIEW_STATUSES.has(status)) return false;
  if (!parseDateOrNull(row.Interview_Date)) return false;
  if (!requisitionLookup.has(position)) return false;
  return true;
}

function isOfferWorkbookSafe(row, requisitionLookup) {
  const candidateName = normalize(row.Candidate_Name);
  const position = normalize(row.Position_Title);
  const approvalStatus = normalize(row.Offer_Approval_Status);
  const candidateOutcome = normalize(row.Candidate_Offer_Status);
  if (!candidateName || !position) return false;
  if (!approvalStatus || !VALID_OFFER_APPROVAL_STATUSES.has(approvalStatus)) return false;
  if (!candidateOutcome || !VALID_CANDIDATE_OUTCOMES.has(candidateOutcome)) return false;
  if (!requisitionLookup.has(position)) return false;
  return true;
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
    importable: {
      talent: 0,
      requisitions: 0,
      applications: 0,
      interviews: 0,
      offers: 0,
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
    if (!isTalentWorkbookSafe(row, talentDiagnostics)) continue;

    const sheetRow = worksheetRow(index);
    const email = String(row.Email || "").trim().toLowerCase();
    if (!email) {
      summary.blocked.talent.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Email is required by the ATS candidate schema.",
      });
      continue;
    }

    if ((state.candidatesByEmail.get(normalize(email)) || []).length > 0) {
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
    if (!isRequisitionWorkbookSafe(row)) continue;

    const sheetRow = worksheetRow(index);
    const entity = normalizeEntity(row.Entity);
    const status = normalizePositionStatus(row.Requisition_Status);
    if (!entity || !status) {
      summary.blocked.requisitions.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Entity or requisition status could not be mapped.",
      });
      continue;
    }

    const department = state.departmentsByKey.get(
      `${normalize(row.ATS_Department_Matched)}||${entity}`,
    );
    if (!department) {
      summary.blocked.requisitions.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Matching live department does not exist in ATS.",
        department: row.ATS_Department_Matched,
        entity,
      });
      continue;
    }

    const workbookKey = makeRequisitionKey(
      row["ATS Positions"] || row.Position_Title,
      row.ATS_Department_Matched,
    );
    const existing = state.positionsByWorkbookKey.get(workbookKey) || [];
    if (existing.length > 0) {
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
    if (!isPipelineWorkbookSafe(row, requisitionLookup)) continue;

    const sheetRow = worksheetRow(index);
    const talentReference = workbookTalentMap.get(normalize(row.Candidate_Name));
    const candidateSourceRow = talentReference?.row || row;
    const liveCandidate = resolveCandidateAgainstLive(candidateSourceRow, state);
    const plannedCandidate = resolveCandidateAgainstPlan(candidateSourceRow, planState);
    if (liveCandidate.ambiguous || plannedCandidate.ambiguous) {
      summary.blocked.applications.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Candidate resolution is ambiguous.",
        candidateName: row.Candidate_Name,
      });
      continue;
    }

    const candidateToken = liveCandidate.value
      ? `live:${liveCandidate.value.id}`
      : plannedCandidate.value?.token;
    if (!candidateToken) {
      summary.blocked.applications.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Candidate is not available in ATS or the executable talent import set.",
        candidateName: row.Candidate_Name,
      });
      continue;
    }

    const requisitionKey = makeRequisitionKey(
      row.Position_Title,
      row.ATS_Department_Matched,
    );
    const livePosition = resolvePositionAgainstLive(requisitionKey, state);
    const plannedPosition = resolvePositionAgainstPlan(requisitionKey, planState);
    if (livePosition.ambiguous) {
      summary.blocked.applications.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Requisition resolution is ambiguous in ATS.",
        positionTitle: row.Position_Title,
      });
      continue;
    }
    const positionToken = livePosition.value
      ? `live:${livePosition.value.id}`
      : plannedPosition.value?.token;
    if (!positionToken) {
      summary.blocked.applications.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Requisition is not available in ATS or the executable requisition import set.",
        positionTitle: row.Position_Title,
      });
      continue;
    }

    const liveAppKey =
      liveCandidate.value && livePosition.value
        ? makeAppToken(candidateToken, positionToken)
        : null;
    if (liveAppKey && (state.applicationsByKey.get(liveAppKey) || []).length > 0) {
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
    if (!isInterviewWorkbookSafe(row, requisitionLookup)) continue;

    const sheetRow = worksheetRow(index);
    const talentReference = workbookTalentMap.get(normalize(row.Candidate_Name));
    const candidateSourceRow = talentReference?.row || row;
    const liveCandidate = resolveCandidateAgainstLive(candidateSourceRow, state);
    const plannedCandidate = resolveCandidateAgainstPlan(candidateSourceRow, planState);
    if (liveCandidate.ambiguous || plannedCandidate.ambiguous) {
      summary.blocked.interviews.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Candidate resolution is ambiguous.",
      });
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
      summary.blocked.interviews.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Requisition resolution is ambiguous in ATS.",
      });
      continue;
    }

    const positionToken = livePosition.value
      ? `live:${livePosition.value.id}`
      : plannedPosition.value?.token;
    if (!candidateToken || !positionToken) {
      summary.blocked.interviews.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Candidate or requisition is not available in ATS or the executable import set.",
      });
      continue;
    }

    const applicationToken = makeAppToken(candidateToken, positionToken);
    const liveApplicationMatches =
      liveCandidate.value && livePosition.value
        ? state.applicationsByKey.get(applicationToken) || []
        : [];
    const plannedApplication = planState.plannedApplicationsByKey.get(applicationToken);
    if (liveApplicationMatches.length === 0 && !plannedApplication) {
      summary.blocked.interviews.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Application is not available in ATS or the executable pipeline import set.",
      });
      continue;
    }

    const interviewerMatch = resolveUserIdentifier(row.Interviewer, state);
    if (interviewerMatch.ambiguous || !interviewerMatch.value) {
      summary.blocked.interviews.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Interviewer could not be uniquely matched to an active ATS user.",
        interviewer: row.Interviewer,
      });
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
      continue;
    }
    if (planState.plannedInterviewsByKey.has(interviewKey)) {
      continue;
    }

    const plan = {
      token: `plan:interview:${sheetRow}`,
      worksheetRow: sheetRow,
      sourceRow: rowRef(index, row),
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
    if (!isOfferWorkbookSafe(row, requisitionLookup)) continue;

    const sheetRow = worksheetRow(index);
    const talentReference = workbookTalentMap.get(normalize(row.Candidate_Name));
    const candidateSourceRow = talentReference?.row || row;
    const liveCandidate = resolveCandidateAgainstLive(candidateSourceRow, state);
    const plannedCandidate = resolveCandidateAgainstPlan(candidateSourceRow, planState);
    if (liveCandidate.ambiguous || plannedCandidate.ambiguous) {
      summary.blocked.offers.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Candidate resolution is ambiguous.",
      });
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
      summary.blocked.offers.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Requisition resolution is ambiguous in ATS.",
      });
      continue;
    }

    const positionToken = livePosition.value
      ? `live:${livePosition.value.id}`
      : plannedPosition.value?.token;
    if (!candidateToken || !positionToken) {
      summary.blocked.offers.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Candidate or requisition is not available in ATS or the executable import set.",
      });
      continue;
    }

    const applicationToken = makeAppToken(candidateToken, positionToken);
    const liveApplicationMatches =
      liveCandidate.value && livePosition.value
        ? state.applicationsByKey.get(applicationToken) || []
        : [];
    const plannedApplication = planState.plannedApplicationsByKey.get(applicationToken);
    if (liveApplicationMatches.length === 0 && !plannedApplication) {
      summary.blocked.offers.push({
        worksheetRow: sheetRow,
        sourceRow: rowRef(index, row),
        reason: "Application is not available in ATS or the executable pipeline import set.",
      });
      continue;
    }

    if (
      liveCandidate.value &&
      livePosition.value &&
      (state.offersByKey.get(applicationToken) || []).length > 0
    ) {
      continue;
    }
    if (planState.plannedOffersByKey.has(applicationToken)) {
      continue;
    }

    const positionRecord = livePosition.value || plannedPosition.value?.data;
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

    await prisma.$transaction(async (tx) => {
      for (const plan of candidatePlans) {
        const created = await tx.candidate.create({ data: plan.data });
        createdCandidateIds.set(plan.token, created.id);
      }

      for (const plan of requisitionPlans) {
        const created = await tx.position.create({ data: plan.data });
        createdPositionIds.set(plan.token, created.id);
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
      }

      for (const plan of interviewPlans) {
        const liveApplicationId = plan.applicationToken.startsWith("live:")
          ? null
          : createdApplicationIds.get(plan.applicationToken);
        const applicationId =
          liveApplicationId ||
          (() => {
            const [candidateToken, positionToken] = plan.applicationToken.split("||");
            if (candidateToken.startsWith("live:") && positionToken.startsWith("live:")) {
              const matches =
                state.applicationsByKey.get(makeAppToken(candidateToken, positionToken)) || [];
              return matches[0]?.id || null;
            }
            return createdApplicationIds.get(makeAppToken(candidateToken, positionToken)) || null;
          })();
        if (!applicationId) continue;
        await tx.interview.create({
          data: {
            applicationId,
            ...plan.data,
          },
        });
      }

      for (const plan of offerPlans) {
        const [candidateToken, positionToken] = plan.applicationToken.split("||");
        let applicationId = null;
        if (candidateToken.startsWith("live:") && positionToken.startsWith("live:")) {
          const matches =
            state.applicationsByKey.get(makeAppToken(candidateToken, positionToken)) || [];
          applicationId = matches[0]?.id || null;
        } else {
          applicationId =
            createdApplicationIds.get(makeAppToken(candidateToken, positionToken)) || null;
        }

        const positionId = plan.positionToken.startsWith("live:")
          ? plan.positionToken.slice(5)
          : createdPositionIds.get(plan.positionToken);
        if (!applicationId || !positionId) continue;

        await tx.offer.create({
          data: {
            applicationId,
            positionId,
            ...plan.data,
          },
        });
      }
    });

    summary.created = {
      talent: candidatePlans.length,
      requisitions: requisitionPlans.length,
      applications: applicationPlans.length,
      interviews: interviewPlans.length,
      offers: offerPlans.length,
    };
  }

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
    `Blocked talent rows: ${summary.blocked.talent.length}`,
    `Blocked requisition rows: ${summary.blocked.requisitions.length}`,
    `Blocked application rows: ${summary.blocked.applications.length}`,
    `Blocked interview rows: ${summary.blocked.interviews.length}`,
    `Blocked offer rows: ${summary.blocked.offers.length}`,
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
