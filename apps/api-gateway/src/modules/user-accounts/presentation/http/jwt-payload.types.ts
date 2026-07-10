/** JWT payload после проверки токена, но до проверки прикладных claims внутри Gateway. */
export type UnvalidatedJwtAccessPayload = {
  sub?: unknown;
  aud?: unknown;
  iat?: unknown;
  exp?: unknown;
};

/** JWT payload после проверки токена, но до проверки прикладных claims внутри Gateway. */
export type UnvalidatedJwtRefreshPayload = {
  sub?: unknown;
  aud?: unknown;
  sessionId?: unknown;
  jti?: unknown;
  iat?: unknown;
  exp?: unknown;
};
