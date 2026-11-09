import { keepsQuoteInLanguage, LAST_QUOTE } from './quote-rules';

describe('keepsQuoteInLanguage (the last-quote guard)', () => {
  it('refuses a write that would leave no other quote in the language', () => {
    expect(keepsQuoteInLanguage(0)).toBe(false);
  });

  it('allows it when at least one other quote remains', () => {
    expect(keepsQuoteInLanguage(1)).toBe(true);
    expect(keepsQuoteInLanguage(40)).toBe(true);
  });

  it('has a message the API can show', () => {
    expect(LAST_QUOTE).toBe('Each language needs at least one quote');
  });
});
