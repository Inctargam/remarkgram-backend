import { describe, expect } from 'vitest';
import { Username } from './username.js';
import { USERNAME_MAZ_LENGTH, USERNAME_MIN_LENGTH } from '@app/user-accounts-grpc';
import {
  InvalidUsernameLengthError,
  InvalidUsernamePatternError,
} from '../../application/errors/username.errors.js';

describe('Username VO', () => {
  it('the normalized username should be returned', () => {
    const username = Username.create(' perTroV_01   ');
    expect(username.value).toBe('pertrov_01');
  });

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

  it('should be return an error if username does match USERNAME_PATTERN', () => {
    expect(() => {
      Username.create('pertrov@_one');
    }).to.throw(InvalidUsernamePatternError);

    expect(() => {
      Username.create('!van^___');
    }).to.throw(InvalidUsernamePatternError);
  });

  it('should be return an error if username is empty', () => {
    expect(() => {
      Username.create('');
    }).to.throw(InvalidUsernamePatternError);
  });
});
