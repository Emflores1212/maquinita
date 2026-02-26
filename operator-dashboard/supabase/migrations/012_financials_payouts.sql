ALTER TABLE operators
ADD COLUMN IF NOT EXISTS stripe_account_id TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) NOT NULL,
  stripe_payout_id TEXT UNIQUE NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payout_transactions (
  payout_id UUID REFERENCES payouts(id) ON DELETE CASCADE NOT NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES operators(id) NOT NULL,
  stripe_balance_transaction_id TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (payout_id, stripe_balance_transaction_id)
);

CREATE INDEX IF NOT EXISTS payouts_operator_created_idx
ON payouts (operator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payouts_operator_status_created_idx
ON payouts (operator_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS payout_transactions_operator_payout_idx
ON payout_transactions (operator_id, payout_id);

CREATE INDEX IF NOT EXISTS payout_transactions_transaction_idx
ON payout_transactions (transaction_id);

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payouts_operator_isolation_select ON payouts;
DROP POLICY IF EXISTS payouts_operator_isolation_insert ON payouts;
DROP POLICY IF EXISTS payouts_operator_isolation_update ON payouts;
DROP POLICY IF EXISTS payouts_operator_isolation_delete ON payouts;

CREATE POLICY payouts_operator_isolation_select
ON payouts
FOR SELECT
USING (operator_id = public.get_operator_id());

CREATE POLICY payouts_operator_isolation_insert
ON payouts
FOR INSERT
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY payouts_operator_isolation_update
ON payouts
FOR UPDATE
USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY payouts_operator_isolation_delete
ON payouts
FOR DELETE
USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS payout_transactions_operator_isolation_select ON payout_transactions;
DROP POLICY IF EXISTS payout_transactions_operator_isolation_insert ON payout_transactions;
DROP POLICY IF EXISTS payout_transactions_operator_isolation_update ON payout_transactions;
DROP POLICY IF EXISTS payout_transactions_operator_isolation_delete ON payout_transactions;

CREATE POLICY payout_transactions_operator_isolation_select
ON payout_transactions
FOR SELECT
USING (operator_id = public.get_operator_id());

CREATE POLICY payout_transactions_operator_isolation_insert
ON payout_transactions
FOR INSERT
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY payout_transactions_operator_isolation_update
ON payout_transactions
FOR UPDATE
USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY payout_transactions_operator_isolation_delete
ON payout_transactions
FOR DELETE
USING (operator_id = public.get_operator_id());
