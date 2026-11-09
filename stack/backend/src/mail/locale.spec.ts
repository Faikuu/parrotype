import { pickMailLanguage } from './locale';
import { renderResetMail, renderVerifyMail } from './templates';

describe('pickMailLanguage', () => {
  it('uses the first supported language of the Accept-Language header', () => {
    expect(pickMailLanguage('pl-PL,pl;q=0.9,en;q=0.8')).toBe('pl');
    expect(pickMailLanguage('de')).toBe('de');
    expect(pickMailLanguage('es-MX')).toBe('es');
  });

  it('honours quality values over list order', () => {
    expect(pickMailLanguage('fr;q=0.9,de;q=0.5,en;q=0.8')).toBe('en');
    expect(pickMailLanguage('de;q=0.2,pl;q=0.7')).toBe('pl');
  });

  it('skips q=0 and unsupported languages, and falls back to English', () => {
    expect(pickMailLanguage('pl;q=0,en;q=0.1')).toBe('en');
    expect(pickMailLanguage('fr-FR,it;q=0.5')).toBe('en');
    expect(pickMailLanguage(undefined)).toBe('en');
    expect(pickMailLanguage('')).toBe('en');
  });
});

describe('mail templates', () => {
  it('render every language with the link on its own line', () => {
    const link = 'https://parrotype.example.com/reset-password?token=abc_DEF-123';
    for (const lang of ['en', 'pl', 'de', 'es'] as const) {
      const reset = renderResetMail(lang, link);
      const verify = renderVerifyMail(lang, link);
      expect(reset.subject.length).toBeGreaterThan(5);
      expect(reset.text).toContain(`\n${link}\n`);
      expect(verify.text).toContain(`\n${link}\n`);
    }
  });
});
