import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password'];
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/machines',
  '/products',
  '/inventory',
  '/restock',
  '/transactions',
  '/financials',
  '/discounts',
  '/analytics',
  '/settings',
];

function getPublicEnvVar(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
}

function isProtectedRoute(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function sanitizeReturnUrl(returnUrl: string | null) {
  if (!returnUrl || !returnUrl.startsWith('/')) {
    return '/dashboard';
  }
  return returnUrl;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(getPublicEnvVar('NEXT_PUBLIC_SUPABASE_URL'), getPublicEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
        });
      },
    },
  });

  // Required for Supabase SSR cookie refresh on every request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user && isProtectedRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('returnUrl', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (user && isAuthRoute) {
    const returnUrl = sanitizeReturnUrl(request.nextUrl.searchParams.get('returnUrl'));
    const url = request.nextUrl.clone();
    url.pathname = returnUrl;
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
