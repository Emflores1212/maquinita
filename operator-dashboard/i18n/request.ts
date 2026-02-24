import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { getMessages, normalizeLocale } from '@/lib/i18n';

export default getRequestConfig(async () => {
  const locale = normalizeLocale(cookies().get('maquinita_locale')?.value);

  return {
    locale,
    messages: await getMessages(locale),
  };
});
