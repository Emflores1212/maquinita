import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';
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

function getPublicEnvVar(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = name === 'NEXT_PUBLIC_SUPABASE_URL' ? process.env.NEXT_PUBLIC_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let browserClient: ReturnType<typeof createSSRBrowserClient<SupabaseDatabase>> | undefined;

// Compatibility wrapper for older imports. Server code should use lib/supabase.ts.
export function createBrowserClient() {
  if (typeof window === 'undefined') {
    throw new Error('createBrowserClient() can only be used in browser/client components.');
  }

  if (!browserClient) {
    browserClient = createSSRBrowserClient<SupabaseDatabase>(
      getPublicEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
      getPublicEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    );
  }

  return browserClient;
}
