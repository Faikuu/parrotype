import { eventCreateSchema, eventUpdateSchema, EVENT_SLUG_REGEX } from './event.schemas';

const valid = {
  slug: 'autumn-sprint',
  title: 'Autumn sprint',
  description: 'Sixty seconds.',
  language: 'en',
  text: 'The quick brown fox jumps over the lazy dog.',
  startsAt: '2026-12-01T10:00:00Z',
  endsAt: '2026-12-01T11:00:00Z',
};

describe('eventCreateSchema', () => {
  it('accepts a complete event', () => {
    expect(eventCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('checks the slug: 3-40 of lowercase, digits and hyphen', () => {
    expect(EVENT_SLUG_REGEX.test('abc')).toBe(true);
    expect(EVENT_SLUG_REGEX.test('ab')).toBe(false);
    expect(EVENT_SLUG_REGEX.test('a'.repeat(41))).toBe(false);
    expect(EVENT_SLUG_REGEX.test('Bad_Slug')).toBe(false);
    expect(eventCreateSchema.safeParse({ ...valid, slug: 'Has Spaces' }).success).toBe(false);
  });

  it('caps the title at 80 and the description at 500', () => {
    expect(eventCreateSchema.safeParse({ ...valid, title: 'x'.repeat(80) }).success).toBe(true);
    expect(eventCreateSchema.safeParse({ ...valid, title: 'x'.repeat(81) }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...valid, description: 'x'.repeat(501) }).success).toBe(false);
  });

  it('needs a known language', () => {
    expect(eventCreateSchema.safeParse({ ...valid, language: 'fr' }).success).toBe(false);
  });

  it('bounds the text at 20 to 1000 characters', () => {
    expect(eventCreateSchema.safeParse({ ...valid, text: 'x'.repeat(19) }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...valid, text: 'x'.repeat(20) }).success).toBe(true);
    expect(eventCreateSchema.safeParse({ ...valid, text: 'x'.repeat(1001) }).success).toBe(false);
  });

  it('needs endsAt after startsAt, and at most 30 days', () => {
    expect(eventCreateSchema.safeParse({ ...valid, endsAt: valid.startsAt }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...valid, endsAt: '2027-01-02T10:00:00Z' }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ ...valid, endsAt: '2026-12-31T10:00:00Z' }).success).toBe(true);
  });

  it('reads the dates as ISO date-times', () => {
    const result = eventCreateSchema.safeParse({ ...valid, startsAt: 'tomorrow' });
    expect(result.success).toBe(false);
    const parsed = eventCreateSchema.parse(valid);
    expect(parsed.startsAt).toEqual(new Date(valid.startsAt));
  });
});

describe('eventUpdateSchema', () => {
  it('accepts a partial change', () => {
    expect(eventUpdateSchema.safeParse({ title: 'New title' }).success).toBe(true);
  });

  it('refuses an empty body and an unknown or changed slug', () => {
    expect(eventUpdateSchema.safeParse({}).success).toBe(false);
    expect(eventUpdateSchema.safeParse({ slug: 'other-slug' }).success).toBe(false);
  });
});
