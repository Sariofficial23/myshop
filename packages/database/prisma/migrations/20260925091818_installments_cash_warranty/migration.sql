-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('ACTIVE', 'PAID');

-- CreateEnum
CREATE TYPE "CashOperationType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'EXPENSE');

-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('RECEIVED', 'IN_REPAIR', 'READY', 'RETURNED', 'REJECTED');

-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "debt_reduction" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "installments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reduced_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "months" INTEGER NOT NULL,
    "monthly_amount" DECIMAL(14,2) NOT NULL,
    "first_due_date" DATE NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "received_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_operations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "type" "CashOperationType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_claims" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "serial_number_id" UUID NOT NULL,
    "sale_id" UUID,
    "customer_id" UUID,
    "in_warranty" BOOLEAN NOT NULL,
    "problem" TEXT NOT NULL,
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'RECEIVED',
    "resolution" TEXT,
    "created_by_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "installments_sale_id_key" ON "installments"("sale_id");

-- CreateIndex
CREATE INDEX "installments_company_id_status_idx" ON "installments"("company_id", "status");

-- CreateIndex
CREATE INDEX "installments_customer_id_idx" ON "installments"("customer_id");

-- CreateIndex
CREATE INDEX "installment_payments_company_id_created_at_idx" ON "installment_payments"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "installment_payments_installment_id_idx" ON "installment_payments"("installment_id");

-- CreateIndex
CREATE INDEX "installment_payments_branch_id_created_at_idx" ON "installment_payments"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_operations_company_id_created_at_idx" ON "cash_operations"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_operations_branch_id_created_at_idx" ON "cash_operations"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "warranty_claims_company_id_status_idx" ON "warranty_claims"("company_id", "status");

-- CreateIndex
CREATE INDEX "warranty_claims_serial_number_id_idx" ON "warranty_claims"("serial_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_claims_company_id_number_key" ON "warranty_claims"("company_id", "number");

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Защита на уровне БД (в дополнение к проверкам в коде).
ALTER TABLE "installments" ADD CONSTRAINT "installments_amounts_valid"
  CHECK ("total" > 0 AND "paid_amount" >= 0 AND "reduced_amount" >= 0
     AND "paid_amount" + "reduced_amount" <= "total" AND "months" BETWEEN 1 AND 60);
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "returns" ADD CONSTRAINT "returns_debt_reduction_valid"
  CHECK ("debt_reduction" >= 0 AND "debt_reduction" <= "refund_total");
