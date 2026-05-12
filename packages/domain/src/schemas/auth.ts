import { z } from 'zod';

/**
 * Auth input schemas — the contract for the web (and later mobile) sign-in /
 * sign-up forms. These mirror what Better Auth's email/password provider
 * accepts; keeping them in `@pusula/domain` lets every client validate the same
 * shape before hitting `${API_URL}/api/auth/*`.
 */

/** Normalize (trim + lowercase) the raw input, then enforce email shape. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Geçerli bir e-posta girin'));
/** Better Auth's default email/password minimum is 8; cap to a sane upper bound. */
export const passwordSchema = z
  .string()
  .min(8, 'Parola en az 8 karakter olmalı')
  .max(128, 'Parola en fazla 128 karakter olabilir');
export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Ad gerekli')
  .max(80, 'Ad en fazla 80 karakter olabilir');

export const signInInput = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signUpInput = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

/**
 * "Forgot password" form: just an email. The actual reset link is mailed by
 * Better Auth (`requestPasswordReset` → `emailAndPassword.sendResetPassword` →
 * Resend). The response never says whether the email exists — the client treats
 * any non-error response as "if that address has an account, a link is on its
 * way". See `docs/architecture/07-auth.md` (Şifre sıfırlama akışı).
 */
export const forgotPasswordInput = z.object({
  email: emailSchema,
});

/**
 * "Reset password" form: the one-time token (read from the `?token=` query
 * param on the reset link) plus the new password (same rule as sign-up —
 * `passwordSchema`, 8..128). Submitted to Better Auth's `resetPassword`.
 */
export const resetPasswordInput = z.object({
  token: z.string().min(1, 'Sıfırlama bağlantısı geçersiz veya eksik'),
  newPassword: passwordSchema,
});

export type SignInInput = z.infer<typeof signInInput>;
export type SignUpInput = z.infer<typeof signUpInput>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInput>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInput>;
