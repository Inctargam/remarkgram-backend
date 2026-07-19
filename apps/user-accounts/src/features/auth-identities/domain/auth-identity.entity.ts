export type AuthIdentityProvider = 'github' | 'google';
export type AuthIdentityProps = {
  id: string;
  userId: number;
  provider: AuthIdentityProvider;
  providerSubject: string;
  providerEmail?: string | null;
  providerEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class AuthIdentity {
  readonly id: string;
  readonly userId: number;
  readonly provider: AuthIdentityProvider;
  readonly providerSubject: string;
  readonly providerEmail?: string | null;
  readonly providerEmailVerified: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: AuthIdentityProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.provider = props.provider;
    this.providerSubject = props.providerSubject;
    this.providerEmail = props.providerEmail;
    this.providerEmailVerified = props.providerEmailVerified;
    this.createdAt = new Date(props.createdAt);
    this.updatedAt = new Date(props.updatedAt);
  }

  static restore(props: AuthIdentityProps): AuthIdentity {
    return new AuthIdentity(props);
  }
}
