CREATE TYPE "HiringRequestStatus" AS ENUM (
  'pending_manager_approval',
  'pending_hr_approval',
  'pending_admin_approval',
  'approved',
  'rejected'
);

CREATE TABLE "hiring_requests" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "entity" "Entity" NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "HiringRequestStatus" NOT NULL DEFAULT 'pending_manager_approval',
  "requestedById" TEXT NOT NULL,
  "managerApproved" BOOLEAN NOT NULL DEFAULT false,
  "hrApproved" BOOLEAN NOT NULL DEFAULT false,
  "adminApproved" BOOLEAN NOT NULL DEFAULT false,
  "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hiring_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hiring_requests_status_entity_idx" ON "hiring_requests"("status", "entity");
CREATE INDEX "hiring_requests_requestedById_idx" ON "hiring_requests"("requestedById");

ALTER TABLE "hiring_requests"
  ADD CONSTRAINT "hiring_requests_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "hiring_requests"
  ADD CONSTRAINT "hiring_requests_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
