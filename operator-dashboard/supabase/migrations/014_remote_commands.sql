DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'machine_commands' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.machine_commands RENAME COLUMN created_at TO issued_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'machine_commands' AND column_name = 'acked_at'
  ) THEN
    ALTER TABLE public.machine_commands RENAME COLUMN acked_at TO acknowledged_at;
  END IF;
END $$;

ALTER TABLE public.machine_commands
  ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

UPDATE public.machine_commands
SET status = 'acknowledged'
WHERE status IN ('acked', 'sent');

UPDATE public.machine_commands
SET
  status = 'failed',
  error_message = COALESCE(error_message, 'Command canceled')
WHERE status = 'canceled';

UPDATE public.machine_commands
SET issued_at = NOW()
WHERE issued_at IS NULL;

ALTER TABLE public.machine_commands
  ALTER COLUMN issued_at SET DEFAULT NOW(),
  ALTER COLUMN issued_at SET NOT NULL;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.machine_commands'::regclass
      AND contype = 'c'
      AND (conname ILIKE '%type%' OR conname ILIKE '%status%')
  LOOP
    EXECUTE format('ALTER TABLE public.machine_commands DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.machine_commands
  ADD CONSTRAINT machine_commands_type_check
  CHECK (type IN ('LOCKDOWN', 'UNLOCK', 'REBOOT', 'TEMP_ADJUST')),
  ADD CONSTRAINT machine_commands_status_check
  CHECK (status IN ('pending', 'acknowledged', 'executed', 'failed'));

WITH ranked_active AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY machine_id, type
      ORDER BY issued_at DESC, id DESC
    ) AS row_num
  FROM public.machine_commands
  WHERE status IN ('pending', 'acknowledged')
)
UPDATE public.machine_commands AS mc
SET
  status = 'failed',
  error_message = COALESCE(mc.error_message, 'Superseded by newer active command during 014 migration')
FROM ranked_active AS ra
WHERE mc.id = ra.id
  AND ra.row_num > 1;

DROP INDEX IF EXISTS machine_commands_operator_machine_status_created_idx;
DROP INDEX IF EXISTS machine_commands_lockdown_pending_unique_idx;
DROP INDEX IF EXISTS machine_commands_active_unique_idx;

CREATE INDEX IF NOT EXISTS machine_commands_machine_status_issued_idx
ON public.machine_commands (machine_id, status, issued_at ASC);

CREATE INDEX IF NOT EXISTS machine_commands_operator_machine_issued_desc_idx
ON public.machine_commands (operator_id, machine_id, issued_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS machine_commands_active_unique_idx
ON public.machine_commands (machine_id, type)
WHERE status IN ('pending', 'acknowledged');
