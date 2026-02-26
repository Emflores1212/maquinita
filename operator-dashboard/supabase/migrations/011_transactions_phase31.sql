ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS card_last4 TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd',
ADD COLUMN IF NOT EXISTS status_timeline JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS transactions_operator_status_created_idx
ON transactions (operator_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_operator_machine_created_idx
ON transactions (operator_id, machine_id, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_operator_offline_synced_idx
ON transactions (operator_id, is_offline_sync, synced_at DESC);
