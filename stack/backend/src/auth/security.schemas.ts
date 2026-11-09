import { z } from 'zod';
import { passwordSchema } from './auth.schemas';

/** Request bodies for password reset, email verification and two-factor sign-in. */

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email('email is not valid'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'token is required').max(200),
  newPassword: passwordSchema,
});

export const tokenSchema = z.object({
  token: z.string().min(1, 'token is required').max(200),
});

/** A TOTP code or a recovery code. The shape is checked by the service. */
const codeField = z.string().trim().min(1, 'code is required').max(40);

export const twoFactorEnableSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'code must be 6 digits'),
});

export const twoFactorPasswordCodeSchema = z.object({
  password: z.string().min(1, 'password is required').max(200),
  code: codeField,
});

export const twoFactorVerifySchema = z.object({
  ticket: z.string().min(1, 'ticket is required').max(2000),
  code: codeField,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type TokenInput = z.infer<typeof tokenSchema>;
export type TwoFactorEnableInput = z.infer<typeof twoFactorEnableSchema>;
export type TwoFactorPasswordCodeInput = z.infer<typeof twoFactorPasswordCodeSchema>;
export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;
