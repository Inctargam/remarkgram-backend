export abstract class PasswordHasher {
  abstract hashPassword(password: string): Promise<string>;
}
