type UserProps = {
  id: number;
  username: string;
  email: string;
};

export class User {
  private constructor(private readonly props: UserProps) {}

  static restore(props: UserProps): User {
    return new User(props);
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
}
