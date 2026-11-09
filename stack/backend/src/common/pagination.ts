import { z } from 'zod';

export const PAGE_DEFAULT_SIZE = 25;
export const PAGE_MAX_SIZE = 100;

/** `?page=` (1 or more) and `?pageSize=` (1 to 100, default 25). Other query keys are the caller's. */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_MAX_SIZE).default(PAGE_DEFAULT_SIZE),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

/** The list shape of every paginated admin endpoint. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** The Prisma skip/take for one page. */
export function pageArgs(query: Pick<PageQuery, 'page' | 'pageSize'>): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function toPage<T>(items: T[], total: number, query: Pick<PageQuery, 'page' | 'pageSize'>): Page<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}
