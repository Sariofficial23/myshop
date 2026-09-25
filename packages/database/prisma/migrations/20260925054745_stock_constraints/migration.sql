-- Защита на уровне БД (в дополнение к проверкам в коде):
-- остаток не может стать отрицательным, количество и цены в документах — корректны.
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_prices_non_negative" CHECK ("purchase_price" >= 0 AND ("sale_price" IS NULL OR "sale_price" >= 0));
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_non_zero" CHECK ("quantity" <> 0);
