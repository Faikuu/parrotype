import { z } from 'zod';

export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
/** bcrypt only uses the first 72 bytes of a password. */
export const PASSWORD_MAX_BYTES = 72;

export const registerSchema = z.object({
  name: z
    .string()
    .regex(USERNAME_REGEX, 'name must be 3-20 characters: letters, digits or underscore'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'email must be at most 254 characters')
    .email('email is not valid'),
  password: z
    .string()
    .min(8, 'password must be at least 8 characters')
    .max(PASSWORD_MAX_BYTES, `password must be at most ${PASSWORD_MAX_BYTES} characters`)
    .refine(
      (p) => Buffer.byteLength(p, 'utf8') <= PASSWORD_MAX_BYTES,
      `password must be at most ${PASSWORD_MAX_BYTES} bytes`,
    ),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1, 'password is required').max(PASSWORD_MAX_BYTES),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
