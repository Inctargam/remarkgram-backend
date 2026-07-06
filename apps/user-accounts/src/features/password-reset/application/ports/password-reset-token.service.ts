export type PasswordResetTokenPair = {
  rawToken: string;
  tokenHash: string;
};

export abstract class PasswordResetTokenService {
  abstract generateTokenPair(): PasswordResetTokenPair;

  abstract hashToken(rawToken: string): string;
}
