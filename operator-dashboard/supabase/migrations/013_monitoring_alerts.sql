CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS temperature_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) NOT NULL,
  machine_id UUID REFERENCES machines(id) NOT NULL,
  temperature NUMERIC(5,2) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS temperature_readings_operator_machine_recorded_idx
ON temperature_readings (operator_id, machine_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS temperature_readings_machine_recorded_idx
ON temperature_readings (machine_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique_idx
ON push_subscriptions ((subscription ->> 'endpoint'));

CREATE INDEX IF NOT EXISTS push_subscriptions_operator_user_idx
ON push_subscriptions (operator_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS machine_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) NOT NULL,
  machine_id UUID REFERENCES machines(id) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('LOCKDOWN')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'acked', 'failed', 'canceled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  acked_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS machine_commands_operator_machine_status_created_idx
ON machine_commands (operator_id, machine_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS machine_commands_lockdown_pending_unique_idx
ON machine_commands (machine_id, type)
WHERE type = 'LOCKDOWN' AND status IN ('pending', 'sent');

CREATE TABLE IF NOT EXISTS machine_alert_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) NOT NULL,
  machine_id UUID REFERENCES machines(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('OFFLINE', 'TOO_WARM', 'RFID_ERROR', 'LOW_STOCK')),
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  delay_minutes INT NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0 AND delay_minutes <= 120),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (operator_id, machine_id, user_id, alert_type)
);

CREATE INDEX IF NOT EXISTS machine_alert_preferences_operator_machine_type_idx
ON machine_alert_preferences (operator_id, machine_id, alert_type);

CREATE INDEX IF NOT EXISTS machine_alert_preferences_operator_user_idx
ON machine_alert_preferences (operator_id, user_id);

CREATE TABLE IF NOT EXISTS machine_alert_conditions (
  operator_id UUID REFERENCES operators(id) NOT NULL,
  machine_id UUID REFERENCES machines(id) NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('OFFLINE', 'TOO_WARM', 'RFID_ERROR', 'LOW_STOCK')),
  condition_started_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (machine_id, alert_type)
);

CREATE INDEX IF NOT EXISTS machine_alert_conditions_operator_machine_idx
ON machine_alert_conditions (operator_id, machine_id);

CREATE UNIQUE INDEX IF NOT EXISTS alerts_active_machine_type_unique_idx
ON alerts (operator_id, machine_id, type)
WHERE resolved_at IS NULL AND type IN ('OFFLINE', 'TOO_WARM', 'RFID_ERROR');

CREATE OR REPLACE FUNCTION touch_machine_alert_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS machine_alert_preferences_updated_at_trigger ON machine_alert_preferences;

CREATE TRIGGER machine_alert_preferences_updated_at_trigger
BEFORE UPDATE ON machine_alert_preferences
FOR EACH ROW
EXECUTE FUNCTION touch_machine_alert_preferences_updated_at();

ALTER TABLE temperature_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_alert_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_alert_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS temperature_readings_operator_isolation_select ON temperature_readings;
DROP POLICY IF EXISTS temperature_readings_operator_isolation_insert ON temperature_readings;
DROP POLICY IF EXISTS temperature_readings_operator_isolation_update ON temperature_readings;
DROP POLICY IF EXISTS temperature_readings_operator_isolation_delete ON temperature_readings;

CREATE POLICY temperature_readings_operator_isolation_select ON temperature_readings
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY temperature_readings_operator_isolation_insert ON temperature_readings
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY temperature_readings_operator_isolation_update ON temperature_readings
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY temperature_readings_operator_isolation_delete ON temperature_readings
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS push_subscriptions_operator_isolation_select ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_operator_isolation_insert ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_operator_isolation_update ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_operator_isolation_delete ON push_subscriptions;

CREATE POLICY push_subscriptions_operator_isolation_select ON push_subscriptions
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY push_subscriptions_operator_isolation_insert ON push_subscriptions
FOR INSERT WITH CHECK (operator_id = public.get_operator_id() AND user_id = auth.uid());

CREATE POLICY push_subscriptions_operator_isolation_update ON push_subscriptions
FOR UPDATE USING (operator_id = public.get_operator_id() AND user_id = auth.uid())
WITH CHECK (operator_id = public.get_operator_id() AND user_id = auth.uid());

CREATE POLICY push_subscriptions_operator_isolation_delete ON push_subscriptions
FOR DELETE USING (operator_id = public.get_operator_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS machine_commands_operator_isolation_select ON machine_commands;
DROP POLICY IF EXISTS machine_commands_operator_isolation_insert ON machine_commands;
DROP POLICY IF EXISTS machine_commands_operator_isolation_update ON machine_commands;
DROP POLICY IF EXISTS machine_commands_operator_isolation_delete ON machine_commands;

CREATE POLICY machine_commands_operator_isolation_select ON machine_commands
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY machine_commands_operator_isolation_insert ON machine_commands
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY machine_commands_operator_isolation_update ON machine_commands
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY machine_commands_operator_isolation_delete ON machine_commands
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS machine_alert_preferences_operator_isolation_select ON machine_alert_preferences;
DROP POLICY IF EXISTS machine_alert_preferences_operator_isolation_insert ON machine_alert_preferences;
DROP POLICY IF EXISTS machine_alert_preferences_operator_isolation_update ON machine_alert_preferences;
DROP POLICY IF EXISTS machine_alert_preferences_operator_isolation_delete ON machine_alert_preferences;

CREATE POLICY machine_alert_preferences_operator_isolation_select ON machine_alert_preferences
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY machine_alert_preferences_operator_isolation_insert ON machine_alert_preferences
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY machine_alert_preferences_operator_isolation_update ON machine_alert_preferences
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY machine_alert_preferences_operator_isolation_delete ON machine_alert_preferences
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS machine_alert_conditions_operator_isolation_select ON machine_alert_conditions;
DROP POLICY IF EXISTS machine_alert_conditions_operator_isolation_insert ON machine_alert_conditions;
DROP POLICY IF EXISTS machine_alert_conditions_operator_isolation_update ON machine_alert_conditions;
DROP POLICY IF EXISTS machine_alert_conditions_operator_isolation_delete ON machine_alert_conditions;

CREATE POLICY machine_alert_conditions_operator_isolation_select ON machine_alert_conditions
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY machine_alert_conditions_operator_isolation_insert ON machine_alert_conditions
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY machine_alert_conditions_operator_isolation_update ON machine_alert_conditions
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY machine_alert_conditions_operator_isolation_delete ON machine_alert_conditions
FOR DELETE USING (operator_id = public.get_operator_id());

CREATE OR REPLACE FUNCTION public.get_alerting_secret(p_secret_name TEXT)
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

CREATE OR REPLACE FUNCTION public.enqueue_alert_notification()
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
  IF NEW.resolved_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_url := COALESCE(
    public.get_alerting_secret('ALERT_NOTIFICATIONS_URL'),
    public.get_alerting_secret('alert_notifications_url')
  );

  IF v_url IS NULL OR length(trim(v_url)) = 0 THEN
    RETURN NEW;
  END IF;

  v_auth_header := COALESCE(
    public.get_alerting_secret('ALERT_NOTIFICATIONS_AUTH'),
    public.get_alerting_secret('alert_notifications_auth')
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
        'alert_id', NEW.id,
        'operator_id', NEW.operator_id,
        'machine_id', NEW.machine_id,
        'type', NEW.type
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Best effort only. Alert creation must never fail due to network delivery.
      NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alerts_enqueue_notification_trigger ON alerts;

CREATE TRIGGER alerts_enqueue_notification_trigger
AFTER INSERT ON alerts
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_alert_notification();
