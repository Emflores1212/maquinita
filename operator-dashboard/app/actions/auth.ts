'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient, createServerClient } from '@/lib/supabase';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  returnUrl: z.string().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Minimo 8 caracteres / Minimum 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contrasenas no coinciden / Passwords do not match',
    path: ['confirmPassword'],
  });

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'driver', 'viewer']),
});

type ActionResult = {
  ok: boolean;
  error?: string;
};

export async function signInWithPasswordAction(payload: {
  email: string;
  password: string;
  returnUrl?: string;
}): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: 'Datos invalidos / Invalid data' };
  }

  const supabase = createServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (error.message.toLowerCase().includes('invalid login credentials')) {
      return { ok: false, error: 'Credenciales incorrectas / Invalid credentials' };
    }
    return { ok: false, error: 'No se pudo iniciar sesion / Unable to sign in' };
  }

  revalidatePath('/dashboard', 'layout');

  return { ok: true };
}

export async function requestPasswordResetAction(payload: { email: string }): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: 'Correo invalido / Invalid email' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { ok: false, error: 'NEXT_PUBLIC_APP_URL no esta configurada / NEXT_PUBLIC_APP_URL is not set' };
  }

  const supabase = createServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/reset-password`,
  });

  if (error) {
    return { ok: false, error: 'No se pudo enviar el correo / Failed to send reset email' };
  }

  return { ok: true };
}

export async function updatePasswordAction(payload: {
  password: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(payload);

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Datos invalidos / Invalid data';
    return { ok: false, error: message };
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Sesion no valida / Invalid session' };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, error: 'No se pudo actualizar la contrasena / Failed to update password' };
  }

  revalidatePath('/dashboard', 'layout');

  return { ok: true };
}

export async function signOutAction(): Promise<ActionResult> {
  const supabase = createServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { ok: false, error: 'No se pudo cerrar sesion / Unable to sign out' };
  }

  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

export async function inviteUser(email: string, role: string): Promise<ActionResult> {
  const parsed = inviteSchema.safeParse({ email, role });

  if (!parsed.success) {
    return { ok: false, error: 'Email o rol invalido / Invalid email or role' };
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'No autenticado / Not authenticated' };
  }

  const { data: inviterProfileData, error: inviterProfileError } = await supabase
    .from('profiles')
    .select('operator_id, role')
    .eq('id', user.id)
    .single();

  const inviterProfile = inviterProfileData as { operator_id: string | null; role: string | null } | null;

  if (inviterProfileError || !inviterProfile?.operator_id) {
    return { ok: false, error: 'Perfil invalido / Invalid profile' };
  }

  if (inviterProfile.role !== 'admin') {
    return { ok: false, error: 'Solo admin puede invitar / Admin only' };
  }

  const adminClient = createAdminClient();
  const adminDb = adminClient as any;

  const { data: invitationData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: {
      operator_id: inviterProfile.operator_id,
      role: parsed.data.role,
    },
  });

  if (inviteError) {
    return { ok: false, error: 'No se pudo invitar usuario / Failed to invite user' };
  }

  const invitedUserId = invitationData.user?.id;

  if (!invitedUserId) {
    return { ok: false, error: 'No se recibio user id invitado / Missing invited user id' };
  }

  const { error: profileUpsertError } = await adminDb.from('profiles').upsert(
    {
      id: invitedUserId,
      operator_id: inviterProfile.operator_id,
      role: parsed.data.role,
    },
    { onConflict: 'id' }
  );

  if (profileUpsertError) {
    return { ok: false, error: 'No se pudo crear perfil invitado / Failed to create invited profile' };
  }

  const { error: auditError } = await adminDb.from('audit_log').insert({
    operator_id: inviterProfile.operator_id,
    user_id: user.id,
    action: 'user.invited',
    entity_type: 'profiles',
    entity_id: invitedUserId,
    payload: {
      invited_email: parsed.data.email,
      invited_role: parsed.data.role,
    },
  });

  if (auditError) {
    return { ok: false, error: 'Invitado creado pero sin audit log / Invited user created but audit log failed' };
  }

  revalidatePath('/dashboard', 'layout');

  return { ok: true };
}
