-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PricingMethod" AS ENUM ('PER_UNIT', 'FIXED_PER_TASK');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'APPROVED', 'VOIDED');

-- CreateEnum
CREATE TYPE "EarningSourceType" AS ENUM ('TASK_ENTRY', 'DAILY_ALLOWANCE');

-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('ACTIVE', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sends" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "departmentId" TEXT,
    "jobRole" TEXT,
    "joiningDate" DATE NOT NULL,
    "status" "WorkerStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricingMethod" "PricingMethod" NOT NULL,
    "unitLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_rate_history" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_rate_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_work_entries" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "taskId" TEXT NOT NULL,
    "pricingMethod" "PricingMethod" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "rateHistoryId" TEXT,
    "appliedRate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "replacesEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_work_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_allowances" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "sourceType" "EarningSourceType" NOT NULL,
    "workEntryId" TEXT,
    "allowanceId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "settledAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "EarningStatus" NOT NULL DEFAULT 'ACTIVE',
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_payments" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "cashAmount" DECIMAL(14,2) NOT NULL,
    "advanceRecoveryAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalSettled" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED',
    "recordedById" TEXT NOT NULL,
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "earningId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advances" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "advanceDate" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "recoveredAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedById" TEXT NOT NULL,
    "voidedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advance_recoveries" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "earningId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advance_recoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "login_challenges_userId_createdAt_idx" ON "login_challenges"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "login_challenges_expiresAt_idx" ON "login_challenges"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "workers_code_key" ON "workers"("code");

-- CreateIndex
CREATE INDEX "workers_status_idx" ON "workers"("status");

-- CreateIndex
CREATE INDEX "workers_departmentId_idx" ON "workers"("departmentId");

-- CreateIndex
CREATE INDEX "workers_fullName_idx" ON "workers"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_code_key" ON "tasks"("code");

-- CreateIndex
CREATE UNIQUE INDEX "task_rate_history_taskId_effectiveFrom_key" ON "task_rate_history"("taskId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "attendance_date_idx" ON "attendance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_workerId_date_key" ON "attendance"("workerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_work_entries_replacesEntryId_key" ON "daily_work_entries"("replacesEntryId");

-- CreateIndex
CREATE INDEX "daily_work_entries_workerId_workDate_idx" ON "daily_work_entries"("workerId", "workDate");

-- CreateIndex
CREATE INDEX "daily_work_entries_workDate_idx" ON "daily_work_entries"("workDate");

-- CreateIndex
CREATE INDEX "daily_work_entries_taskId_workDate_idx" ON "daily_work_entries"("taskId", "workDate");

-- CreateIndex
CREATE INDEX "daily_work_entries_status_idx" ON "daily_work_entries"("status");

-- CreateIndex
CREATE INDEX "daily_allowances_workerId_workDate_idx" ON "daily_allowances"("workerId", "workDate");

-- CreateIndex
CREATE INDEX "daily_allowances_workDate_idx" ON "daily_allowances"("workDate");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_workEntryId_key" ON "earnings"("workEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_allowanceId_key" ON "earnings"("allowanceId");

-- CreateIndex
CREATE INDEX "earnings_workerId_status_workDate_createdAt_idx" ON "earnings"("workerId", "status", "workDate", "createdAt");

-- CreateIndex
CREATE INDEX "earnings_workDate_idx" ON "earnings"("workDate");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_receiptNo_key" ON "salary_payments"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "salary_payments_idempotencyKey_key" ON "salary_payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "salary_payments_workerId_paymentDate_idx" ON "salary_payments"("workerId", "paymentDate");

-- CreateIndex
CREATE INDEX "salary_payments_paymentDate_idx" ON "salary_payments"("paymentDate");

-- CreateIndex
CREATE INDEX "payment_allocations_earningId_idx" ON "payment_allocations"("earningId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_paymentId_earningId_key" ON "payment_allocations"("paymentId", "earningId");

-- CreateIndex
CREATE INDEX "advances_workerId_status_advanceDate_idx" ON "advances"("workerId", "status", "advanceDate");

-- CreateIndex
CREATE INDEX "advance_recoveries_earningId_idx" ON "advance_recoveries"("earningId");

-- CreateIndex
CREATE INDEX "advance_recoveries_paymentId_idx" ON "advance_recoveries"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "advance_recoveries_advanceId_earningId_paymentId_key" ON "advance_recoveries"("advanceId", "earningId", "paymentId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_challenges" ADD CONSTRAINT "login_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_rate_history" ADD CONSTRAINT "task_rate_history_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_rate_history" ADD CONSTRAINT "task_rate_history_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_work_entries" ADD CONSTRAINT "daily_work_entries_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_work_entries" ADD CONSTRAINT "daily_work_entries_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_work_entries" ADD CONSTRAINT "daily_work_entries_rateHistoryId_fkey" FOREIGN KEY ("rateHistoryId") REFERENCES "task_rate_history"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_work_entries" ADD CONSTRAINT "daily_work_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_work_entries" ADD CONSTRAINT "daily_work_entries_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_work_entries" ADD CONSTRAINT "daily_work_entries_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_work_entries" ADD CONSTRAINT "daily_work_entries_replacesEntryId_fkey" FOREIGN KEY ("replacesEntryId") REFERENCES "daily_work_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_allowances" ADD CONSTRAINT "daily_allowances_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_allowances" ADD CONSTRAINT "daily_allowances_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_allowances" ADD CONSTRAINT "daily_allowances_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_allowances" ADD CONSTRAINT "daily_allowances_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_workEntryId_fkey" FOREIGN KEY ("workEntryId") REFERENCES "daily_work_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_allowanceId_fkey" FOREIGN KEY ("allowanceId") REFERENCES "daily_allowances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "salary_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_earningId_fkey" FOREIGN KEY ("earningId") REFERENCES "earnings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_recoveries" ADD CONSTRAINT "advance_recoveries_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "advances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_recoveries" ADD CONSTRAINT "advance_recoveries_earningId_fkey" FOREIGN KEY ("earningId") REFERENCES "earnings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_recoveries" ADD CONSTRAINT "advance_recoveries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "salary_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- FBM financial integrity constraints (Prisma cannot express these).
-- Applied together with the generated init migration by scripts/init-db.mjs.
-- Column names are quoted camelCase because the Prisma schema does not @map columns.
-- ============================================================================

-- Earnings ledger ------------------------------------------------------------
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_settled_bounds"
  CHECK ("settledAmount" >= 0 AND "settledAmount" <= "amount");
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_single_source"
  CHECK ((("workEntryId" IS NOT NULL)::int + ("allowanceId" IS NOT NULL)::int) = 1);

-- Advances -------------------------------------------------------------------
ALTER TABLE "advances" ADD CONSTRAINT "advances_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "advances" ADD CONSTRAINT "advances_recovered_bounds"
  CHECK ("recoveredAmount" >= 0 AND "recoveredAmount" <= "amount");

-- Payments / allocations / recoveries ----------------------------------------
ALTER TABLE "salary_payments" ADD CONSTRAINT "payments_amounts"
  CHECK ("cashAmount" >= 0 AND "advanceRecoveryAmount" >= 0
         AND "totalSettled" = "cashAmount" + "advanceRecoveryAmount"
         AND "totalSettled" > 0);
ALTER TABLE "salary_payments" ADD CONSTRAINT "payments_period" CHECK ("periodStart" <= "periodEnd");
ALTER TABLE "payment_allocations" ADD CONSTRAINT "allocations_positive" CHECK ("amount" > 0);
ALTER TABLE "advance_recoveries" ADD CONSTRAINT "recoveries_positive" CHECK ("amount" > 0);

-- Work entries / allowances / rates ------------------------------------------
ALTER TABLE "daily_work_entries" ADD CONSTRAINT "entries_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "daily_work_entries" ADD CONSTRAINT "entries_rate_nonnegative" CHECK ("appliedRate" >= 0);
ALTER TABLE "daily_work_entries" ADD CONSTRAINT "entries_amount_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "daily_allowances" ADD CONSTRAINT "allowances_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "task_rate_history" ADD CONSTRAINT "rates_nonnegative" CHECK ("rate" >= 0);

-- One ACTIVE line per key (voided rows are excluded so void-and-replace works) -
CREATE UNIQUE INDEX "uq_work_entry_active"
  ON "daily_work_entries" ("workerId", "workDate", "taskId") WHERE "status" <> 'VOIDED';
CREATE UNIQUE INDEX "uq_allowance_active"
  ON "daily_allowances" ("workerId", "workDate") WHERE "status" <> 'VOIDED';

-- Immutability: financial history is append-only -----------------------------
CREATE FUNCTION "fbm_reject_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed: financial history is immutable', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_immutable" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "fbm_reject_change"();
CREATE TRIGGER "payment_allocations_immutable" BEFORE UPDATE OR DELETE ON "payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION "fbm_reject_change"();
CREATE TRIGGER "advance_recoveries_immutable" BEFORE UPDATE OR DELETE ON "advance_recoveries"
  FOR EACH ROW EXECUTE FUNCTION "fbm_reject_change"();
CREATE TRIGGER "earnings_no_delete" BEFORE DELETE ON "earnings"
  FOR EACH ROW EXECUTE FUNCTION "fbm_reject_change"();
CREATE TRIGGER "salary_payments_no_delete" BEFORE DELETE ON "salary_payments"
  FOR EACH ROW EXECUTE FUNCTION "fbm_reject_change"();

-- Earnings: identity and original amount can never change (only settledAmount / reversal fields)
CREATE FUNCTION "fbm_earnings_guard"() RETURNS trigger AS $$
BEGIN
  IF NEW."amount" <> OLD."amount"
     OR NEW."workerId" <> OLD."workerId"
     OR NEW."workDate" <> OLD."workDate"
     OR NEW."sourceType" <> OLD."sourceType"
     OR NEW."workEntryId" IS DISTINCT FROM OLD."workEntryId"
     OR NEW."allowanceId" IS DISTINCT FROM OLD."allowanceId" THEN
    RAISE EXCEPTION 'earnings identity and original amount are immutable (use reversal + replacement)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "earnings_guard" BEFORE UPDATE ON "earnings"
  FOR EACH ROW EXECUTE FUNCTION "fbm_earnings_guard"();

-- Salary payments: money, worker and period are immutable (only status / reversal fields change)
CREATE FUNCTION "fbm_payments_guard"() RETURNS trigger AS $$
BEGIN
  IF NEW."cashAmount" <> OLD."cashAmount"
     OR NEW."advanceRecoveryAmount" <> OLD."advanceRecoveryAmount"
     OR NEW."totalSettled" <> OLD."totalSettled"
     OR NEW."workerId" <> OLD."workerId"
     OR NEW."paymentDate" <> OLD."paymentDate"
     OR NEW."periodStart" <> OLD."periodStart"
     OR NEW."periodEnd" <> OLD."periodEnd" THEN
    RAISE EXCEPTION 'salary payment amounts, worker and period are immutable (reverse and re-post instead)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "salary_payments_guard" BEFORE UPDATE ON "salary_payments"
  FOR EACH ROW EXECUTE FUNCTION "fbm_payments_guard"();
