import { normalizeEmail } from './email-normalization.js';

describe('normalizeEmail', () => {
  it('trims and lowercases an email deterministically', () => {
    expect(normalizeEmail(' User.Name@Example.COM ')).toBe('user.name@example.com');
  });
});
