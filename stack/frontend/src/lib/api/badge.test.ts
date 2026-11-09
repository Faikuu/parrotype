import { absoluteBadgeUrl, badgeUrl } from './badge';

describe('badgeUrl', () => {
  it('builds the badge path with the mode, option and language', () => {
    expect(badgeUrl('kea', 'time', '60', 'en')).toBe('/api/users/kea/badge.svg?mode=time&mode2=60&language=en');
  });

  it('encodes the username', () => {
    expect(badgeUrl('a b', 'words', '25', 'pl')).toContain('/users/a%20b/badge.svg?');
  });

  it('makes the URL absolute from the origin for embeds', () => {
    expect(absoluteBadgeUrl('kea', 'time', '15', 'en', 'https://parrotype.example')).toBe(
      'https://parrotype.example/api/users/kea/badge.svg?mode=time&mode2=15&language=en',
    );
  });
});
