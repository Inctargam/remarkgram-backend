import { UserAccountsError, UserAccountsErrorCode } from '../../../../common/errors/user-accounts.error.js';

export class OAuthEmailRequiredError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.OAUTH_EMAIL_REQUIRED;
  constructor() {
    super('OAuth provider did not return a primary email address');
  }
}

export class OAuthEmailNotVerifiedError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.OAUTH_EMAIL_NOT_VERIFIED;
  constructor() {
    super('The email address is not verified by the OAuth provider');
  }
}

export class OAuthEmailConfirmationRequiredError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.OAUTH_EMAIL_CONFIRMATION_REQUIRED;
  constructor() {
    super('Email confirmation is required to continue');
  }
}

export class OAuthIdentityOwnerNotFoundError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.OAUTH_IDENTITY_OWNER_NOT_FOUND;
  constructor() {
    super('The user linked to this OAuth identity no longer exists');
  }
}

export class OAuthIdentityLinkedToAnotherUserError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.OAUTH_IDENTITY_LINKED_TO_ANOTHER_USER;

  constructor() {
    super('OAuth identity is linked to another user');
  }
}

export class OAuthProviderAlreadyLinkedError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.OAUTH_PROVIDER_ALREADY_LINKED;

  constructor() {
    super('User already has another identity for this OAuth provider');
  }
}

export class UnexpectedOAuthIdentityConflictError extends UserAccountsError {
  readonly code = UserAccountsErrorCode.OAUTH_IDENTITY_CONFLICT;

  constructor() {
    super('OAuth identity conflict could not be resolved');
  }
}
