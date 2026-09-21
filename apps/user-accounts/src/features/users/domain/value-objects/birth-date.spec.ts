import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BirthDate } from './birth-date.js';
import {
  BirthDateMinAllowedAgeError,
  InvalidBirthDateFormatError,
  NonExistentCalendarDateError,
} from '../../application/errors/birth-date.errors.js';

describe('BirthDateVO', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Create', () => {
    it('trims and creates a UTC date', () => {
      const birthDate = BirthDate.create(' 2013-09-10 ');
      expect(birthDate.value.getUTCFullYear()).toBe(2013);
      expect(birthDate.value.getUTCMonth()).toBe(8);
      expect(birthDate.value.getUTCDate()).toBe(10);
    });

    it.each(['20.10.2012', '2012-1-01', '2012-01-1', '2012/01/01', ''])(
      'returns a format error for %j',
      (value) => {
        expect(() => BirthDate.create(value)).toThrow(InvalidBirthDateFormatError);
      },
    );

    it.each(['2012-02-30', '2011-02-29', '2012-13-01', '2012-00-01', '2012-04-31'])(
      'returns a calendar error for non-existent date %j',
      (value) => {
        expect(() => BirthDate.create(value)).toThrow(NonExistentCalendarDateError);
      },
    );

    it('accepts an existing leap day', () => {
      expect(BirthDate.create('2012-02-29').value).toEqual(new Date(Date.UTC(2012, 1, 29)));
    });

    it('accepts a user who turns exactly 13 today', () => {
      expect(BirthDate.create('2013-09-21').value).toEqual(new Date(Date.UTC(2013, 8, 21)));
    });

    it('rejects a user who turns 13 tomorrow', () => {
      expect(() => BirthDate.create('2013-09-22')).toThrow(BirthDateMinAllowedAgeError);
    });

    it('rejects a future date as below the minimum age', () => {
      expect(() => BirthDate.create('2026-09-22')).toThrow(BirthDateMinAllowedAgeError);
    });
  });
  describe('Restore', () => {
    it.each([[new Date(2010, 1, 20).toISOString()], ['12.02.2010'], [new Date('invalid')]])(
      'returns an error when the value is a %j instead of Date',
      (value) => {
        expect(() => BirthDate.restore(value as unknown as Date)).toThrow(Error);
      },
    );

    it('success restore the date', () => {
      const value = new Date(Date.UTC(2010, 1, 20));

      const birthDate = BirthDate.restore(value);
      expect(birthDate.value).toEqual(value);
      expect(birthDate.value).not.toBe(value);
    });
  });
});
