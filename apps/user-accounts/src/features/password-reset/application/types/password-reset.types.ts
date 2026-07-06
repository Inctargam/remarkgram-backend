export type RequestPasswordResetParams = {
  email: string;
};

export type RequestPasswordResetResult = void;

export type ConfirmPasswordResetParams = {
  token: string;
  newPassword: string;
};

export type PasswordResetUser = {
  id: number;
  email: string;
};

export type CreatePasswordResetTokenParams = {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};
