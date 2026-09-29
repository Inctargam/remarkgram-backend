import { describe, expect, it } from 'vitest';
import { Username } from './username.js';
import { USERNAME_MAZ_LENGTH, USERNAME_MIN_LENGTH } from '@app/user-accounts-grpc';
import {
  InvalidUsernameLengthError,
  InvalidUsernamePatternError,
} from '../../application/errors/username.errors.js';

describe('Username VO', () => {
  it('trims and normalizes username to lowercase', () => {
    const username = Username.create(' perTroV_01   ');
    expect(username.value).toBe('pertrov_01');
  });

  it.each(['a'.repeat(USERNAME_MIN_LENGTH), 'a'.repeat(USERNAME_MAZ_LENGTH), 'user-name_01'])(
    'accepts a valid boundary/pattern value %j',
    (value) => {
      expect(Username.create(value).value).toBe(value);
    },
  );

  it('should return an error if username length is greater than USERNAME_MAZ_LENGTH', () => {
    const invalidUsername = new Array(USERNAME_MAZ_LENGTH + 1).fill('a').join('');
    expect(() => {
      Username.create(invalidUsername);
    }).to.throw(InvalidUsernameLengthError);
  });

  it('should return an error if username length is least than USERNAME_MIN_LENGTH', () => {
    const invalidUsername = new Array(USERNAME_MIN_LENGTH - 1).fill('a').join('');
    expect(() => {
      Username.create(invalidUsername);
    }).to.throw(InvalidUsernameLengthError);
  });

  it.each(['pertrov@_one', '!van^___', 'user name', 'user.name', 'имяuser'])(
    'returns a pattern error for %j',
    (value) => {
      expect(() => Username.create(value)).toThrow(InvalidUsernamePatternError);
    },
  );

  it('validates length after trimming', () => {
    expect(() => Username.create(`  ${'a'.repeat(USERNAME_MIN_LENGTH - 1)}  `)).toThrow(
      InvalidUsernameLengthError,
    );
  });

  it('should be return an error if username is empty', () => {
    expect(() => {
      Username.create('   ');
    }).to.throw(InvalidUsernamePatternError);
  });
});
