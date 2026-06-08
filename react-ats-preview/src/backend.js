import { PublicClientApplication } from "@azure/msal-browser";

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api/v1";
const MSAL_CLIENT_ID = import.meta.env.VITE_AZURE_AD_CLIENT_ID;
const MSAL_TENANT_ID = import.meta.env.VITE_AZURE_AD_TENANT_ID;

export const authConfigReady = Boolean(MSAL_CLIENT_ID && MSAL_TENANT_ID);

export const msalInstance = authConfigReady
  ? new PublicClientApplication({
      auth: {
        clientId: MSAL_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${MSAL_TENANT_ID}`,
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
      },
    })
  : null;

const TOKEN_KEY = "karm_ats_access_token";
const REFRESH_KEY = "karm_ats_refresh_token";

const entityToApi = {
  "Karm Egypt": "egypt",
  "Karm Cyprus": "cyprus",
  "HoldCo. (UK)": "uk",
  "Sub HoldCo. (NL)": "uk",
  "Karm Tunisia": "tunisia",
  egypt: "egypt",
  cyprus: "cyprus",
  uk: "uk",
  tunisia: "tunisia",
};

const entityLabel = {
  egypt: "Karm Egypt",
  cyprus: "Karm Cyprus",
  uk: "HoldCo. (UK)",
  tunisia: "Karm Tunisia",
};

const sourceToApi = {
  LinkedIn: "linkedin",
  Forasna: "job_board",
  Career: "other",
  "Career Email": "other",
  Referral: "referral",
  "Internal Transfer": "internal",
  Wuzzuf: "job_board",
  wuzzuf: "job_board",
  Indeed: "job_board",
  indeed: "job_board",
  "Direct Application": "direct",
  direct_application: "direct",
  internal_transfer: "internal",
  internal: "internal",
  Headhunt: "agency",
  headhunt: "agency",
  "Recruitment Agency": "agency",
  recruitment_agency: "agency",
  "CV Upload": "direct",
  cv_upload: "direct",
  referral: "referral",
  linkedin: "linkedin",
  career: "other",
  career_email: "other",
  job_board: "job_board",
};

const seniorityToApi = {
  "Top Management": "director",
  "Middle Management": "lead",
  Staff: "mid",
  "Blue Collar - Technicians": "junior",
};

const roleLabel = {
  admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
  interviewer: "Interviewer",
};

const scopeLabel = {
  all_data: "All system data",
  recruitment_data: "All recruitment data",
  assigned_jobs: "Assigned jobs",
  assigned_interviews: "Assigned interviews",
};

export function readSessionTokens() {
  return {
    accessToken: sessionStorage.getItem(TOKEN_KEY),
    refreshToken: sessionStorage.getItem(REFRESH_KEY),
  };
}

export function writeSessionTokens({ accessToken, refreshToken }) {
  if (accessToken) sessionStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) sessionStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearSessionTokens() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

export async function api(path, options = {}, retry = true) {
  const { accessToken } = readSessionTokens();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error(
      `Backend API is not reachable at ${API_BASE}. Start/configure the secure backend and database before signing in.`
    );
  }
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && retry && path !== "/auth/refresh") {
    const { refreshToken } = readSessionTokens();
    if (refreshToken) {
      try {
        const refreshed = await api("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        }, false);
        writeSessionTokens(refreshed);
        return api(path, options, false);
      } catch {
        clearSessionTokens();
      }
    }
  }
  if (!res.ok) {
    const details = body?.error?.errors
      ?.map(e => [e.path || e.param || e.field, e.msg || e.message].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("; ");
    const message = details
      ? `${body?.error?.message || "Validation failed"} — ${details}`
      : body?.error?.message || body?.message || `API request failed (${res.status})`;
    throw new Error(message);
  }
  return body?.data ?? body;
}

export async function fetchFileBlob(path) {
  if (!path) throw new Error("File URL is missing.");
  if (path.startsWith("data:") || path.startsWith("blob:")) {
    return fetch(path).then(res => res.blob());
  }
  const fileUrl = path.startsWith("http")
    ? path
    : `${API_BASE.replace(/\/api\/v1\/?$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const { accessToken } = readSessionTokens();
  const res = await fetch(fileUrl, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) {
    throw new Error(`CV file could not be loaded (${res.status}).`);
  }
  return res.blob();
}

export async function microsoftLogin() {
  if (!msalInstance) throw new Error("Microsoft login is not configured");
  await msalInstance.initialize();
  await msalInstance.loginRedirect({
    scopes: ["openid", "profile", "email"],
    prompt: "select_account",
  });
  return null;
}

export async function completeMicrosoftRedirect() {
  if (!msalInstance) return null;
  await msalInstance.initialize();
  const microsoft = await msalInstance.handleRedirectPromise();
  if (!microsoft?.idToken) return null;
  const session = await api("/auth/microsoft", {
    method: "POST",
    body: JSON.stringify({ idToken: microsoft.idToken }),
  });
  writeSessionTokens(session);
  return session.user;
}

export async function restoreSession() {
  const { accessToken } = readSessionTokens();
  if (!accessToken) return null;
  try {
    return await api("/auth/me");
  } catch {
    clearSessionTokens();
    return null;
  }
}

export async function logout() {
  const { refreshToken } = readSessionTokens();
  try {
    if (refreshToken) {
      await api("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    }
  } finally {
    clearSessionTokens();
    if (msalInstance) {
      await msalInstance.logoutPopup().catch(() => {});
    }
  }
}

const stageLabel = {
  applied: "Applied",
  screening: "HR Screening",
  interview: "1st Interview",
  assessment: "Technical Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

const statusLabel = {
  open: "Open",
  draft: "Draft",
  closed: "Closed",
  on_hold: "On Hold",
  pending_approval: "Pending Approval",
};

const positionStatusToApi = {
  Open: "open",
  Draft: "draft",
  Closed: "closed",
  "On Hold": "on_hold",
  open: "open",
  draft: "draft",
  closed: "closed",
  on_hold: "on_hold",
};

function fullName(person) {
  if (!person) return "";
  if (person.name) return person.name;
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

function mapAuditLog(log) {
  const before = log.before || {};
  const after = log.after || {};
  return {
    id: log.id,
    at: log.createdAt,
    action: String(log.action || "").replace(/_/g, " "),
    user: fullName(log.user) || log.user?.email || "System",
    oldValue: before.stage || before.status || before.role || before.email || "—",
    newValue: after.stage || after.status || after.role || after.email || JSON.stringify(after || {}),
  };
}

function mapUser(user) {
  const name = fullName(user);
  return {
    id: user.id,
    email: user.email,
    fullName: name,
    initials: name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase(),
    role: roleLabel[user.role] || user.role,
    roleKey: user.role,
    department: user.department?.name || "",
    departmentId: user.departmentId,
    accessScope: scopeLabel[user.accessScope] || user.accessScope,
    accessScopeKey: user.accessScope,
    active: user.isActive,
    canViewSalary: !!user.canViewSalary,
    canApproveOffers: !!user.canApproveOffers,
    canApproveRequisitions: !!user.canApproveRequisitions,
    color: "#4f8ef7",
  };
}

export function mapBackendData({ positions = [], candidates = [], applications = [], interviews = [], offers = [], scorecards = [], hiringRequests = [], audit = [], users = [] }) {
  const jobs = positions.map(p => ({
    id: p.id,
    title: p.title,
    dept: p.department?.name || "",
    entity: entityLabel[p.entity] || p.entity || "",
    positionType: p.headcountRationale || p.positionType || "Manpower",
    status: statusLabel[p.status] || p.status,
    level: p.seniority || "",
    headcount: p.headcount || 1,
    openDate: p.openDate?.slice?.(0, 10) || p.createdAt?.slice?.(0, 10) || "",
    recruiterId: p.recruiterId || p.recruiter?.userId || p.recruiter?.user?.id || p.recruiter?.id || "",
    recruiter: fullName(p.recruiter?.user || p.recruiter),
    hiringManagerId: p.hiringManagerId || p.hiringManager?.id || "",
    hiringManager: fullName(p.hiringManager?.user),
    description: p.description || "",
    salaryMin: p.salaryMin || 0,
    salaryMax: p.salaryMax || 0,
    approvedBy: p.headcountApprovedBy || "",
    approvalDate: p.headcountApprovedAt?.slice?.(0, 10) || "",
  }));

  const candidateRows = candidates.map(c => ({
    id: c.id,
    name: `${c.firstName || ""} ${c.lastName || ""}`.trim(),
    email: c.email,
    phone: c.phone || "",
    nationality: c.nationality || "",
    source: c.source || "",
    cvUrl: c.resumeUrl || "#",
    addedDate: c.createdAt?.slice?.(0, 10) || "",
    tags: c.tags || [],
    color: "#4f8ef7",
    notesLog: [],
  }));

  const applicationRows = applications.map(a => ({
    id: a.id,
    candidateId: a.candidateId || a.candidate?.id,
    jobId: a.positionId || a.position?.id,
    stage: stageLabel[a.stage] || a.stage,
    status: a.isActive === false || a.stage === "rejected" ? "Rejected" : "Active",
    recruiterId: a.position?.recruiterId || a.position?.recruiter?.userId || a.position?.recruiter?.user?.id || a.position?.recruiter?.id || "",
    recruiter: fullName(a.position?.recruiter?.user || a.position?.recruiter) || "Recruiter",
    appliedDate: a.appliedAt?.slice?.(0, 10) || "",
    notes: a.notes?.[0]?.content || a.disqualifyReason || "",
    daysInStage: a.daysInStage || 0,
    lastActivityAt: a.updatedAt || a.stageEnteredAt,
  }));

  const interviewRows = interviews.map(i => {
    const rawStatus = String(i.status || "").toLowerCase();
    return {
      id: i.id,
      applicationId: i.applicationId,
      type: i.type,
      scheduledAt: i.scheduledAt,
      format: i.meetingLink ? "Video call" : i.location ? "In-person" : "Phone",
      interviewerId: fullName(i.interviewer),
      interviewerUserId: i.interviewer?.id || "",
      interviewerEmail: i.interviewer?.email || "",
      status: rawStatus === "completed" ? "Completed" : rawStatus === "cancelled" ? "Cancelled" : "Scheduled",
    };
  });

  const offerRows = offers.map(o => ({
    id: o.id,
    applicationId: o.applicationId,
    salary: o.baseSalary || 0,
    currency: o.currency,
    startDate: o.startDate?.slice?.(0, 10) || "",
    status: statusLabel[o.status] || o.status,
    createdBy: "Recruiter",
    approvalNote: o.bandExceptionNote || "",
    createdDate: o.createdAt?.slice?.(0, 10) || "",
    basicSalary: o.baseSalary || 0,
    variablePay: o.signingBonus || 0,
  }));

  const scorecardRows = scorecards.map(s => ({
    id: s.id,
    applicationId: s.applicationId,
    interviewerId: fullName(s.interviewer),
    interviewType: s.interviewType,
    knowledge: Number(s.compositeScore || 0),
    attitude: Number(s.compositeScore || 0),
    feedback: Number(s.compositeScore || 0),
    recommendation: s.recommendation,
    notes: [s.strengthsSummary, s.concernsSummary].filter(Boolean).join("\n"),
    submittedDate: s.submittedAt?.slice?.(0, 10) || "",
  }));

  const hiringRequestRows = hiringRequests.map(r => ({
    id: r.id,
    title: r.title,
    dept: r.dept || r.department?.name || "",
    departmentId: r.departmentId || "",
    entity: entityLabel[r.entity] || r.entity || "",
    requestedBy: r.requestedBy || "",
    requestedById: r.requestedById || "",
    reason: r.reason || "",
    status: r.status || "",
    managerApproved: !!r.managerApproved,
    hrApproved: !!r.hrApproved,
    ceoApproved: !!r.ceoApproved,
    requestDate: r.requestDate?.slice?.(0, 10) || r.createdAt?.slice?.(0, 10) || "",
  }));

  return {
    jobs,
    candidates: candidateRows,
    applications: applicationRows,
    interviews: interviewRows,
    offers: offerRows,
    scorecards: scorecardRows,
    hiringRequests: hiringRequestRows,
    auditLogs: audit.map(mapAuditLog),
    users: users.map(mapUser),
  };
}

export async function fetchAtsData({ includeAudit = false, includeUsers = false } = {}) {
  const [positions, candidates, applications, interviews, offers, scorecards, hiringRequests, audit, users] = await Promise.all([
    api("/positions?pageSize=200"),
    api("/candidates?pageSize=500"),
    api("/applications?pageSize=500"),
    api("/interviews"),
    api("/offers?pageSize=200"),
    api("/scorecards?pageSize=500"),
    api("/hiring-requests").catch(() => []),
    includeAudit ? api("/audit?pageSize=200").catch(() => []) : Promise.resolve([]),
    includeUsers ? api("/users").catch(() => []) : Promise.resolve([]),
  ]);

  return mapBackendData({
    positions: positions?.data || positions || [],
    candidates: candidates?.data || candidates || [],
    applications: applications?.data || applications || [],
    interviews: interviews || [],
    offers: offers?.data || offers || [],
    scorecards: scorecards?.data || scorecards || [],
    hiringRequests: hiringRequests?.data || hiringRequests || [],
    audit: audit?.data || audit || [],
    users: users?.data || users || [],
  });
}

export const backendActions = {
  createCandidate: (payload) => api("/candidates", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      source: sourceToApi[payload.source] || payload.source || "direct",
    }),
  }),
  updateCandidate: (id, payload) => api(`/candidates/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...payload,
      source: sourceToApi[payload.source] || payload.source,
    }),
  }),
  createPosition: (payload) => api("/positions", {
    method: "POST",
    body: JSON.stringify({
      title: payload.title,
      departmentName: payload.dept,
      entity: entityToApi[payload.entity] || "egypt",
      seniority: seniorityToApi[payload.level] || "mid",
      employmentType: "full_time",
      currency: payload.currency || "EGP",
      salaryMin: Number(payload.salaryMin || 0),
      salaryMax: Math.max(Number(payload.salaryMax || 0), Number(payload.salaryMin || 0) + 1),
      priority: "normal",
      description: payload.description || "",
      requirements: [],
      headcountRationale: payload.positionType || "Manpower",
    }),
  }),
  updatePosition: (id, payload) => {
    const body = {
      title: payload.title,
      departmentName: payload.dept,
      entity: entityToApi[payload.entity] || payload.entity || "egypt",
      seniority: seniorityToApi[payload.level] || payload.level || "mid",
      description: payload.description || "",
      headcountRationale: payload.positionType || "Manpower",
      recruiterId: payload.recruiterId || undefined,
      hiringManagerId: payload.hiringManagerId || undefined,
    };
    if (payload.salaryMin !== undefined && payload.salaryMin !== "" && payload.salaryMax !== undefined && payload.salaryMax !== "") {
      const salaryMin = Number(payload.salaryMin || 0);
      body.salaryMin = salaryMin;
      body.salaryMax = Math.max(Number(payload.salaryMax || 0), salaryMin + 1);
    }
    return api(`/positions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  assignPositionRecruiter: (id, recruiterId) => api(`/positions/${id}/recruiter`, {
    method: "PATCH",
    body: JSON.stringify({ recruiterId }),
  }),
  updatePositionStatus: (id, status) => api(`/positions/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: positionStatusToApi[status] || status }),
  }),
  deletePosition: (id) => api(`/positions/${id}`, { method: "DELETE" }),
  deleteCandidate: (id) => api(`/candidates/${id}`, { method: "DELETE" }),
  createApplication: (payload) => api("/applications", { method: "POST", body: JSON.stringify(payload) }),
  moveApplication: (id, payload) => api(`/applications/${id}/stage`, { method: "PATCH", body: JSON.stringify(payload) }),
  rejectApplication: (id, payload) => api(`/applications/${id}/disqualify`, { method: "POST", body: JSON.stringify(payload) }),
  addNote: (id, payload) => api(`/applications/${id}/notes`, { method: "POST", body: JSON.stringify(payload) }),
  createInterview: (payload) => api("/interviews", { method: "POST", body: JSON.stringify(payload) }),
  deleteInterview: (id) => api(`/interviews/${id}`, { method: "DELETE" }),
  createOffer: (payload) => api("/offers", { method: "POST", body: JSON.stringify(payload) }),
  createHiringRequest: (payload) => api("/hiring-requests", {
    method: "POST",
    body: JSON.stringify({
      title: payload.title,
      departmentId: payload.departmentId || undefined,
      departmentName: payload.dept,
      entity: entityToApi[payload.entity] || payload.entity || "egypt",
      reason: payload.reason,
    }),
  }),
  approveHiringRequestStep: (id, payload = {}) => api(`/hiring-requests/${id}/approve-step`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }),
  uploadCv: (payload) => api("/files/cv", { method: "POST", body: JSON.stringify(payload) }),
  createUser: (payload) => api("/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) => api(`/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
};
