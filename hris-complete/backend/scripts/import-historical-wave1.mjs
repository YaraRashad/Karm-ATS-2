import "dotenv/config";
import path from "path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { prisma } from "../src/lib/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workbookPath =
  process.argv[2] ||
  "/Users/yaraessam/Downloads/Copy of Karm_ATS_Matched_Scorecard_Import.xlsx";

const executeMode = process.env.WAVE1_IMPORT_CONFIRM === "IMPORT_WAVE1";
const expectedTalentCount = Number(process.env.WAVE1_EXPECT_TALENT || 148);
const expectedRequisitionCount = Number(process.env.WAVE1_EXPECT_REQUISITIONS || 30);

const previewScriptPath = path.join(__dirname, "import-historical-preview.mjs");

const SHEETS = {
  requisitions: "Hiring_Requests_Requisitions",
  talent: "Talent_Database",
};

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

const statusMap = new Map([
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

function rowRef(index, row) {
  const sourceRow = Number(row.Source_Row || row.sourceRow || 0);
  return sourceRow > 0 ? sourceRow : index + 2;
}

function splitName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function parseDateOrNull(value) {
  if (!hasValue(value)) return null;
  const parsed = new Date(String(value).trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function makePositionKey(title, departmentId) {
  return `${normalize(title)}||${departmentId}`;
}

function normalizeEntity(value) {
  return entityMap.get(normalize(value)) || null;
}

function normalizeStatus(value) {
  return statusMap.get(normalize(value)) || null;
}

function normalizePriority(value) {
  return priorityMap.get(normalize(value)) || "normal";
}

function normalizeSource(value) {
  return sourceMap.get(normalize(value)) || "other";
}

function parsePreviewOutput(stdout) {
  const marker = "\n\n--- READABLE SUMMARY ---";
  const jsonText = stdout.includes(marker) ? stdout.slice(0, stdout.indexOf(marker)) : stdout;
  return JSON.parse(jsonText);
}

function runPreview(workbook) {
  const stdout = execFileSync("node", [previewScriptPath, workbook], {
    cwd: __dirname,
    encoding: "utf8",
  });
  return parsePreviewOutput(stdout);
}

function makeSectionRowMap(rows) {
  const map = new Map();
  rows.forEach((row, index) => {
    map.set(rowRef(index, row), row);
  });
  return map;
}

function buildReadableSummary(summary) {
  return [
    "WAVE 1 HISTORICAL IMPORT PLAN",
    `Workbook: ${summary.workbookPath}`,
    `Mode: ${summary.mode}`,
    `Preview generated at: ${summary.previewGeneratedAt}`,
    `Database connected: ${summary.databaseConnected ? "yes" : "no"}`,
    "",
    `Talent rows approved by preview: ${summary.previewScope.talentApproved}`,
    `Talent rows importable now: ${summary.importable.talent}`,
    `Talent rows blocked at execution: ${summary.blocked.talent}`,
    `Requisition rows approved by preview: ${summary.previewScope.requisitionsApproved}`,
    `Requisition rows importable now: ${summary.importable.requisitions}`,
    `Requisition rows blocked at execution: ${summary.blocked.requisitions}`,
    "",
    "Blocking reasons",
    `- missing live department matches: ${summary.blockReasons.missingDepartments}`,
    `- candidate email already exists: ${summary.blockReasons.existingCandidateEmail}`,
    `- requisition already exists live: ${summary.blockReasons.existingRequisition}`,
    `- unmapped entity/status rows: ${summary.blockReasons.invalidMappings}`,
    "",
    executeMode
      ? "Execution guard is ON: script would write Talent + Requisition Wave 1 scope."
      : "Execution guard is OFF: dry-run only, no writes performed.",
  ].join("\n");
}

async function main() {
  const preview = runPreview(workbookPath);
  if (!preview.database?.connected) {
    throw new Error(
      "Wave 1 import requires the preview validator to connect to the ATS database. Run this in the Azure backend environment with DATABASE_URL configured.",
    );
  }

  const talentApproved = preview.sections?.talentDatabase?.readyRowNumbers || [];
  const requisitionApproved =
    preview.sections?.hiringRequestsRequisitions?.readyRowNumbers || [];

  const workbook = XLSX.readFile(workbookPath);
  const talentRows = toRows(workbook.Sheets[SHEETS.talent]);
  const requisitionRows = toRows(workbook.Sheets[SHEETS.requisitions]);
  const talentByRowNumber = makeSectionRowMap(talentRows);
  const requisitionByRowNumber = makeSectionRowMap(requisitionRows);

  const [departments, users, existingCandidates, existingPositions] = await Promise.all([
    prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, entity: true },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
    prisma.candidate.findMany({
      where: {
        email: {
          in: talentApproved
            .map((rowNumber) => talentByRowNumber.get(rowNumber)?.Email)
            .filter(Boolean),
        },
      },
      select: { id: true, email: true },
    }),
    prisma.position.findMany({
      select: {
        id: true,
        title: true,
        departmentId: true,
      },
    }),
  ]);

  const departmentByKey = new Map(
    departments.map((department) => [
      `${normalize(department.name)}||${department.entity}`,
      department,
    ]),
  );
  const userByName = new Map(
    users.map((user) => [
      normalize(`${user.firstName || ""} ${user.lastName || ""}`),
      user,
    ]),
  );
  const existingCandidateEmails = new Set(
    existingCandidates.map((candidate) => normalize(candidate.email)),
  );
  const existingPositionKeys = new Set(
    existingPositions.map((position) => makePositionKey(position.title, position.departmentId)),
  );

  const talentCreatePlan = [];
  const requisitionCreatePlan = [];
  const blocked = {
    talent: [],
    requisitions: [],
  };
  const blockReasons = {
    missingDepartments: 0,
    existingCandidateEmail: 0,
    existingRequisition: 0,
    invalidMappings: 0,
  };

  for (const rowNumber of talentApproved) {
    const row = talentByRowNumber.get(rowNumber);
    if (!row) {
      blocked.talent.push({ rowNumber, reason: "Workbook row missing." });
      blockReasons.invalidMappings += 1;
      continue;
    }

    const email = String(row.Email || "").trim().toLowerCase();
    if (!email) {
      blocked.talent.push({ rowNumber, reason: "Email is required by ATS candidate schema." });
      blockReasons.invalidMappings += 1;
      continue;
    }
    if (existingCandidateEmails.has(normalize(email))) {
      blocked.talent.push({ rowNumber, reason: "Candidate email already exists in ATS.", email });
      blockReasons.existingCandidateEmail += 1;
      continue;
    }

    const { firstName, lastName } = splitName(row.Candidate_Name);
    talentCreatePlan.push({
      rowNumber,
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
    });
  }

  for (const rowNumber of requisitionApproved) {
    const row = requisitionByRowNumber.get(rowNumber);
    if (!row) {
      blocked.requisitions.push({ rowNumber, reason: "Workbook row missing." });
      blockReasons.invalidMappings += 1;
      continue;
    }

    const entity = normalizeEntity(row.Entity);
    const status = normalizeStatus(row.Requisition_Status);
    if (!entity || !status) {
      blocked.requisitions.push({
        rowNumber,
        reason: "Entity or requisition status could not be mapped to ATS enums.",
      });
      blockReasons.invalidMappings += 1;
      continue;
    }

    const department = departmentByKey.get(
      `${normalize(row.ATS_Department_Matched)}||${entity}`,
    );
    if (!department) {
      blocked.requisitions.push({
        rowNumber,
        reason: "Matching live department does not exist in ATS.",
        department: row.ATS_Department_Matched,
        entity,
      });
      blockReasons.missingDepartments += 1;
      continue;
    }

    const existingKey = makePositionKey(row["ATS Positions"] || row.Position_Title, department.id);
    if (existingPositionKeys.has(existingKey)) {
      blocked.requisitions.push({
        rowNumber,
        reason: "Requisition already exists in ATS for the same title + department.",
      });
      blockReasons.existingRequisition += 1;
      continue;
    }

    const recruiter = userByName.get(normalize(row.Recruiter));
    const openDate = parseDateOrNull(row.Request_Date);
    const isClosed = status === "closed";

    requisitionCreatePlan.push({
      rowNumber,
      data: {
        title: String(row["ATS Positions"] || row.Position_Title || "").trim(),
        departmentId: department.id,
        entity,
        seniority: "mid",
        employmentType: "full_time",
        currency: currencyByEntity[entity] || "EGP",
        salaryMin: 0,
        salaryMax: 1,
        priority: normalizePriority(row.Priority),
        headcountStatus: status === "pending_approval" ? "pending" : "approved",
        headcountRationale: hasValue(row.Position_Type)
          ? String(row.Position_Type).trim()
          : "Manpower",
        recruiterId: recruiter?.id || null,
        status,
        description: hasValue(row.Notes) ? String(row.Notes).trim() : null,
        requirements: [],
        openDate: openDate && status !== "draft" ? openDate : null,
        closedDate: isClosed ? openDate : null,
        isActive: !isClosed,
      },
    });
  }

  const summary = {
    workbookPath,
    mode: executeMode ? "execute" : "dry-run",
    previewGeneratedAt: preview.generatedAt,
    databaseConnected: true,
    previewScope: {
      talentApproved: talentApproved.length,
      requisitionsApproved: requisitionApproved.length,
    },
    importable: {
      talent: talentCreatePlan.length,
      requisitions: requisitionCreatePlan.length,
    },
    blocked: {
      talent: blocked.talent.length,
      requisitions: blocked.requisitions.length,
    },
    blockReasons,
    rowNumbers: {
      talent: talentCreatePlan.map((item) => item.rowNumber),
      requisitions: requisitionCreatePlan.map((item) => item.rowNumber),
    },
    blockedRows: blocked,
  };

  if (talentCreatePlan.length !== expectedTalentCount) {
    throw new Error(
      `Approved Talent scope drifted: expected ${expectedTalentCount}, got ${talentCreatePlan.length}. Re-run approval before importing.`,
    );
  }
  if (requisitionCreatePlan.length !== expectedRequisitionCount) {
    throw new Error(
      `Approved Requisition scope drifted: expected ${expectedRequisitionCount}, got ${requisitionCreatePlan.length}. Re-run approval before importing.`,
    );
  }

  if (executeMode) {
    const unexpectedTalentBlocks = Math.max(0, expectedTalentCount - talentCreatePlan.length);
    const unexpectedRequisitionBlocks = Math.max(
      0,
      expectedRequisitionCount - requisitionCreatePlan.length,
    );

    if (unexpectedTalentBlocks > 0 || unexpectedRequisitionBlocks > 0) {
      throw new Error(
        `Wave 1 execution aborted: ${unexpectedTalentBlocks} talent rows and ${unexpectedRequisitionBlocks} requisition rows from the approved scope are still blocked.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const item of talentCreatePlan) {
        await tx.candidate.create({ data: item.data });
      }
      for (const item of requisitionCreatePlan) {
        await tx.position.create({ data: item.data });
      }
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  console.log("\n--- READABLE SUMMARY ---\n");
  console.log(buildReadableSummary(summary));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
