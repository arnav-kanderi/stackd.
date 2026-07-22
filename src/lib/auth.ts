import { supabase } from '@/lib/supabase';

// Generic failure messages on purpose: surfacing Supabase's raw error (e.g.
// "User already registered") lets an attacker probe whether a given email
// has an account. Shared by the real auth screen and the __DEV__-only
// supabase-test screen so this rule can't drift between the two.
const GENERIC_SIGNUP_ERROR = 'Sign up failed. Check your details and try again.';
const GENERIC_SIGNIN_ERROR = 'Sign in failed. Check your details and try again.';

export async function signUpWithPassword(
  email: string,
  password: string
): Promise<{ error: string | null; needsEmailConfirmation: boolean }> {
  const { error, data } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) return { error: GENERIC_SIGNUP_ERROR, needsEmailConfirmation: false };
  return { error: null, needsEmailConfirmation: !data.session };
}

export async function signInWithPassword(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { error: GENERIC_SIGNIN_ERROR };
  return { error: null };
}
