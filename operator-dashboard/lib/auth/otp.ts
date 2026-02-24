import { createBrowserClient } from '@/lib/supabase-browser';

export type PhoneOtpPayload = {
  phone: string;
};

export type VerifyPhoneOtpPayload = {
  phone: string;
  token: string;
};

export async function requestPhoneOtp({ phone }: PhoneOtpPayload) {
  const supabase = createBrowserClient();

  // TODO(phase-1.2): wire up full phone OTP UX and validation flow.
  return supabase.auth.signInWithOtp({ phone });
}

export async function verifyPhoneOtp({ phone, token }: VerifyPhoneOtpPayload) {
  const supabase = createBrowserClient();

  // TODO(phase-1.2): add dedicated OTP screens and error UX.
  return supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });
}
