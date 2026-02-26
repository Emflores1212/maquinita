CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  permissions TEXT[] NOT NULL DEFAULT '{read}',
  last_used_at TIMESTAMPTZ,
  usage_count_today INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_operator_active_created_idx
ON api_keys (operator_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS api_keys_operator_prefix_idx
ON api_keys (operator_id, key_prefix, is_active);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID REFERENCES operators(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  secret TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_subscriptions_operator_active_idx
ON webhook_subscriptions (operator_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_subscriptions_events_gin_idx
ON webhook_subscriptions USING GIN (events);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event TEXT,
  payload JSONB,
  status INT,
  response_body TEXT,
  attempt_count INT NOT NULL DEFAULT 1,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_subscription_created_idx
ON webhook_deliveries (subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_deliveries_retry_queue_idx
ON webhook_deliveries (next_retry_at, created_at DESC);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_operator_isolation_select ON api_keys;
DROP POLICY IF EXISTS api_keys_operator_isolation_insert ON api_keys;
DROP POLICY IF EXISTS api_keys_operator_isolation_update ON api_keys;
DROP POLICY IF EXISTS api_keys_operator_isolation_delete ON api_keys;

CREATE POLICY api_keys_operator_isolation_select ON api_keys
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY api_keys_operator_isolation_insert ON api_keys
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY api_keys_operator_isolation_update ON api_keys
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY api_keys_operator_isolation_delete ON api_keys
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS webhook_subscriptions_operator_isolation_select ON webhook_subscriptions;
DROP POLICY IF EXISTS webhook_subscriptions_operator_isolation_insert ON webhook_subscriptions;
DROP POLICY IF EXISTS webhook_subscriptions_operator_isolation_update ON webhook_subscriptions;
DROP POLICY IF EXISTS webhook_subscriptions_operator_isolation_delete ON webhook_subscriptions;

CREATE POLICY webhook_subscriptions_operator_isolation_select ON webhook_subscriptions
FOR SELECT USING (operator_id = public.get_operator_id());

CREATE POLICY webhook_subscriptions_operator_isolation_insert ON webhook_subscriptions
FOR INSERT WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY webhook_subscriptions_operator_isolation_update ON webhook_subscriptions
FOR UPDATE USING (operator_id = public.get_operator_id())
WITH CHECK (operator_id = public.get_operator_id());

CREATE POLICY webhook_subscriptions_operator_isolation_delete ON webhook_subscriptions
FOR DELETE USING (operator_id = public.get_operator_id());

DROP POLICY IF EXISTS webhook_deliveries_operator_isolation_select ON webhook_deliveries;
DROP POLICY IF EXISTS webhook_deliveries_operator_isolation_insert ON webhook_deliveries;
DROP POLICY IF EXISTS webhook_deliveries_operator_isolation_update ON webhook_deliveries;
DROP POLICY IF EXISTS webhook_deliveries_operator_isolation_delete ON webhook_deliveries;

CREATE POLICY webhook_deliveries_operator_isolation_select ON webhook_deliveries
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM webhook_subscriptions ws
    WHERE ws.id = webhook_deliveries.subscription_id
      AND ws.operator_id = public.get_operator_id()
  )
);

CREATE POLICY webhook_deliveries_operator_isolation_insert ON webhook_deliveries
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM webhook_subscriptions ws
    WHERE ws.id = webhook_deliveries.subscription_id
      AND ws.operator_id = public.get_operator_id()
  )
);

CREATE POLICY webhook_deliveries_operator_isolation_update ON webhook_deliveries
FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM webhook_subscriptions ws
    WHERE ws.id = webhook_deliveries.subscription_id
      AND ws.operator_id = public.get_operator_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM webhook_subscriptions ws
    WHERE ws.id = webhook_deliveries.subscription_id
      AND ws.operator_id = public.get_operator_id()
  )
);

CREATE POLICY webhook_deliveries_operator_isolation_delete ON webhook_deliveries
FOR DELETE USING (
  EXISTS (
    SELECT 1
    FROM webhook_subscriptions ws
    WHERE ws.id = webhook_deliveries.subscription_id
      AND ws.operator_id = public.get_operator_id()
  )
);

CREATE OR REPLACE FUNCTION public.get_api_secret(p_secret_name TEXT)
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

CREATE OR REPLACE FUNCTION public.enqueue_webhook_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event TEXT;
  v_operator_id UUID;
  v_machine_id UUID;
  v_url TEXT;
  v_auth_header TEXT;
  v_headers JSONB;
  v_data JSONB;
