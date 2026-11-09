import { announcementCreateSchema, announcementUpdateSchema } from './announcement.schemas';

const valid = { message: 'Maintenance tonight', level: 'warning', startsAt: '2026-12-01T10:00:00Z', endsAt: '2026-12-01T11:00:00Z' };

describe('announcementCreateSchema', () => {
  it('accepts a complete announcement', () => {
    expect(announcementCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('bounds the message at 1 to 280 characters', () => {
    expect(announcementCreateSchema.safeParse({ ...valid, message: '   ' }).success).toBe(false);
    expect(announcementCreateSchema.safeParse({ ...valid, message: 'x'.repeat(280) }).success).toBe(true);
    expect(announcementCreateSchema.safeParse({ ...valid, message: 'x'.repeat(281) }).success).toBe(false);
  });

  it('accepts only info or warning, and defaults to info', () => {
    expect(announcementCreateSchema.safeParse({ ...valid, level: 'error' }).success).toBe(false);
    const noLevel = { message: valid.message, startsAt: valid.startsAt };
    expect(announcementCreateSchema.parse(noLevel).level).toBe('info');
  });

  it('needs an ISO startsAt, and an endsAt after it when given', () => {
    expect(announcementCreateSchema.safeParse({ ...valid, startsAt: 'soon' }).success).toBe(false);
    expect(announcementCreateSchema.safeParse({ ...valid, endsAt: valid.startsAt }).success).toBe(false);
  });

  it('allows no end', () => {
    const noEnd = { message: valid.message, level: valid.level, startsAt: valid.startsAt };
    expect(announcementCreateSchema.parse(noEnd).endsAt).toBeUndefined();
    expect(announcementCreateSchema.safeParse({ ...valid, endsAt: null }).success).toBe(true);
  });
});

describe('announcementUpdateSchema', () => {
  it('accepts a partial change and an explicit null end', () => {
    expect(announcementUpdateSchema.safeParse({ message: 'Changed' }).success).toBe(true);
    expect(announcementUpdateSchema.safeParse({ endsAt: null }).success).toBe(true);
  });

  it('refuses an empty body and unknown keys', () => {
    expect(announcementUpdateSchema.safeParse({}).success).toBe(false);
    expect(announcementUpdateSchema.safeParse({ id: 4 }).success).toBe(false);
  });
});
