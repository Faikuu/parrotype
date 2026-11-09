import { pageArgs, pageQuerySchema, toPage } from './pagination';

describe('pageQuerySchema', () => {
  it('defaults to page 1 with 25 rows', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });

  it('reads numeric strings from the query string', () => {
    expect(pageQuerySchema.parse({ page: '3', pageSize: '100' })).toEqual({ page: 3, pageSize: 100 });
  });

  it('refuses page 0, pageSize 0, pageSize over 100 and non-numbers', () => {
    expect(pageQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ pageSize: '0' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: 'abc' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
  });
});

describe('pageArgs and toPage', () => {
  it('turns page and pageSize into skip and take', () => {
    expect(pageArgs({ page: 1, pageSize: 25 })).toEqual({ skip: 0, take: 25 });
    expect(pageArgs({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('wraps the rows with the total and the page', () => {
    expect(toPage(['a'], 312, { page: 2, pageSize: 25 })).toEqual({ items: ['a'], total: 312, page: 2, pageSize: 25 });
  });
});
