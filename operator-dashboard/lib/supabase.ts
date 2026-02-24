import { createBrowserClient as createSSRBrowserClient, createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types';

function getEnvVar(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const value =
    name === 'NEXT_PUBLIC_SUPABASE_URL'
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : name === 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
        ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = () => getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = () => getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY');

let browserClient: ReturnType<typeof createSSRBrowserClient<Database>> | undefined;

export function createBrowserClient() {
  if (typeof window === 'undefined') {
    throw new Error('createBrowserClient() can only be used in browser/client components.');
  }

  if (!browserClient) {
    browserClient = createSSRBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
  }

  return browserClient;
}

export function createServerClient() {
  const cookieStore = cookies();

  return createSSRServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string }>) {
        try {
          cookiesToSet.forEach(({ name, value }) => cookieStore.set(name, value));
        } catch {
          // Server components may not be able to set cookies; middleware handles refresh.
        }
      },
    },
  });
}

export function createRouteHandlerClient() {
  const cookieStore = cookies();

  return createSSRServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string }>) {
        cookiesToSet.forEach(({ name, value }) => cookieStore.set(name, value));
      },
    },
  });
}

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() cannot be called from browser/client runtime.');
  }

  return createClient<Database>(supabaseUrl(), getEnvVar('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
