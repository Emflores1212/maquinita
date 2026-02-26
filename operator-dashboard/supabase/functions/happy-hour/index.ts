// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function normalizeTimezone(settings: unknown): string {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 'UTC';
  const timezone = (settings as Record<string, unknown>).timezone;
  if (typeof timezone === 'string' && timezone.trim()) {
    return timezone.trim();
  }
  return 'UTC';
}

function parseTimeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseSchedule(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;

  const days = Array.isArray(source.days)
    ? Array.from(
        new Set(
          source.days
            .map((entry) => String(entry).slice(0, 3).toLowerCase())
            .filter((entry) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(entry))
        )
      )
    : [];

  const from = typeof source.from === 'string' ? source.from.trim() : '';
  const to = typeof source.to === 'string' ? source.to.trim() : '';

  if (days.length === 0) return null;
  if (parseTimeToMinutes(from) === null || parseTimeToMinutes(to) === null) return null;

  return { days, from, to };
}

function isScheduleActive(params: { schedule: { days: string[]; from: string; to: string }; timeZone: string; now: Date }) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: params.timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(params.now);

  const weekday = parts.find((entry) => entry.type === 'weekday')?.value?.slice(0, 3).toLowerCase() ?? '';
  if (!params.schedule.days.includes(weekday)) {
    return false;
  }

  const hour = parts.find((entry) => entry.type === 'hour')?.value ?? '00';
  const minute = parts.find((entry) => entry.type === 'minute')?.value ?? '00';
  const currentMinutes = parseTimeToMinutes(`${hour}:${minute}`);
  const fromMinutes = parseTimeToMinutes(params.schedule.from);
  const toMinutes = parseTimeToMinutes(params.schedule.to);

  if (currentMinutes === null || fromMinutes === null || toMinutes === null) {
    return false;
  }

  if (toMinutes >= fromMinutes) {
    return currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
  }

  return currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: discountsData, error: discountsError } = await supabase
    .from('discounts')
    .select('id, operator_id, type, schedule, status, starts_at, ends_at')
    .eq('type', 'happy_hour')
    .neq('status', 'ended');

  if (discountsError) {
    return json({ ok: false, error: discountsError.message }, 500);
  }

  const discounts = discountsData ?? [];
  if (discounts.length === 0) {
    return json({ ok: true, processed: 0, updated: 0 });
  }

  const operatorIds = Array.from(new Set(discounts.map((discount) => discount.operator_id)));
  const { data: operatorsData } = await supabase.from('operators').select('id, settings').in('id', operatorIds);
  const timezoneByOperator = new Map((operatorsData ?? []).map((row) => [row.id, normalizeTimezone(row.settings)]));

  let updated = 0;
  const now = new Date();

  for (const discount of discounts) {
    const startsAt = discount.starts_at ? new Date(discount.starts_at) : null;
    const endsAt = discount.ends_at ? new Date(discount.ends_at) : null;
    const timezone = timezoneByOperator.get(discount.operator_id) ?? 'UTC';
    const schedule = parseSchedule(discount.schedule);

    let nextStatus = discount.status ?? 'paused';

    if (endsAt && endsAt <= now) {
      nextStatus = 'ended';
    } else if (startsAt && startsAt > now) {
      nextStatus = 'scheduled';
    } else if (!schedule) {
      nextStatus = 'paused';
    } else {
      nextStatus = isScheduleActive({ schedule, timeZone: timezone, now }) ? 'active' : 'paused';
    }

    if (nextStatus === discount.status) {
      continue;
    }

    const { error: updateError } = await supabase
      .from('discounts')
      .update({
        status: nextStatus,
        ended_at: nextStatus === 'ended' ? new Date().toISOString() : null,
      })
      .eq('id', discount.id)
      .eq('operator_id', discount.operator_id);

    if (!updateError) {
      updated += 1;
    }
  }

  return json({
    ok: true,
    processed: discounts.length,
    updated,
    schedule: 'Use pg_cron every 15 minutes to invoke this function endpoint.',
  });
});
