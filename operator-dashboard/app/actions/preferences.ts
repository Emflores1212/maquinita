'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { normalizeLocale, type SupportedLocale } from '@/lib/i18n';

export async function updateLanguage(language: string): Promise<{ ok: boolean; error?: string }> {
  const locale = normalizeLocale(language) as SupportedLocale;

  const supabase = createServerClient();
  const db = supabase as any;
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Not authenticated' };
  }

  const { error } = await db.from('profiles').update({ preferred_language: locale }).eq('id', user.id);

  if (error) {
    return { ok: false, error: 'Failed to update language' };
  }

  cookies().set('maquinita_locale', locale, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
  });

  revalidatePath('/');
  revalidatePath('/dashboard');

  return { ok: true };
}
