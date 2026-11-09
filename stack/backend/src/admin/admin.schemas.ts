import { z } from 'zod';
import { pageQuerySchema } from '../common/pagination';
import { USERNAME_REGEX } from '../auth/auth.schemas';
import { ALL_PERMISSIONS, isPermission, type Permission } from '../permissions/catalog';

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** A catalog key. Unknown keys are a 400, so a typo never becomes a silent no-op. */
export const permissionKeySchema = z.custom<Permission>((value) => isPermission(value), {
  message: 'unknown permission',
});
const permissionList = z.array(permissionKeySchema).max(ALL_PERMISSIONS.length, 'too many permissions');

export const reportsQuerySchema = pageQuerySchema.extend({
  status: z.enum(REPORT_STATUSES).default('open'),
});

export const banInputSchema = z.object({
  reason: z.string().trim().min(1, 'reason is required').max(200, 'reason must be at most 200 characters'),
});

export const groupNameSchema = z
  .string()
  .trim()
  .min(2, 'name must be 2-40 characters')
  .max(40, 'name must be 2-40 characters');

export const groupDescriptionSchema = z
  .string()
  .trim()
  .max(200, 'description must be at most 200 characters');

export const groupCreateSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema.default(''),
  permissions: permissionList.default([]),
});

export const groupUpdateSchema = z
  .object({
    name: groupNameSchema.optional(),
    description: groupDescriptionSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.description !== undefined, 'nothing to change');

export const groupPermissionsSchema = z.object({
  permissions: permissionList,
});

export const userListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  banned: z.enum(['true', 'false']).optional(),
  group: z.coerce.number().int().positive().optional(),
  sort: z.enum(['created', 'name', 'results']).default('created'),
  order: z.enum(['asc', 'desc']).optional(),
});

export const userRenameSchema = z.object({
  name: z
    .string()
    .regex(USERNAME_REGEX, 'name must be 3-20 characters: letters, digits or underscore'),
});

export const userGroupsSchema = z.object({
  groupIds: z.array(z.number().int().positive()).max(100),
});

export const userDeleteSchema = z.object({
  confirm: z.string().min(1, 'confirm is required'),
});

export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
export type BanInput = z.infer<typeof banInputSchema>;
export type GroupCreateInput = z.infer<typeof groupCreateSchema>;
export type GroupUpdateInput = z.infer<typeof groupUpdateSchema>;
export type GroupPermissionsInput = z.infer<typeof groupPermissionsSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserRenameInput = z.infer<typeof userRenameSchema>;
export type UserGroupsInput = z.infer<typeof userGroupsSchema>;
export type UserDeleteInput = z.infer<typeof userDeleteSchema>;
