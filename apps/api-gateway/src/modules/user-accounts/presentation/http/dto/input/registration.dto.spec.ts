import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistrationDto } from './registration.dto.js';

const createDto = (values: Partial<RegistrationDto> = {}) =>
  plainToInstance(RegistrationDto, {
    username: 'user_123',
    email: 'user@example.com',
    password: 'Password1!',
    ...values,
  });

describe('RegistrationDto', () => {
  it('принимает корректные данные и удаляет пробелы вокруг username и email', async () => {
    const dto = createDto({
      username: '  user_123  ',
      email: '  user@example.com  ',
      password: `Aa1!"'[]\\^_{|}~`,
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.username).toBe('user_123');
    expect(dto.email).toBe('user@example.com');
  });

  it.each(['short', 'a'.repeat(31), 'user.name', 'пользователь', 'user name'])(
    'отклоняет недопустимый username: %s',
    async (username) => {
      const errors = await validate(createDto({ username }));

      expect(errors.some((error) => error.property === 'username')).toBe(true);
    },
  );

  it.each([
    'password1!',
    'PASSWORD1!',
    'Password!',
    'Aa1!',
    `Aa1${'a'.repeat(18)}`,
    'Password 1!',
    'Password1`',
  ])('отклоняет недопустимый password: %s', async (password) => {
    const errors = await validate(createDto({ password }));

    expect(errors.some((error) => error.property === 'password')).toBe(true);
  });

  it('отклоняет некорректный email', async () => {
    const errors = await validate(createDto({ email: 'not-an-email' }));

    expect(errors.some((error) => error.property === 'email')).toBe(true);
  });
});
