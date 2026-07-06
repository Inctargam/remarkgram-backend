import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createHmac, randomBytes } from 'node:crypto';
import { passwordResetConfig } from '../../../../config/password-reset.config.js';
import {
  PasswordResetTokenService,
  type PasswordResetTokenPair,
} from '../../application/ports/password-reset-token.service.js';

const PASSWORD_RESET_TOKEN_BYTES = 32;

@Injectable()
export class HmacPasswordResetTokenService extends PasswordResetTokenService {
  constructor(
    @Inject(passwordResetConfig.KEY) private readonly config: ConfigType<typeof passwordResetConfig>,
  ) {
    super();
  }

  generateTokenPair(): PasswordResetTokenPair {
    const rawToken = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');

    return {
      rawToken,
      tokenHash: this.hashToken(rawToken),
    };
  }

  hashToken(rawToken: string): string {
    return createHmac('sha256', this.config.tokenSecret).update(rawToken).digest('hex');
  }
}
