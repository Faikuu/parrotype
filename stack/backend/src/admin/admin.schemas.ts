import { z } from 'zod';
import { pageQuerySchema } from '../common/pagination';
import { USERNAME_REGEX } from '../auth/auth.schemas';
import { ALL_PERMISSIONS, isPermission, type Permission } from '../permissions/catalog';
import { languageSchema, RESULT_MODES as RESULT_MODE_LIST } from '../common/domain';

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

export const resultsQuerySchema = pageQuerySchema.extend({
  /** A user name, matched case-insensitively (on nameLower). Empty means no filter. */
  user: z.string().trim().max(20).optional(),
  mode: z.enum(RESULT_MODE_LIST).optional(),
  language: languageSchema.optional(),
  /** Only 'true' filters; 'false' is the same as leaving it out. */
  suspicious: z.enum(['true', 'false']).optional(),
  sort: z.enum(['created', 'wpm']).default('created'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const actionsQuerySchema = pageQuerySchema.extend({
  action: z.string().trim().max(40).optional(),
  /** The admin's name, matched case-insensitively. */
  admin: z.string().trim().max(20).optional(),
  /** A substring of the target, e.g. "user:4", "group" or "42". */
  target: z.string().trim().max(60).optional(),
});

export const QUOTE_TEXT_MIN = 10;
export const QUOTE_TEXT_MAX = 600;
export const QUOTE_SOURCE_MIN = 2;
export const QUOTE_SOURCE_MAX = 120;

export const quotesQuerySchema = pageQuerySchema.extend({
  language: languageSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

export const quoteCreateSchema = z.object({
  language: languageSchema,
  text: z
    .string()
    .trim()
    .min(QUOTE_TEXT_MIN, `text must be ${QUOTE_TEXT_MIN}-${QUOTE_TEXT_MAX} characters`)
    .max(QUOTE_TEXT_MAX, `text must be ${QUOTE_TEXT_MIN}-${QUOTE_TEXT_MAX} characters`),
  source: z
    .string()
    .trim()
    .min(QUOTE_SOURCE_MIN, `source must be ${QUOTE_SOURCE_MIN}-${QUOTE_SOURCE_MAX} characters`)
    .max(QUOTE_SOURCE_MAX, `source must be ${QUOTE_SOURCE_MIN}-${QUOTE_SOURCE_MAX} characters`),
});

export const quoteUpdateSchema = quoteCreateSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'nothing to change');

export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
export type ResultsQuery = z.infer<typeof resultsQuerySchema>;
export type ActionsQuery = z.infer<typeof actionsQuerySchema>;
export type QuotesQuery = z.infer<typeof quotesQuerySchema>;
export type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;
export type QuoteUpdateInput = z.infer<typeof quoteUpdateSchema>;
export type BanInput = z.infer<typeof banInputSchema>;
export type GroupCreateInput = z.infer<typeof groupCreateSchema>;
export type GroupUpdateInput = z.infer<typeof groupUpdateSchema>;
export type GroupPermissionsInput = z.infer<typeof groupPermissionsSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserRenameInput = z.infer<typeof userRenameSchema>;
export type UserGroupsInput = z.infer<typeof userGroupsSchema>;
export type UserDeleteInput = z.infer<typeof userDeleteSchema>;
