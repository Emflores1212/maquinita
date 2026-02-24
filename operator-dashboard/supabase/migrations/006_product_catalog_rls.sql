ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_product_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_categories_operator_isolation_select ON product_categories;
DROP POLICY IF EXISTS product_categories_operator_isolation_insert ON product_categories;
DROP POLICY IF EXISTS product_categories_operator_isolation_update ON product_categories;
DROP POLICY IF EXISTS product_categories_operator_isolation_delete ON product_categories;

CREATE POLICY product_categories_operator_isolation_select
ON product_categories
FOR SELECT
USING (operator_id = public.get_operator_id());

CREATE POLICY product_categories_operator_isolation_insert
ON product_categories
FOR INSERT
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY product_categories_operator_isolation_update
ON product_categories
FOR UPDATE
USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY product_categories_operator_isolation_delete
ON product_categories
FOR DELETE
USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS machine_product_prices_operator_isolation_select ON machine_product_prices;
DROP POLICY IF EXISTS machine_product_prices_operator_isolation_insert ON machine_product_prices;
DROP POLICY IF EXISTS machine_product_prices_operator_isolation_update ON machine_product_prices;
DROP POLICY IF EXISTS machine_product_prices_operator_isolation_delete ON machine_product_prices;

CREATE POLICY machine_product_prices_operator_isolation_select
ON machine_product_prices
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM machines m
    WHERE m.id = machine_product_prices.machine_id
      AND m.operator_id = public.get_operator_id()
  )
  AND EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = machine_product_prices.product_id
      AND p.operator_id = public.get_operator_id()
  )
);

CREATE POLICY machine_product_prices_operator_isolation_insert
ON machine_product_prices
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM machines m
    WHERE m.id = machine_product_prices.machine_id
      AND m.operator_id = public.get_operator_id()
  )
  AND EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = machine_product_prices.product_id
      AND p.operator_id = public.get_operator_id()
  )
);

CREATE POLICY machine_product_prices_operator_isolation_update
ON machine_product_prices
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM machines m
    WHERE m.id = machine_product_prices.machine_id
      AND m.operator_id = public.get_operator_id()
  )
  AND EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = machine_product_prices.product_id
      AND p.operator_id = public.get_operator_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM machines m
    WHERE m.id = machine_product_prices.machine_id
      AND m.operator_id = public.get_operator_id()
  )
  AND EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = machine_product_prices.product_id
      AND p.operator_id = public.get_operator_id()
  )
);

CREATE POLICY machine_product_prices_operator_isolation_delete
ON machine_product_prices
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM machines m
    WHERE m.id = machine_product_prices.machine_id
      AND m.operator_id = public.get_operator_id()
  )
  AND EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = machine_product_prices.product_id
      AND p.operator_id = public.get_operator_id()
  )
);
