import { z } from 'zod';
import { pageQuerySchema } from '../common/pagination';
import { isoDateSchema, windowProblem } from '../common/time-window';

export const ANNOUNCEMENT_LEVELS = ['info', 'warning'] as const;
export const ANNOUNCEMENT_MESSAGE_MAX = 280;
/** Most active announcements the public endpoint returns. */
export const ANNOUNCEMENTS_ACTIVE_MAX = 3;

const messageSchema = z
  .string()
  .trim()
  .min(1, 'message must be 1-280 characters')
  .max(ANNOUNCEMENT_MESSAGE_MAX, 'message must be 1-280 characters');

const announcementFields = {
  message: messageSchema,
  level: z.enum(ANNOUNCEMENT_LEVELS, { errorMap: () => ({ message: 'level must be info or warning' }) }),
  startsAt: isoDateSchema,
  /** null (or left out) means the announcement has no end. */
  endsAt: isoDateSchema.nullable(),
};

export const announcementCreateSchema = z
  .object({
    message: announcementFields.message,
    level: announcementFields.level.default('info'),
    startsAt: announcementFields.startsAt,
    endsAt: announcementFields.endsAt.optional(),
  })
  .superRefine((body, ctx) => {
    const problem = windowProblem(body.startsAt, body.endsAt ?? null);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ['endsAt'] });
  });

export const announcementUpdateSchema = z
  .object({
    message: announcementFields.message.optional(),
    level: announcementFields.level.optional(),
    startsAt: announcementFields.startsAt.optional(),
    endsAt: announcementFields.endsAt.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'nothing to change');

export const announcementsQuerySchema = pageQuerySchema;

export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>;
export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>;
export type AnnouncementsQuery = z.infer<typeof announcementsQuerySchema>;
