import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { createServerClient } from '@/lib/supabase';
import { getMessages, normalizeLocale } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'Maquinita Operator Dashboard',
  description: 'SaaS operator dashboard for smart fridges and vending machines',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let locale = normalizeLocale(cookieStore.get('maquinita_locale')?.value);

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('preferred_language')
      .eq('id', user.id)
      .maybeSingle();

    locale = normalizeLocale((profile as { preferred_language?: string | null } | null)?.preferred_language ?? locale);
  }

  const messages = await getMessages(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
