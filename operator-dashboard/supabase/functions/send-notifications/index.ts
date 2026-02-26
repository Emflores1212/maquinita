import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

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

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function shouldSendCriticalSms(alertType: string) {
  return alertType === 'OFFLINE' || alertType === 'TOO_WARM';
}

async function sendResendEmail({ apiKey, from, to, subject, html }: { apiKey: string; from: string; to: string; subject: string; html: string }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  return response.ok;
}

async function sendTwilioSms({
  accountSid,
  authToken,
  from,
  to,
  body,
}: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const basic = btoa(`${accountSid}:${authToken}`);
  const form = new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  return response.ok;
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

  const body = await req.json().catch(() => null);
  const alertId = body?.alert_id;

  if (!alertId || typeof alertId !== 'string') {
    return json({ ok: false, error: 'Missing alert_id' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: 'Missing Supabase service credentials' }, 500);
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const resendFrom = Deno.env.get('RESEND_FROM_EMAIL') ?? 'alerts@maquinita.app';
  const appUrl = (Deno.env.get('NEXT_PUBLIC_APP_URL') ?? Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER');

  const vapidPublicKey = Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:alerts@maquinita.app';

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: alertRow, error: alertError } = await supabase
    .from('alerts')
    .select('id, operator_id, machine_id, type, severity, message, created_at, resolved_at')
    .eq('id', alertId)
    .maybeSingle();

  if (alertError || !alertRow?.id) {
    return json({ ok: false, error: alertError?.message ?? 'Alert not found' }, 404);
  }

  if (alertRow.resolved_at) {
    return json({ ok: true, skipped: true, reason: 'alert_resolved' });
  }

  const { data: machineRow } = await supabase
    .from('machines')
    .select('id, name, address')
    .eq('id', alertRow.machine_id)
    .maybeSingle();

  const { data: prefRows } = await supabase
    .from('machine_alert_preferences')
    .select('user_id, email_enabled, sms_enabled, push_enabled')
    .eq('operator_id', alertRow.operator_id)
    .eq('machine_id', alertRow.machine_id)
    .eq('alert_type', alertRow.type);

  const prefs = prefRows ?? [];
  if (prefs.length === 0) {
    return json({ ok: true, skipped: true, reason: 'no_preferences' });
  }

  const userIds = dedupe(prefs.map((row) => row.user_id));
  const { data: pushRows } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, subscription')
    .eq('operator_id', alertRow.operator_id)
    .in('user_id', userIds);

  const authUsers = new Map<string, { email: string | null; phone: string | null }>();

  for (const userId of userIds) {
    const { data: userResponse } = await supabase.auth.admin.getUserById(userId);
    authUsers.set(userId, {
      email: userResponse?.user?.email ?? null,
      phone: userResponse?.user?.phone ?? null,
    });
  }

  const machineName = machineRow?.name ?? 'Machine';
  const machineAddress = machineRow?.address ?? '-';
  const machineUrl = alertRow.machine_id ? `${appUrl}/machines/${alertRow.machine_id}` : `${appUrl}/dashboard`;

  const title = `Maquinita Alert: ${alertRow.type}`;
  const bodyText = alertRow.message ?? `${machineName} raised ${alertRow.type}`;

  let emailsSent = 0;
  let smsSent = 0;
  let pushSent = 0;

  for (const pref of prefs) {
    const authUser = authUsers.get(pref.user_id) ?? { email: null, phone: null };

    if (pref.email_enabled && resendApiKey && authUser.email) {
      const ok = await sendResendEmail({
        apiKey: resendApiKey,
        from: resendFrom,
        to: authUser.email,
        subject: title,
        html: `
          <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.4;">
            <h2 style="margin:0 0 10px;">${title}</h2>
            <p style="margin:0 0 10px;">${bodyText}</p>
            <p style="margin:0 0 6px;"><strong>Machine:</strong> ${machineName}</p>
            <p style="margin:0 0 14px;"><strong>Address:</strong> ${machineAddress}</p>
            <a href="${machineUrl}" style="display:inline-block;background:#0D2B4E;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;">View Machine</a>
          </div>
        `,
      });

      if (ok) {
        emailsSent += 1;
      }
    }

    if (pref.sms_enabled && shouldSendCriticalSms(alertRow.type) && twilioSid && twilioToken && twilioFrom && authUser.phone) {
      const ok = await sendTwilioSms({
        accountSid: twilioSid,
        authToken: twilioToken,
        from: twilioFrom,
        to: authUser.phone,
        body: `Maquinita Alert: ${machineName} is ${alertRow.type}. Check dashboard.`,
      });

      if (ok) {
        smsSent += 1;
      }
    }
  }

  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const pushByUser = new Map<string, Array<{ id: string; subscription: unknown }>>();

    for (const row of pushRows ?? []) {
      const existing = pushByUser.get(row.user_id) ?? [];
      existing.push({ id: row.id, subscription: row.subscription });
      pushByUser.set(row.user_id, existing);
    }

    for (const pref of prefs) {
      if (!pref.push_enabled) {
        continue;
      }

      const subscriptions = pushByUser.get(pref.user_id) ?? [];

      for (const subscriptionRow of subscriptions) {
        try {
          await webpush.sendNotification(
            subscriptionRow.subscription,
            JSON.stringify({
              title,
              body: bodyText,
              url: machineUrl,
            })
          );
          pushSent += 1;
        } catch {
          // Ignore individual push failures.
        }
      }
    }
  }

  return json({
    ok: true,
    alertId: alertRow.id,
    emailsSent,
    smsSent,
    pushSent,
  });
});
