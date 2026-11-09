import { z } from 'zod';

export const REPORT_REASONS = ['name', 'cheating', 'other'] as const;
export const REPORT_DETAILS_MAX = 500;

export const reportInputSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z
    .string()
    .trim()
    .max(REPORT_DETAILS_MAX, `details must be at most ${REPORT_DETAILS_MAX} characters`)
    .optional()
    .transform((d) => (d ? d : null)),
});

export type ReportInput = z.infer<typeof reportInputSchema>;
