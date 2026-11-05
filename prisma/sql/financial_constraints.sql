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
