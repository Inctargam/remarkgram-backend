import { PasswordRecoveryInfo } from './password-recovery-info.js';

describe('PasswordRecoveryInfo', () => {
  const expiration = new Date('2026-07-06T13:00:00.000Z');

  it('creates an inactive password recovery', () => {
    expect(PasswordRecoveryInfo.inactive()).toEqual({
      code: null,
      expiration: null,
    });
  });

  it('creates a pending password recovery', () => {
    expect(PasswordRecoveryInfo.pending('recovery-code', expiration)).toEqual({
      code: 'recovery-code',
      expiration,
    });
  });

  it('restores valid persistence states', () => {
    expect(PasswordRecoveryInfo.restore({ code: null, expiration: null })).toEqual(
      PasswordRecoveryInfo.inactive(),
    );
    expect(PasswordRecoveryInfo.restore({ code: 'recovery-code', expiration })).toEqual(
      PasswordRecoveryInfo.pending('recovery-code', expiration),
    );
  });

  it('rejects a state containing only a code or expiration', () => {
    expect(() => PasswordRecoveryInfo.restore({ code: 'recovery-code', expiration: null })).toThrow(
      'Password recovery code and expiration must both be set or both be null',
    );
    expect(() => PasswordRecoveryInfo.restore({ code: null, expiration })).toThrow(
      'Password recovery code and expiration must both be set or both be null',
    );
  });

  it('considers a recovery code expired at its expiration time', () => {
    const passwordRecovery = PasswordRecoveryInfo.pending('recovery-code', expiration);

    expect(passwordRecovery.isExpired(new Date('2026-07-06T12:59:59.999Z'))).toBe(false);
    expect(passwordRecovery.isExpired(expiration)).toBe(true);
  });
});
