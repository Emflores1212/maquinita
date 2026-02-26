import { createBrowserClient as createSSRBrowserClient, createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database as RawDatabase } from '@/lib/types';

type AddRelationshipsToTables<Tables> = {
  [K in keyof Tables]: Tables[K] extends { Row: infer Row; Insert: infer Insert; Update: infer Update }
    ? {
        Row: Row;
        Insert: Insert;
        Update: Update;
        Relationships: [];
      }
    : Tables[K];
};

type AdaptSchema<Schema> = Schema extends {
  Tables: infer Tables;
  Views: infer Views;
  Functions: infer Functions;
  Enums: infer Enums;
  CompositeTypes: infer CompositeTypes;
}
  ? {
      Tables: AddRelationshipsToTables<Tables>;
      Views: Views;
      Functions: Functions;
      Enums: Enums;
      CompositeTypes: CompositeTypes;
    }
  : Schema;

type SupabaseDatabase = {
  [SchemaName in keyof RawDatabase]: AdaptSchema<RawDatabase[SchemaName]>;
};

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

let browserClient: ReturnType<typeof createSSRBrowserClient<SupabaseDatabase>> | undefined;

export function createBrowserClient() {
  if (typeof window === 'undefined') {
    throw new Error('createBrowserClient() can only be used in browser/client components.');
  }

  if (!browserClient) {
    browserClient = createSSRBrowserClient<SupabaseDatabase>(supabaseUrl(), supabaseAnonKey());
  }

  return browserClient;
}

export function createServerClient() {
  const cookieStore = cookies();

  return createSSRServerClient<SupabaseDatabase>(supabaseUrl(), supabaseAnonKey(), {
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

  return createSSRServerClient<SupabaseDatabase>(supabaseUrl(), supabaseAnonKey(), {
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

  return createClient<SupabaseDatabase>(supabaseUrl(), getEnvVar('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
