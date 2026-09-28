import { z } from 'zod';

const emailField = z.string().trim().toLowerCase().email().max(254);
const passwordField = z.string().min(12).max(200);
const roleField = z.enum(['ADMIN', 'USER']);

export const createUserSchema = z
  .object({
    email: emailField,
    password: passwordField,
    role: roleField.default('USER'),
  })
  .strict();

export const updateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    role: roleField.optional(),
  })
  .strict()
  .refine((s) => Object.keys(s).length > 0, 'Provide at least one field to update');

export const resetPasswordSchema = z
  .object({
    password: passwordField,
  })
  .strict();