BEGIN
  IF TG_TABLE_NAME = 'alerts' THEN
    IF NEW.resolved_at IS NOT NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.type = 'OFFLINE' THEN
      v_event := 'machine.offline';
    ELSIF NEW.type = 'TOO_WARM' THEN
      v_event := 'machine.too_warm';
    ELSIF NEW.type = 'LOW_STOCK' THEN
      v_event := 'inventory.low_stock';
    ELSE
      RETURN NEW;
    END IF;

    v_operator_id := NEW.operator_id;
    v_machine_id := NEW.machine_id;
    v_data := jsonb_build_object(
      'alert_id', NEW.id,
      'type', NEW.type,
      'severity', NEW.severity,
      'message', NEW.message
    );

  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF NEW.status IS DISTINCT FROM 'completed' THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
      RETURN NEW;
    END IF;

    v_event := 'transaction.completed';
    v_operator_id := NEW.operator_id;
    v_machine_id := NEW.machine_id;
    v_data := jsonb_build_object(
      'transaction_id', NEW.id,
      'amount', NEW.amount,
      'customer_phone', NEW.customer_phone,
      'customer_email', NEW.customer_email
    );

  ELSIF TG_TABLE_NAME = 'restock_sessions' THEN
    IF NEW.status IS DISTINCT FROM 'completed' THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
      RETURN NEW;
    END IF;

    v_event := 'restock.completed';
    v_operator_id := NEW.operator_id;
    v_machine_id := NEW.machine_id;
    v_data := jsonb_build_object(
      'restock_session_id', NEW.id,
      'discrepancy_count', NEW.discrepancy_count,
      'completed_at', NEW.completed_at
    );
  ELSE
    RETURN NEW;
  END IF;

  IF v_operator_id IS NULL OR v_event IS NULL THEN
    RETURN NEW;
  END IF;

  v_url := COALESCE(
    public.get_api_secret('DELIVER_WEBHOOKS_URL'),
    public.get_api_secret('deliver_webhooks_url')
  );

  IF v_url IS NULL OR length(trim(v_url)) = 0 THEN
    RETURN NEW;
  END IF;

  v_auth_header := COALESCE(
    public.get_api_secret('DELIVER_WEBHOOKS_AUTH'),
    public.get_api_secret('deliver_webhooks_auth')
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
        'event', v_event,
        'operator_id', v_operator_id,
        'machine_id', v_machine_id,
        'timestamp', NOW(),
        'data', v_data
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alerts_enqueue_webhook_trigger ON alerts;
DROP TRIGGER IF EXISTS transactions_enqueue_webhook_trigger ON transactions;
DROP TRIGGER IF EXISTS transactions_enqueue_webhook_update_trigger ON transactions;
DROP TRIGGER IF EXISTS restock_sessions_enqueue_webhook_trigger ON restock_sessions;
DROP TRIGGER IF EXISTS restock_sessions_enqueue_webhook_update_trigger ON restock_sessions;

CREATE TRIGGER alerts_enqueue_webhook_trigger
AFTER INSERT ON alerts
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_webhook_event();

CREATE TRIGGER transactions_enqueue_webhook_trigger
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_webhook_event();

CREATE TRIGGER transactions_enqueue_webhook_update_trigger
AFTER UPDATE OF status ON transactions
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_webhook_event();

CREATE TRIGGER restock_sessions_enqueue_webhook_trigger
AFTER INSERT ON restock_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_webhook_event();

CREATE TRIGGER restock_sessions_enqueue_webhook_update_trigger
AFTER UPDATE OF status ON restock_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_webhook_event();

DO $$
DECLARE
  v_deliver_url TEXT;
  v_deliver_auth TEXT;
BEGIN
  v_deliver_url := COALESCE(
    public.get_api_secret('DELIVER_WEBHOOKS_URL'),
    public.get_api_secret('deliver_webhooks_url')
  );
  v_deliver_auth := COALESCE(
    public.get_api_secret('DELIVER_WEBHOOKS_AUTH'),
    public.get_api_secret('deliver_webhooks_auth')
  );

  PERFORM cron.unschedule('webhook-delivery-retries');
  PERFORM cron.unschedule('api-keys-reset-daily');

  IF v_deliver_url IS NOT NULL AND length(trim(v_deliver_url)) > 0 THEN
    PERFORM cron.schedule(
      'webhook-delivery-retries',
      '*/1 * * * *',
      format(
        $sql$
        SELECT net.http_post(
          url := %L,
          headers := %L::jsonb,
          body := %L::jsonb
        );
        $sql$,
        v_deliver_url,
        jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', COALESCE(v_deliver_auth, '')
        )::text,
        jsonb_build_object('source', 'cron-retries')::text
      )
    );
  END IF;

  PERFORM cron.schedule(
    'api-keys-reset-daily',
    '0 0 * * *',
    'UPDATE public.api_keys SET usage_count_today = 0;'
  );
END;
$$;
