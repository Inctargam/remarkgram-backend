export type UserProps = {
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

export class User {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly hash: string;
  readonly createdAt: Date;
  readonly confirmation: ConfirmationInfo;
  readonly passwordRecovery: PasswordRecoveryInfo;
  readonly deletedAt: Date | null;

  private constructor(props: UserProps) {
    this.id = props.id;
    this.username = props.username;
    this.email = props.email;
    this.hash = props.hash;
    this.createdAt = props.createdAt;
    this.confirmation = props.confirmation;
    this.passwordRecovery = props.passwordRecovery;
    this.deletedAt = props.deletedAt;
  }

  static restore(props: UserProps): User {
    return new User(props);
  }
}
