'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Mail, Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { signInWithPasswordAction } from '@/app/actions/auth';

const loginSchema = z.object({
  email: z.string().email('Correo invalido / Invalid email'),
  password: z.string().min(6, 'Minimo 6 caracteres / Minimum 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function sanitizeReturnUrl(returnUrl: string | null) {
  if (!returnUrl || !returnUrl.startsWith('/')) {
    return '/dashboard';
  }
  return returnUrl;
}

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isPending, startTransition] = useTransition();

  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = sanitizeReturnUrl(searchParams.get('returnUrl'));

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    setServerError('');

    startTransition(async () => {
      const result = await signInWithPasswordAction({
        ...values,
        returnUrl,
      });

      if (!result.ok) {
        setServerError(result.error ?? t('invalidCredentials'));
        return;
      }

      router.replace(returnUrl);
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D2B4E] shadow-2xl shadow-[#0D2B4E]/30 sm:h-20 sm:w-20 sm:rounded-3xl">
            <span className="text-3xl font-extrabold tracking-tighter text-white sm:text-4xl">M.</span>
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-slate-900 sm:mt-8 sm:text-4xl">
          {t('title')}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:mt-10 sm:w-full sm:max-w-md">
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white px-6 py-8 shadow-2xl shadow-slate-200/50 sm:rounded-[2rem] sm:px-8 sm:py-10">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#0D2B4E] via-[#1565C0] to-[#42A5F5]" />

          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div>
              <label htmlFor="login-email" className="block text-sm font-semibold text-slate-700">
                {t('email')}
              </label>
              <div className="relative mt-2">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#1565C0] focus:bg-white focus:ring-2 focus:ring-[#1565C0] sm:py-3.5"
                  placeholder="you@company.com"
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold text-slate-700">
                {t('password')}
              </label>
              <div className="relative mt-2">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-12 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#1565C0] focus:bg-white focus:ring-2 focus:ring-[#1565C0] sm:py-3.5"
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
            </div>

            <div className="flex items-center justify-end">
              <Link href="/forgot-password" className="text-sm font-medium text-[#1565C0] transition-colors hover:text-[#0D47A1]">
                {t('forgot')}
              </Link>
            </div>

            {serverError && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-3.5 text-center text-sm font-semibold text-red-600">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[#0D2B4E] px-4 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#0D2B4E]/15 transition-all hover:bg-[#0A2240] focus:outline-none focus:ring-2 focus:ring-[#1565C0] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 sm:py-4"
            >
              {isSubmitting || isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {t('submit')}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
