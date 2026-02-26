CREATE TABLE IF NOT EXISTS discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('standard', 'happy_hour', 'expiration', 'coupon')),
  value_type TEXT NOT NULL CHECK (value_type IN ('percentage', 'fixed')),
  value NUMERIC(10,2) NOT NULL CHECK (value > 0),
  target_product_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  target_category_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  target_machine_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
  coupon_code TEXT,
  max_uses INT,
  uses_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'scheduled', 'paused', 'ended')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (max_uses IS NULL OR max_uses >= 1),
  CHECK (uses_count >= 0),
  CHECK (coupon_code IS NULL OR length(trim(coupon_code)) > 0),
  CHECK (type <> 'coupon' OR coupon_code IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS expiration_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  name TEXT,
  target_product_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  target_category_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  tiers JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS discount_id UUID REFERENCES discounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS discounts_operator_status_window_idx
ON discounts (operator_id, status, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS discounts_operator_type_created_idx
ON discounts (operator_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS expiration_rules_operator_active_created_idx
ON expiration_rules (operator_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_operator_discount_created_idx
ON transactions (operator_id, discount_id, created_at DESC)
WHERE discount_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_discount_created_idx
ON transactions (discount_id, created_at DESC)
WHERE discount_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS discounts_operator_coupon_code_unique_idx
ON discounts (operator_id, upper(coupon_code))
WHERE coupon_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.increment_coupon_uses_count(
  p_discount_id UUID,
  p_operator_id UUID,
  p_increment INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_increment IS NULL OR p_increment <= 0 THEN
    RETURN;
  END IF;

  UPDATE discounts
  SET uses_count = COALESCE(uses_count, 0) + p_increment
  WHERE id = p_discount_id
    AND operator_id = p_operator_id
    AND type = 'coupon';
END;
$$;

ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE expiration_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discounts_operator_isolation_select ON discounts;
DROP POLICY IF EXISTS discounts_operator_isolation_insert ON discounts;
DROP POLICY IF EXISTS discounts_operator_isolation_update ON discounts;
DROP POLICY IF EXISTS discounts_operator_isolation_delete ON discounts;

CREATE POLICY discounts_operator_isolation_select ON discounts
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY discounts_operator_isolation_insert ON discounts
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY discounts_operator_isolation_update ON discounts
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY discounts_operator_isolation_delete ON discounts
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS expiration_rules_operator_isolation_select ON expiration_rules;
DROP POLICY IF EXISTS expiration_rules_operator_isolation_insert ON expiration_rules;
DROP POLICY IF EXISTS expiration_rules_operator_isolation_update ON expiration_rules;
DROP POLICY IF EXISTS expiration_rules_operator_isolation_delete ON expiration_rules;

CREATE POLICY expiration_rules_operator_isolation_select ON expiration_rules
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY expiration_rules_operator_isolation_insert ON expiration_rules
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY expiration_rules_operator_isolation_update ON expiration_rules
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY expiration_rules_operator_isolation_delete ON expiration_rules
FOR DELETE USING (operator_id = public.get_operator_id());
