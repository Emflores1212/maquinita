import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types';

function getPublicEnvVar(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value =
    name === 'NEXT_PUBLIC_SUPABASE_URL'
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let browserClient: ReturnType<typeof createSSRBrowserClient<Database>> | undefined;

export function createBrowserClient() {
  if (typeof window === 'undefined') {
    throw new Error('createBrowserClient() can only be used in browser/client components.');
  }

  if (!browserClient) {
    browserClient = createSSRBrowserClient<Database>(
      getPublicEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
      getPublicEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    );
  }

  return browserClient;
}
