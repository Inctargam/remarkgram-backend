import type { ConfirmationInfo } from '../value-objects/confirmation-info.js';

export type UserProps = {
  id: number;
  username: string;
  email: string;
  hash: string | null;
  createdAt: Date;
  confirmation: ConfirmationInfo;
  deletedAt: Date | null;
};

export class User {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly hash: string | null;
  readonly createdAt: Date;
  readonly confirmation: ConfirmationInfo;
  readonly deletedAt: Date | null;

  private constructor(props: UserProps) {
    this.id = props.id;
    this.username = props.username;
    this.email = props.email;
    this.hash = props.hash;
    this.createdAt = props.createdAt;
    this.confirmation = props.confirmation;
    this.deletedAt = props.deletedAt;
  }

  static restore(props: UserProps): User {
    return new User(props);
  }
}
