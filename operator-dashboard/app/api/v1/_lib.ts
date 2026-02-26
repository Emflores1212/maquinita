import { NextResponse } from 'next/server';

export type ApiMeta = {
  page: number;
  total: number;
  limit: number;
};

export function success(data: unknown, meta?: ApiMeta) {
  return NextResponse.json(
    {
      success: true,
      data,
      meta: meta ?? null,
    },
    { status: 200 }
  );
}

export function failure(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    { status }
  );
}

export function resolveOperatorId(request: Request) {
  const operatorId = request.headers.get('x-operator-id')?.trim();
  return operatorId && operatorId.length > 0 ? operatorId : null;
}

export function resolveApiPermissions(request: Request) {
  const raw = request.headers.get('x-api-permissions') ?? '';
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function canUseCommands(request: Request) {
  const permissions = resolveApiPermissions(request);
  return permissions.includes('commands') || permissions.includes('full');
}

export function parsePage(searchParams: URLSearchParams) {
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 25) || 25));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}

export function startOfDayIso(daysAgo = 0) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}
