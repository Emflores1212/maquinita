CREATE TABLE IF NOT EXISTS daily_rollups (
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  units_sold INT NOT NULL DEFAULT 0,
  revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
  refunds NUMERIC(10,2) NOT NULL DEFAULT 0,
  units_wasted INT NOT NULL DEFAULT 0,
  transactions_count INT NOT NULL DEFAULT 0,
  UNIQUE (operator_id, machine_id, product_id, date)
);

CREATE TABLE IF NOT EXISTS cogs_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
  cogs_percentage NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (cogs_percentage >= 0 AND cogs_percentage <= 100),
  CHECK ((product_id IS NOT NULL) <> (category_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS cogs_settings_operator_product_unique_idx
ON cogs_settings (operator_id, product_id)
WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cogs_settings_operator_category_unique_idx
ON cogs_settings (operator_id, category_id)
WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS daily_rollups_operator_date_idx
ON daily_rollups (operator_id, date DESC);

CREATE INDEX IF NOT EXISTS daily_rollups_operator_machine_date_idx
ON daily_rollups (operator_id, machine_id, date DESC);

CREATE INDEX IF NOT EXISTS daily_rollups_operator_product_date_idx
ON daily_rollups (operator_id, product_id, date DESC);

CREATE INDEX IF NOT EXISTS cogs_settings_operator_product_idx
ON cogs_settings (operator_id, product_id);

CREATE INDEX IF NOT EXISTS cogs_settings_operator_category_idx
ON cogs_settings (operator_id, category_id);

ALTER TABLE daily_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE cogs_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_rollups_operator_isolation_select ON daily_rollups;
DROP POLICY IF EXISTS daily_rollups_operator_isolation_insert ON daily_rollups;
DROP POLICY IF EXISTS daily_rollups_operator_isolation_update ON daily_rollups;
DROP POLICY IF EXISTS daily_rollups_operator_isolation_delete ON daily_rollups;

CREATE POLICY daily_rollups_operator_isolation_select ON daily_rollups
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY daily_rollups_operator_isolation_insert ON daily_rollups
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY daily_rollups_operator_isolation_update ON daily_rollups
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY daily_rollups_operator_isolation_delete ON daily_rollups
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS cogs_settings_operator_isolation_select ON cogs_settings;
DROP POLICY IF EXISTS cogs_settings_operator_isolation_insert ON cogs_settings;
DROP POLICY IF EXISTS cogs_settings_operator_isolation_update ON cogs_settings;
DROP POLICY IF EXISTS cogs_settings_operator_isolation_delete ON cogs_settings;

CREATE POLICY cogs_settings_operator_isolation_select ON cogs_settings
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY cogs_settings_operator_isolation_insert ON cogs_settings
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY cogs_settings_operator_isolation_update ON cogs_settings
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY cogs_settings_operator_isolation_delete ON cogs_settings
FOR DELETE USING (operator_id = public.get_operator_id());
