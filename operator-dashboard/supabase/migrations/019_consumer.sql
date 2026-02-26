CREATE TABLE IF NOT EXISTS consumer_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  phone TEXT,
  full_name TEXT,
  credit_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  notification_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id UUID NOT NULL REFERENCES consumer_profiles(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('award', 'spend', 'refund')),
  amount NUMERIC(10,2) NOT NULL,
  reference_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consumer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id UUID NOT NULL REFERENCES consumer_profiles(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  operator_reply TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS consumer_profiles_operator_phone_idx
ON consumer_profiles (operator_id, phone);

CREATE INDEX IF NOT EXISTS credit_ledger_operator_consumer_created_idx
ON credit_ledger (operator_id, consumer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credit_ledger_consumer_created_idx
ON credit_ledger (consumer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS consumer_feedback_operator_created_idx
ON consumer_feedback (operator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS consumer_feedback_consumer_created_idx
ON consumer_feedback (consumer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_consumer_operator_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT operator_id FROM public.consumer_profiles WHERE id = auth.uid();
$$;

ALTER TABLE consumer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumer_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consumer_profiles_operator_select ON consumer_profiles;
DROP POLICY IF EXISTS consumer_profiles_operator_update ON consumer_profiles;
DROP POLICY IF EXISTS consumer_profiles_operator_delete ON consumer_profiles;
DROP POLICY IF EXISTS consumer_profiles_consumer_select ON consumer_profiles;
DROP POLICY IF EXISTS consumer_profiles_consumer_insert ON consumer_profiles;
DROP POLICY IF EXISTS consumer_profiles_consumer_update ON consumer_profiles;

CREATE POLICY consumer_profiles_operator_select ON consumer_profiles
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY consumer_profiles_operator_update ON consumer_profiles
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY consumer_profiles_operator_delete ON consumer_profiles
FOR DELETE USING (operator_id = public.get_operator_id());

CREATE POLICY consumer_profiles_consumer_select ON consumer_profiles
FOR SELECT USING (id = auth.uid());

CREATE POLICY consumer_profiles_consumer_insert ON consumer_profiles
FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY consumer_profiles_consumer_update ON consumer_profiles
FOR UPDATE USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS credit_ledger_operator_select ON credit_ledger;
DROP POLICY IF EXISTS credit_ledger_operator_insert ON credit_ledger;
DROP POLICY IF EXISTS credit_ledger_operator_update ON credit_ledger;
DROP POLICY IF EXISTS credit_ledger_operator_delete ON credit_ledger;
DROP POLICY IF EXISTS credit_ledger_consumer_select ON credit_ledger;

CREATE POLICY credit_ledger_operator_select ON credit_ledger
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY credit_ledger_operator_insert ON credit_ledger
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY credit_ledger_operator_update ON credit_ledger
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY credit_ledger_operator_delete ON credit_ledger
FOR DELETE USING (operator_id = public.get_operator_id());

CREATE POLICY credit_ledger_consumer_select ON credit_ledger
FOR SELECT USING (consumer_id = auth.uid());

DROP POLICY IF EXISTS consumer_feedback_operator_select ON consumer_feedback;
DROP POLICY IF EXISTS consumer_feedback_operator_insert ON consumer_feedback;
DROP POLICY IF EXISTS consumer_feedback_operator_update ON consumer_feedback;
DROP POLICY IF EXISTS consumer_feedback_operator_delete ON consumer_feedback;
DROP POLICY IF EXISTS consumer_feedback_consumer_select ON consumer_feedback;
DROP POLICY IF EXISTS consumer_feedback_consumer_insert ON consumer_feedback;
DROP POLICY IF EXISTS consumer_feedback_consumer_update ON consumer_feedback;
DROP POLICY IF EXISTS consumer_feedback_consumer_delete ON consumer_feedback;

CREATE POLICY consumer_feedback_operator_select ON consumer_feedback
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY consumer_feedback_operator_insert ON consumer_feedback
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY consumer_feedback_operator_update ON consumer_feedback
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY consumer_feedback_operator_delete ON consumer_feedback
FOR DELETE USING (operator_id = public.get_operator_id());

CREATE POLICY consumer_feedback_consumer_select ON consumer_feedback
FOR SELECT USING (consumer_id = auth.uid());

CREATE POLICY consumer_feedback_consumer_insert ON consumer_feedback
FOR INSERT WITH CHECK (
  consumer_id = auth.uid()
  AND operator_id = public.get_consumer_operator_id()
);

CREATE POLICY consumer_feedback_consumer_update ON consumer_feedback
FOR UPDATE USING (consumer_id = auth.uid())
WITH CHECK (
  consumer_id = auth.uid()
  AND operator_id = public.get_consumer_operator_id()
);

CREATE POLICY consumer_feedback_consumer_delete ON consumer_feedback
FOR DELETE USING (consumer_id = auth.uid());
