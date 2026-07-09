export type PasswordResetTokenProps = {
  id: string;
  userId: number;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
};

export class PasswordResetToken {
  readonly id: string;
  readonly userId: number;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;

  private constructor(props: PasswordResetTokenProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.createdAt = props.createdAt;
    this.expiresAt = props.expiresAt;
    this.usedAt = props.usedAt;
    this.revokedAt = props.revokedAt;
  }

  static restore(props: PasswordResetTokenProps): PasswordResetToken {
    return new PasswordResetToken(props);
  }

  isExpired(now = new Date()): boolean {
    return this.expiresAt <= now;
  }

  isUsed(): boolean {
    return this.usedAt !== null;
  }

  isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  canBeUsed(now = new Date()): boolean {
    return !this.isExpired(now) && !this.isUsed() && !this.isRevoked();
  }
}
