// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import bcrypt from 'npm:bcryptjs@3.0.3';

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      ...extraHeaders,
    },
  });
}

function resolveBearerToken(request: Request) {
  const auth = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) return null;
  return token.trim();
}

function resolveForwardPath(requestUrl: URL) {
  const explicitPath = requestUrl.searchParams.get('path')?.trim();
  if (explicitPath && explicitPath.startsWith('/api/v1')) {
    return explicitPath;
  }

  const marker = '/api-gateway';
  const markerIndex = requestUrl.pathname.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const path = requestUrl.pathname.slice(markerIndex + marker.length);
  if (!path.startsWith('/api/v1')) {
    return null;
  }

  return path;
}

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const targetBaseUrl =
    Deno.env.get('API_PROXY_TARGET_URL') ?? Deno.env.get('NEXT_PUBLIC_APP_URL') ?? Deno.env.get('APP_URL') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Missing Supabase service credentials' }, 500);
  }

  if (!targetBaseUrl) {
    return json({ error: 'Missing API proxy target URL env (API_PROXY_TARGET_URL or NEXT_PUBLIC_APP_URL)' }, 500);
  }

  const apiKey = resolveBearerToken(request);
  if (!apiKey) {
    return json({ error: 'Invalid API key' }, 401);
  }

  if (!apiKey.startsWith('mq_live_')) {
    return json({ error: 'Invalid API key' }, 401);
  }

  const forwardPath = resolveForwardPath(new URL(request.url));
  if (!forwardPath) {
    return json({ error: 'Only /api/v1 paths are supported by api-gateway' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const keyPrefix = apiKey.slice(0, 16);
  const { data: candidateRows, error: candidateError } = await supabase
    .from('api_keys')
    .select('id, operator_id, key_hash, permissions, is_active, usage_count_today')
    .eq('is_active', true)
    .eq('key_prefix', keyPrefix);

  if (candidateError || !candidateRows || candidateRows.length === 0) {
    return json({ error: 'Invalid API key' }, 401);
  }

  let matchedKey: {
    id: string;
    operator_id: string | null;
    permissions: string[] | null;
    usage_count_today: number;
  } | null = null;

  for (const candidate of candidateRows as Array<{
    id: string;
    operator_id: string | null;
    key_hash: string;
    permissions: string[] | null;
    usage_count_today: number | null;
  }>) {
    const matches = await bcrypt.compare(apiKey, candidate.key_hash).catch(() => false);
    if (!matches) continue;

    matchedKey = {
      id: candidate.id,
      operator_id: candidate.operator_id,
      permissions: candidate.permissions ?? ['read'],
      usage_count_today: Number(candidate.usage_count_today ?? 0),
    };
    break;
  }

  if (!matchedKey?.id || !matchedKey.operator_id) {
    return json({ error: 'Invalid API key' }, 401);
  }

  if (matchedKey.usage_count_today >= 1000) {
    return json({ error: 'Rate limit exceeded' }, 429, { 'Retry-After': '60' });
  }

  await supabase
    .from('api_keys')
    .update({
      usage_count_today: matchedKey.usage_count_today + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', matchedKey.id);

  const forwardUrl = new URL(`${trimTrailingSlash(targetBaseUrl)}${forwardPath}`);
  forwardUrl.search = new URL(request.url).search;

  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (normalized === 'host' || normalized === 'authorization' || normalized === 'content-length') {
      return;
    }
    forwardHeaders.set(key, value);
  });
  forwardHeaders.set('x-operator-id', matchedKey.operator_id);
  forwardHeaders.set('x-api-key-id', matchedKey.id);
  forwardHeaders.set('x-api-permissions', (matchedKey.permissions ?? ['read']).join(','));

  const method = request.method.toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
      ? undefined
      : await request.arrayBuffer().catch(() => undefined);

  const upstreamResponse = await fetch(forwardUrl.toString(), {
    method,
    headers: forwardHeaders,
    body,
    redirect: 'manual',
  }).catch(() => null);

  if (!upstreamResponse) {
    return json({ error: 'Upstream API unavailable' }, 502);
  }

  const passthroughHeaders = new Headers();
  const contentType = upstreamResponse.headers.get('content-type');
  if (contentType) {
    passthroughHeaders.set('content-type', contentType);
  }

  const responseBody = await upstreamResponse.arrayBuffer();
  return new Response(responseBody, {
    status: upstreamResponse.status,
    headers: passthroughHeaders,
  });
});
