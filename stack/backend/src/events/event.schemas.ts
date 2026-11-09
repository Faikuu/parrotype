import { z } from 'zod';
import { pageQuerySchema } from '../common/pagination';
import { isoDateSchema } from '../common/time-window';
import { languageSchema } from '../common/domain';
import { eventWindowProblem } from './event-rules';

export const EVENT_SLUG_REGEX = /^[a-z0-9-]{3,40}$/;
export const EVENT_TITLE_MAX = 80;
export const EVENT_DESCRIPTION_MAX = 500;
export const EVENT_TEXT_MIN = 20;
export const EVENT_TEXT_MAX = 1000;

const slugSchema = z
  .string()
  .regex(EVENT_SLUG_REGEX, 'slug must be 3-40 characters: lowercase letters, digits or hyphen');
const titleSchema = z.string().trim().min(1, 'title must be 1-80 characters').max(EVENT_TITLE_MAX, 'title must be 1-80 characters');
const descriptionSchema = z
  .string()
  .trim()
  .max(EVENT_DESCRIPTION_MAX, `description must be at most ${EVENT_DESCRIPTION_MAX} characters`);
const textSchema = z
  .string()
  .trim()
  .min(EVENT_TEXT_MIN, `text must be ${EVENT_TEXT_MIN}-${EVENT_TEXT_MAX} characters`)
  .max(EVENT_TEXT_MAX, `text must be ${EVENT_TEXT_MIN}-${EVENT_TEXT_MAX} characters`);

export const eventCreateSchema = z
  .object({
    slug: slugSchema,
    title: titleSchema,
    description: descriptionSchema.default(''),
    language: languageSchema,
    text: textSchema,
    startsAt: isoDateSchema,
    endsAt: isoDateSchema,
  })
  .superRefine((body, ctx) => {
    const problem = eventWindowProblem(body.startsAt, body.endsAt);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ['endsAt'] });
  });

/**
 * The slug is fixed once created (links to the event must keep working), so it is not in the update: a body
 * that names it is a 400. The window and the started-event rules are checked by the service, which has the
 * stored values.
 */
export const eventUpdateSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    language: languageSchema.optional(),
    text: textSchema.optional(),
    startsAt: isoDateSchema.optional(),
    endsAt: isoDateSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'nothing to change');

export const eventsAdminQuerySchema = pageQuerySchema;

export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;
export type EventsAdminQuery = z.infer<typeof eventsAdminQuerySchema>;
