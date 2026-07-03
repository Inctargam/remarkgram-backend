type UserProps = {
  id: number;
  username: string;
  email: string;
  hash: string;
  createdAt: Date;
  confirmation: ConfirmationInfo;
  passwordRecovery: PasswordRecoveryInfo;
  deletedAt: Date | null;
};

export type ConfirmationInfo = {
  isConfirmed: boolean;
  code: string | null;
  expiration: Date | null;
};

export type PasswordRecoveryInfo = {
  code: string | null;
  expiration: Date | null;
};

type RestoreUserProps = Pick<UserProps, 'id' | 'username' | 'email'> &
  Partial<Omit<UserProps, 'id' | 'username' | 'email'>>;

export class User {
  private constructor(private readonly props: UserProps) {}

  static restore(props: RestoreUserProps): User {
    return new User({
      hash: '',
      createdAt: new Date(0),
      confirmation: { isConfirmed: true, code: null, expiration: null },
      passwordRecovery: { code: null, expiration: null },
      deletedAt: null,
      ...props,
    });
  }

  get id(): number {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get username(): string {
    return this.props.username;
  }

  get hash(): string {
    return this.props.hash;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get confirmation(): ConfirmationInfo {
    return this.props.confirmation;
  }

  get passwordRecovery(): PasswordRecoveryInfo {
    return this.props.passwordRecovery;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
}
