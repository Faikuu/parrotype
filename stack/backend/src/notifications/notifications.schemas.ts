import { z } from 'zod';
import { pageQuerySchema } from '../common/pagination';

/** Largest number of ids one mark-read call may name. */
export const NOTIFICATION_READ_IDS_MAX = 200;

export const notificationsQuerySchema = pageQuerySchema.extend({
  /** 'true' lists the unread ones only. Anything else (or nothing) lists all. */
  unread: z.enum(['true', 'false']).optional(),
});

export const notificationsReadSchema = z
  .object({
    /** The ids to mark read. Left out (or no body): every unread notification of the caller. */
    ids: z.array(z.number().int().positive()).max(NOTIFICATION_READ_IDS_MAX).optional(),
  })
  .default({});

export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;
export type NotificationsReadInput = z.infer<typeof notificationsReadSchema>;
