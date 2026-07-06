type ConfirmationInfoProps = {
  isConfirmed: boolean;
  code: string | null;
  expiration: Date | null;
};

export class ConfirmationInfo {
  readonly isConfirmed: boolean;
  readonly code: string | null;
  readonly expiration: Date | null;

  private constructor(props: ConfirmationInfoProps) {
    this.isConfirmed = props.isConfirmed;
    this.code = props.code;
    this.expiration = props.expiration;
  }

  static pending(code: string, expiration: Date): ConfirmationInfo {
    return new ConfirmationInfo({
      isConfirmed: false,
      code,
      expiration,
    });
  }

  static confirmed(): ConfirmationInfo {
    return new ConfirmationInfo({
      isConfirmed: true,
      code: null,
      expiration: null,
    });
  }

  static restore(props: ConfirmationInfoProps): ConfirmationInfo {
    if (props.isConfirmed) {
      if (props.code !== null || props.expiration !== null) {
        throw new Error('Confirmed user must not have confirmation code or expiration');
      }

      return ConfirmationInfo.confirmed();
    }

    if (props.code === null || props.expiration === null) {
      throw new Error('Unconfirmed user must have confirmation code and expiration');
    }

    return ConfirmationInfo.pending(props.code, props.expiration);
  }

  isExpired(now: Date): boolean {
    return this.expiration !== null && this.expiration <= now;
  }
}
