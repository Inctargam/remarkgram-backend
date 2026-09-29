import { USERNAME_MAZ_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from '@app/user-accounts-grpc';
import {
  InvalidUsernameLengthError,
  InvalidUsernamePatternError,
} from '../../application/errors/username.errors.js';

export class Username {
  public readonly value: string;

  private constructor(username: string) {
    this.value = username;
  }
  static create(value: string): Username {
    const normalized = value.trim().toLowerCase();
    if (!normalized || !USERNAME_PATTERN.test(normalized)) {
      throw new InvalidUsernamePatternError();
    }
    if (normalized.length < USERNAME_MIN_LENGTH || normalized.length > USERNAME_MAZ_LENGTH) {
      throw new InvalidUsernameLengthError(USERNAME_MIN_LENGTH, USERNAME_MAZ_LENGTH);
    }

    return new Username(normalized);
  }
}
