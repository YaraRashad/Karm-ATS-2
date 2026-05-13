-- CreateEnum
CREATE TYPE "Entity" AS ENUM ('egypt', 'cyprus', 'uk', 'tunisia');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'recruiter', 'hiring_manager', 'interviewer');

-- CreateEnum
CREATE TYPE "AccessScope" AS ENUM ('all_data', 'recruitment_data', 'assigned_jobs', 'assigned_interviews');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'part_time', 'contract', 'internship');

-- CreateEnum
CREATE TYPE "SeniorityLevel" AS ENUM ('junior', 'mid', 'senior', 'lead', 'director', 'vp');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('draft', 'pending_approval', 'open', 'on_hold', 'closed');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "HeadcountApprovalStatus" AS ENUM ('not_requested', 'pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('applied', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('linkedin', 'referral', 'direct', 'agency', 'job_board', 'internal', 'other');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('phone_screen', 'technical', 'behavioral', 'panel', 'final', 'case_study');

-- CreateEnum
CREATE TYPE "ScoreRating" AS ENUM ('one', 'two', 'three', 'four', 'five');

-- CreateEnum
CREATE TYPE "OverallRecommendation" AS ENUM ('strong_yes', 'yes', 'neutral', 'no', 'strong_no');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'declined', 'expired', 'withdrawn');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('waiting', 'pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('created', 'updated', 'deleted', 'status_changed', 'approved', 'rejected', 'sent', 'viewed', 'login', 'logout', 'candidate_moved', 'feedback_submitted', 'interview_scheduled', 'offer_created', 'role_changed', 'file_uploaded');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "azureAdObjectId" TEXT,
    "microsoftTenantId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "departmentId" TEXT,
    "accessScope" "AccessScope" NOT NULL DEFAULT 'assigned_jobs',
    "canViewSalary" BOOLEAN NOT NULL DEFAULT false,
    "canApproveOffers" BOOLEAN NOT NULL DEFAULT false,
    "canApproveRequisitions" BOOLEAN NOT NULL DEFAULT false,
    "entities" "Entity"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity" "Entity" NOT NULL,
    "headId" TEXT,
    "costCenter" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "entity" "Entity" NOT NULL,
    "currency" TEXT NOT NULL,
    "salaryMin" INTEGER NOT NULL,
    "salaryMax" INTEGER NOT NULL,
    "bonusMin" INTEGER NOT NULL DEFAULT 0,
    "bonusMax" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "entity" "Entity" NOT NULL,
    "departmentId" TEXT NOT NULL,
    "positionTitle" TEXT NOT NULL,
    "grade" TEXT,
    "managerId" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'full_time',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "probationEndDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nationality" TEXT,
    "noticePeriodDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "entity" "Entity" NOT NULL,
    "seniority" "SeniorityLevel" NOT NULL,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'full_time',
    "gradeBandId" TEXT,
    "currency" TEXT NOT NULL,
    "salaryMin" INTEGER NOT NULL,
    "salaryMax" INTEGER NOT NULL,
    "status" "PositionStatus" NOT NULL DEFAULT 'draft',
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "headcountStatus" "HeadcountApprovalStatus" NOT NULL DEFAULT 'not_requested',
    "headcountApprovedAt" TIMESTAMP(3),
    "headcountApprovedBy" TEXT,
    "headcountRationale" TEXT,
    "openDate" TIMESTAMP(3),
    "targetCloseDate" TIMESTAMP(3),
    "closedDate" TIMESTAMP(3),
    "hiringManagerId" TEXT,
    "recruiterId" TEXT,
    "scorecardTemplateId" TEXT,
    "description" TEXT,
    "requirements" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "currentTitle" TEXT,
    "currentCompany" TEXT,
    "totalYearsExp" INTEGER,
    "location" TEXT,
    "nationality" TEXT,
    "noticePeriodDays" INTEGER,
    "salaryExpectation" INTEGER,
    "salaryCurrency" TEXT,
    "resumeUrl" TEXT,
    "source" "CandidateSource" NOT NULL DEFAULT 'direct',
    "tags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'applied',
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "disqualifyReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_stage_history" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStage" "ApplicationStage",
    "toStage" "ApplicationStage" NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "movedById" TEXT,
    "reason" TEXT,

    CONSTRAINT "application_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_notes" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "type" "InterviewType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "location" TEXT,
    "meetingLink" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scorecardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "appliesTo" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scorecard_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard_template_categories" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "colorHex" TEXT NOT NULL DEFAULT '#3a5a8a',
    "levels" TEXT[],

    CONSTRAINT "scorecard_template_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecards" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "interviewType" "InterviewType" NOT NULL,
    "recommendation" "OverallRecommendation",
    "strengthsSummary" TEXT,
    "concernsSummary" TEXT,
    "compositeScore" DECIMAL(4,2),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard_ratings" (
    "id" TEXT NOT NULL,
    "scorecardId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "scorecard_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "gradeBandId" TEXT,
    "currency" TEXT NOT NULL,
    "baseSalary" INTEGER NOT NULL,
    "bonusTargetPct" INTEGER NOT NULL DEFAULT 0,
    "signingBonus" INTEGER NOT NULL DEFAULT 0,
    "annualLeaveDays" INTEGER NOT NULL DEFAULT 21,
    "startDate" TIMESTAMP(3),
    "respondByDate" TIMESTAMP(3),
    "status" "OfferStatus" NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "declineNotes" TEXT,
    "bandException" BOOLEAN NOT NULL DEFAULT false,
    "bandExceptionNote" TEXT,
    "onboardingTriggered" BOOLEAN NOT NULL DEFAULT false,
    "letterContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "approverId" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'waiting',
    "note" TEXT,
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_notes" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_history" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offer_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'cv',
    "checksumSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_azureAdObjectId_key" ON "users"("azureAdObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_entity_key" ON "departments"("name", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "grade_bands_grade_entity_key" ON "grade_bands"("grade", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeNumber_key" ON "employees"("employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_email_key" ON "candidates"("email");

-- CreateIndex
CREATE UNIQUE INDEX "applications_candidateId_positionId_key" ON "applications"("candidateId", "positionId");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_scorecardId_key" ON "interviews"("scorecardId");

-- CreateIndex
CREATE UNIQUE INDEX "scorecard_ratings_scorecardId_categoryId_key" ON "scorecard_ratings"("scorecardId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_steps_offerId_stepOrder_key" ON "approval_steps"("offerId", "stepOrder");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_storageKey_key" ON "file_objects"("storageKey");

-- CreateIndex
CREATE INDEX "file_objects_candidateId_idx" ON "file_objects"("candidateId");

-- CreateIndex
CREATE INDEX "file_objects_uploadedById_idx" ON "file_objects"("uploadedById");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_gradeBandId_fkey" FOREIGN KEY ("gradeBandId") REFERENCES "grade_bands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_scorecardTemplateId_fkey" FOREIGN KEY ("scorecardTemplateId") REFERENCES "scorecard_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_history" ADD CONSTRAINT "application_stage_history_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "scorecards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_template_categories" ADD CONSTRAINT "scorecard_template_categories_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "scorecard_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "scorecard_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_ratings" ADD CONSTRAINT "scorecard_ratings_scorecardId_fkey" FOREIGN KEY ("scorecardId") REFERENCES "scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_ratings" ADD CONSTRAINT "scorecard_ratings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "scorecard_template_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_gradeBandId_fkey" FOREIGN KEY ("gradeBandId") REFERENCES "grade_bands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_notes" ADD CONSTRAINT "offer_notes_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_notes" ADD CONSTRAINT "offer_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_history" ADD CONSTRAINT "offer_history_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

