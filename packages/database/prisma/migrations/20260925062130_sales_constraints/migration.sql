-- Защита на уровне БД для продаж (в дополнение к проверкам в коде).
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_amounts_valid"
  CHECK ("price" >= 0 AND "discount" >= 0 AND "discount" <= "price" * "quantity" AND "total" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_amounts_valid"
  CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "total" >= 0 AND "paid_total" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
