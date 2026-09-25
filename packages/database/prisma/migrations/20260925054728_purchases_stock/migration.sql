-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'WRITE_OFF', 'INVENTORY_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SALE', 'PURCHASE', 'RETURN', 'TRANSFER', 'WRITE_OFF', 'INVENTORY_ADJUSTMENT', 'PAYMENT');

-- AlterTable
ALTER TABLE "serial_numbers" ADD COLUMN     "purchase_id" UUID;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(32),
    "contact" VARCHAR(200),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_counters" (
    "company_id" UUID NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("company_id","type")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_id" UUID,
    "number" INTEGER NOT NULL,
    "document_number" VARCHAR(64),
    "date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "purchase_price" DECIMAL(14,2) NOT NULL,
    "sale_price" DECIMAL(14,2),
    "total" DECIMAL(14,2) NOT NULL,
    "serial_numbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,2),
    "purchase_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("branch_id","variant_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity" VARCHAR(64) NOT NULL,
    "entity_id" UUID,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_name_key" ON "suppliers"("company_id", "name");

-- CreateIndex
CREATE INDEX "purchases_company_id_status_date_idx" ON "purchases"("company_id", "status", "date");

-- CreateIndex
CREATE INDEX "purchases_company_id_branch_id_date_idx" ON "purchases"("company_id", "branch_id", "date");

-- CreateIndex
CREATE INDEX "purchases_supplier_id_idx" ON "purchases"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_company_id_number_key" ON "purchases"("company_id", "number");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_items_variant_id_idx" ON "purchase_items"("variant_id");

-- CreateIndex
CREATE INDEX "stock_movements_company_id_created_at_idx" ON "stock_movements"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_variant_id_branch_id_created_at_idx" ON "stock_movements"("variant_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_purchase_id_idx" ON "stock_movements"("purchase_id");

-- CreateIndex
CREATE INDEX "stock_balances_company_id_variant_id_idx" ON "stock_balances"("company_id", "variant_id");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_entity_entity_id_idx" ON "audit_logs"("company_id", "entity", "entity_id");

-- CreateIndex
CREATE INDEX "serial_numbers_purchase_id_idx" ON "serial_numbers"("purchase_id");

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
