type PasswordRecoveryInfoProps = {
  code: string | null;
  expiration: Date | null;
};

export class PasswordRecoveryInfo {
  readonly code: string | null;
  readonly expiration: Date | null;

  private constructor(props: PasswordRecoveryInfoProps) {
    this.code = props.code;
    this.expiration = props.expiration;
  }

  static inactive(): PasswordRecoveryInfo {
    return new PasswordRecoveryInfo({
      code: null,
      expiration: null,
    });
  }

  static pending(code: string, expiration: Date): PasswordRecoveryInfo {
    return new PasswordRecoveryInfo({ code, expiration });
  }

  static restore(props: PasswordRecoveryInfoProps): PasswordRecoveryInfo {
    if (props.code === null && props.expiration === null) {
      return PasswordRecoveryInfo.inactive();
    }

    if (props.code === null || props.expiration === null) {
      throw new Error('Password recovery code and expiration must both be set or both be null');
    }

    return PasswordRecoveryInfo.pending(props.code, props.expiration);
  }

  isExpired(now: Date): boolean {
    return this.expiration !== null && this.expiration <= now;
  }
}
