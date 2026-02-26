CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;

CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('welcome', 'nth_purchase', 'spend_threshold')),
  trigger_value NUMERIC,
  reward_credits NUMERIC(10,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bonus_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
  consumer_id UUID REFERENCES consumer_profiles(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES operators(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rule_id, consumer_id)
);

CREATE TABLE IF NOT EXISTS notification_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target JSONB NOT NULL DEFAULT '{}'::jsonb,
  deep_link_url TEXT,
  sent_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_rules_operator_active_created_idx
ON automation_rules (operator_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS automation_rules_operator_trigger_idx
ON automation_rules (operator_id, trigger_type, is_active);

CREATE INDEX IF NOT EXISTS bonus_awards_operator_created_idx
ON bonus_awards (operator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bonus_awards_rule_consumer_idx
ON bonus_awards (rule_id, consumer_id);

CREATE INDEX IF NOT EXISTS notification_sends_operator_created_idx
ON notification_sends (operator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_sends_scheduled_queue_idx
ON notification_sends (sent_at, scheduled_for, created_at);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_rules_operator_isolation_select ON automation_rules;
DROP POLICY IF EXISTS automation_rules_operator_isolation_insert ON automation_rules;
DROP POLICY IF EXISTS automation_rules_operator_isolation_update ON automation_rules;
DROP POLICY IF EXISTS automation_rules_operator_isolation_delete ON automation_rules;

CREATE POLICY automation_rules_operator_isolation_select ON automation_rules
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY automation_rules_operator_isolation_insert ON automation_rules
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY automation_rules_operator_isolation_update ON automation_rules
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY automation_rules_operator_isolation_delete ON automation_rules
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS bonus_awards_operator_isolation_select ON bonus_awards;
DROP POLICY IF EXISTS bonus_awards_operator_isolation_insert ON bonus_awards;
DROP POLICY IF EXISTS bonus_awards_operator_isolation_update ON bonus_awards;
DROP POLICY IF EXISTS bonus_awards_operator_isolation_delete ON bonus_awards;

CREATE POLICY bonus_awards_operator_isolation_select ON bonus_awards
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY bonus_awards_operator_isolation_insert ON bonus_awards
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY bonus_awards_operator_isolation_update ON bonus_awards
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY bonus_awards_operator_isolation_delete ON bonus_awards
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS notification_sends_operator_isolation_select ON notification_sends;
DROP POLICY IF EXISTS notification_sends_operator_isolation_insert ON notification_sends;
DROP POLICY IF EXISTS notification_sends_operator_isolation_update ON notification_sends;
DROP POLICY IF EXISTS notification_sends_operator_isolation_delete ON notification_sends;

CREATE POLICY notification_sends_operator_isolation_select ON notification_sends
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY notification_sends_operator_isolation_insert ON notification_sends
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY notification_sends_operator_isolation_update ON notification_sends
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY notification_sends_operator_isolation_delete ON notification_sends
FOR DELETE USING (operator_id = public.get_operator_id());

CREATE OR REPLACE FUNCTION public.get_marketing_secret(p_secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  BEGIN
    EXECUTE
      'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
      INTO v_secret
      USING p_secret_name;
  EXCEPTION
    WHEN undefined_table OR invalid_schema_name THEN
      v_secret := NULL;
  END;

  IF v_secret IS NULL THEN
    v_secret := current_setting('app.settings.' || p_secret_name, TRUE);
  END IF;

  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_consumer_ids_for_custom_segment(
  p_operator_id UUID,
  p_where_sql TEXT
)
RETURNS TABLE(consumer_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql TEXT;
BEGIN
  IF p_where_sql IS NULL OR length(trim(p_where_sql)) = 0 THEN
    RETURN;
  END IF;

  IF p_where_sql ~ ';' OR p_where_sql ~ '--' OR p_where_sql ~ '/\*' THEN
    RAISE EXCEPTION 'Unsafe custom segment SQL';
  END IF;

  IF p_where_sql ~* '\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b' THEN
    RAISE EXCEPTION 'Unsupported custom segment SQL';
  END IF;

  v_sql := format(
    'SELECT cp.id AS consumer_id
     FROM public.consumer_profiles cp
     WHERE cp.operator_id = $1
       AND (%s)',
    p_where_sql
  );

  RETURN QUERY EXECUTE v_sql USING p_operator_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_automation_evaluation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_auth_header TEXT;
  v_headers JSONB;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  v_url := COALESCE(
    public.get_marketing_secret('AUTOMATIONS_EVALUATION_URL'),
    public.get_marketing_secret('automations_evaluation_url')
  );

  IF v_url IS NULL OR length(trim(v_url)) = 0 THEN
    RETURN NEW;
  END IF;

  v_auth_header := COALESCE(
    public.get_marketing_secret('AUTOMATIONS_EVALUATION_AUTH'),
    public.get_marketing_secret('automations_evaluation_auth')
  );

  v_headers := jsonb_build_object('Content-Type', 'application/json');
  IF v_auth_header IS NOT NULL AND length(trim(v_auth_header)) > 0 THEN
    v_headers := v_headers || jsonb_build_object('Authorization', v_auth_header);
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := v_headers,
      body := jsonb_build_object(
        'transaction_id', NEW.id,
        'operator_id', NEW.operator_id
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_enqueue_automation_evaluation_trigger ON transactions;

CREATE TRIGGER transactions_enqueue_automation_evaluation_trigger
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_automation_evaluation();

DO $$
DECLARE
  v_send_push_url TEXT;
  v_send_push_auth TEXT;
  v_job_name TEXT := 'marketing-send-push';
BEGIN
  v_send_push_url := COALESCE(
    public.get_marketing_secret('MARKETING_SEND_PUSH_URL'),
    public.get_marketing_secret('marketing_send_push_url')
  );
  v_send_push_auth := COALESCE(
    public.get_marketing_secret('MARKETING_SEND_PUSH_AUTH'),
    public.get_marketing_secret('marketing_send_push_auth')
  );

  IF v_send_push_url IS NULL OR length(trim(v_send_push_url)) = 0 THEN
    RETURN;
  END IF;

  PERFORM cron.unschedule(v_job_name);

  PERFORM cron.schedule(
    v_job_name,
    '*/5 * * * *',
    format(
      $sql$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := %L::jsonb
      );
      $sql$,
      v_send_push_url,
      jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', COALESCE(v_send_push_auth, '')
      )::text,
      jsonb_build_object('source', 'pg_cron')::text
    )
  );
END;
$$;
