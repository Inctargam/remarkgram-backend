import { ConfirmationInfo } from './confirmation-info.js';

describe('ConfirmationInfo', () => {
  const expiration = new Date('2026-07-06T13:00:00.000Z');

  it('creates a pending confirmation', () => {
    expect(ConfirmationInfo.pending('confirmation-code', expiration)).toEqual({
      isConfirmed: false,
      code: 'confirmation-code',
      expiration,
    });
  });

  it('creates a confirmed confirmation', () => {
    expect(ConfirmationInfo.confirmed()).toEqual({
      isConfirmed: true,
      code: null,
      expiration: null,
    });
  });

  it('restores valid persistence states', () => {
    expect(
      ConfirmationInfo.restore({
        isConfirmed: false,
        code: 'confirmation-code',
        expiration,
      }),
    ).toEqual(ConfirmationInfo.pending('confirmation-code', expiration));
    expect(ConfirmationInfo.restore({ isConfirmed: true, code: null, expiration: null })).toEqual(
      ConfirmationInfo.confirmed(),
    );
  });

  it('rejects an unconfirmed state without a code or expiration', () => {
    expect(() => ConfirmationInfo.restore({ isConfirmed: false, code: null, expiration })).toThrow(
      'Unconfirmed user must have confirmation code and expiration',
    );
  });

  it('rejects a confirmed state with a code or expiration', () => {
    expect(() =>
      ConfirmationInfo.restore({
        isConfirmed: true,
        code: 'confirmation-code',
        expiration,
      }),
    ).toThrow('Confirmed user must not have confirmation code or expiration');
  });

  it('considers a code expired at its expiration time', () => {
    const confirmation = ConfirmationInfo.pending('confirmation-code', expiration);

    expect(confirmation.isExpired(new Date('2026-07-06T12:59:59.999Z'))).toBe(false);
    expect(confirmation.isExpired(expiration)).toBe(true);
  });
});
