CREATE TABLE IF NOT EXISTS restock_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'in_progress',
  items_added JSONB DEFAULT '[]'::jsonb,
  items_removed JSONB DEFAULT '[]'::jsonb,
  physical_counts JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  photo_urls TEXT[] DEFAULT '{}'::text[],
  discrepancy_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS restock_sessions_operator_started_idx
ON restock_sessions (operator_id, started_at DESC);

CREATE INDEX IF NOT EXISTS restock_sessions_machine_started_idx
ON restock_sessions (machine_id, started_at DESC);

CREATE INDEX IF NOT EXISTS restock_sessions_started_by_idx
ON restock_sessions (started_by, started_at DESC);

ALTER TABLE restock_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS restock_sessions_operator_isolation_select ON restock_sessions;
DROP POLICY IF EXISTS restock_sessions_operator_isolation_insert ON restock_sessions;
DROP POLICY IF EXISTS restock_sessions_operator_isolation_update ON restock_sessions;
DROP POLICY IF EXISTS restock_sessions_operator_isolation_delete ON restock_sessions;

CREATE POLICY restock_sessions_operator_isolation_select
ON restock_sessions
FOR SELECT
USING (operator_id = public.get_operator_id());

CREATE POLICY restock_sessions_operator_isolation_insert
ON restock_sessions
FOR INSERT
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY restock_sessions_operator_isolation_update
ON restock_sessions
FOR UPDATE
USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY restock_sessions_operator_isolation_delete
ON restock_sessions
FOR DELETE
USING (operator_id = public.get_operator_id());
