import { registerDecorator, type ValidationOptions } from 'class-validator';
import { USERNAME_MAZ_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from '@app/user-accounts-grpc';

export function IsUsername(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'IsUsername',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'string' &&
            USERNAME_PATTERN.test(value.trim()) &&
            value.trim().length >= USERNAME_MIN_LENGTH &&
            value.trim().length <= USERNAME_MAZ_LENGTH
          );
        },
        defaultMessage(): string {
          return `$property must contain ${USERNAME_MIN_LENGTH}–${USERNAME_MAZ_LENGTH} and available symbols 0-9, A-Z, a-z, _, -`;
        },
      },
    });
  };
}
