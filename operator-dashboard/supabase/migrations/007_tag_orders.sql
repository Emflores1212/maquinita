CREATE TABLE IF NOT EXISTS tag_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  tag_type TEXT,
  quantity INT,
  status TEXT DEFAULT 'pending',
  shipping_address JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tag_orders_operator_created_idx
ON tag_orders (operator_id, created_at DESC);

ALTER TABLE tag_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tag_orders_operator_isolation_select ON tag_orders;
DROP POLICY IF EXISTS tag_orders_operator_isolation_insert ON tag_orders;
DROP POLICY IF EXISTS tag_orders_operator_isolation_update ON tag_orders;
DROP POLICY IF EXISTS tag_orders_operator_isolation_delete ON tag_orders;

CREATE POLICY tag_orders_operator_isolation_select
ON tag_orders
FOR SELECT
USING (operator_id = public.get_operator_id());

CREATE POLICY tag_orders_operator_isolation_insert
ON tag_orders
FOR INSERT
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY tag_orders_operator_isolation_update
ON tag_orders
FOR UPDATE
USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY tag_orders_operator_isolation_delete
ON tag_orders
FOR DELETE
USING (operator_id = public.get_operator_id());
