CREATE SCHEMA IF NOT EXISTS cron;
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.get_discounts_secret(p_secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'get_alerting_secret'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'SELECT public.get_alerting_secret($1)' INTO v_secret USING p_secret_name;
  END IF;

  IF v_secret IS NULL THEN
    v_secret := current_setting('app.settings.' || p_secret_name, TRUE);
  END IF;

  RETURN v_secret;
END;
$$;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'apply-expiration-discounts' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'happy-hour' LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'apply-expiration-discounts',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := COALESCE(public.get_discounts_secret('DISCOUNTS_FUNCTIONS_BASE_URL'), public.get_discounts_secret('discounts_functions_base_url')) || '/apply-expiration-discounts',
    headers := CASE
      WHEN COALESCE(public.get_discounts_secret('DISCOUNTS_FUNCTIONS_AUTH'), public.get_discounts_secret('discounts_functions_auth')) IS NULL
        THEN jsonb_build_object('Content-Type', 'application/json')
      ELSE jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', COALESCE(public.get_discounts_secret('DISCOUNTS_FUNCTIONS_AUTH'), public.get_discounts_secret('discounts_functions_auth'))
      )
    END,
    body := jsonb_build_object('source', 'pg_cron', 'job', 'apply-expiration-discounts')
  );
  $$
);

SELECT cron.schedule(
  'happy-hour',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := COALESCE(public.get_discounts_secret('DISCOUNTS_FUNCTIONS_BASE_URL'), public.get_discounts_secret('discounts_functions_base_url')) || '/happy-hour',
    headers := CASE
      WHEN COALESCE(public.get_discounts_secret('DISCOUNTS_FUNCTIONS_AUTH'), public.get_discounts_secret('discounts_functions_auth')) IS NULL
        THEN jsonb_build_object('Content-Type', 'application/json')
      ELSE jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', COALESCE(public.get_discounts_secret('DISCOUNTS_FUNCTIONS_AUTH'), public.get_discounts_secret('discounts_functions_auth'))
      )
    END,
    body := jsonb_build_object('source', 'pg_cron', 'job', 'happy-hour')
  );
  $$
);
