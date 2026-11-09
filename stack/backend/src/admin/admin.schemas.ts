import { z } from 'zod';

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const reportsQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).default('open'),
});

export const banInputSchema = z.object({
  reason: z.string().trim().min(1, 'reason is required').max(200, 'reason must be at most 200 characters'),
});

export type ReportsQuery = z.infer<typeof reportsQuerySchema>;
export type BanInput = z.infer<typeof banInputSchema>;
