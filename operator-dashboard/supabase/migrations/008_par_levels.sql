CREATE TABLE IF NOT EXISTS par_levels (
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (machine_id, product_id)
);

CREATE INDEX IF NOT EXISTS par_levels_product_idx
ON par_levels (product_id);

ALTER TABLE par_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS par_levels_operator_isolation_select ON par_levels;
DROP POLICY IF EXISTS par_levels_operator_isolation_insert ON par_levels;
DROP POLICY IF EXISTS par_levels_operator_isolation_update ON par_levels;
DROP POLICY IF EXISTS par_levels_operator_isolation_delete ON par_levels;

CREATE POLICY par_levels_operator_isolation_select
ON par_levels
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM machines m
    WHERE m.id = par_levels.machine_id
      AND m.operator_id = public.get_operator_id()
  )
  AND EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = par_levels.product_id
      AND p.operator_id = public.get_operator_id()
  )
);

CREATE POLICY par_levels_operator_isolation_insert
ON par_levels
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM machines m
    WHERE m.id = par_levels.machine_id
      AND m.operator_id = public.get_operator_id()
  )
  AND EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = par_levels.product_id
      AND p.operator_id = public.get_operator_id()
  )
);

CREATE POLICY par_levels_operator_isolation_update
ON par_levels
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM machines m
    WHERE m.id = par_levels.machine_id
      AND m.operator_id = public.get_operator_id()
  )
  AND EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = par_levels.product_id
      AND p.operator_id = public.get_operator_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM machines m
    WHERE m.id = par_levels.machine_id
      AND m.operator_id = public.get_operator_id()
  )
  AND EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = par_levels.product_id
      AND p.operator_id = public.get_operator_id()
  )
);

CREATE POLICY par_levels_operator_isolation_delete
ON par_levels
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM machines m
    WHERE m.id = par_levels.machine_id
      AND m.operator_id = public.get_operator_id()
  )
  AND EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = par_levels.product_id
      AND p.operator_id = public.get_operator_id()
  )
);
