import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { recaptchaSecretConfig } from '../../config/recaptcha-secret.config.ts';

type RecaptchaSiteVerifyResponse = {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
};

export enum RecaptchaVerificationReason {
  RecaptchaFailed = 'recaptcha-failed',
  InvalidToken = 'invalid_token',
  ValidToken = 'valid_token',
  LowScore = 'invalid token',
  GoogleError = 'google_error',
}

type VerifyResponse = {
  success: boolean;
  reason: RecaptchaVerificationReason;
};
@Injectable()
export class RecaptchaVerifiersService {
  private logger = new Logger(RecaptchaVerifiersService.name);
  private readonly googleUrl: string = 'https://www.google.com/recaptcha/api/siteverify';
  constructor(
    @Inject(recaptchaSecretConfig.KEY) private readonly config: ConfigType<typeof recaptchaSecretConfig>,
  ) {}
  async verify(recaptchaToken: string): Promise<VerifyResponse> {
    try {
      const googleResponse = await fetch(this.googleUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          secret: this.config.secretKey,
          response: recaptchaToken,
        }),
      });

      if (!googleResponse.ok) {
        this.logger.warn('RECAPTCHA_FAILED -> Security verification failed');

        return { success: false, reason: RecaptchaVerificationReason.RecaptchaFailed };
      }
      const data = (await googleResponse.json()) as RecaptchaSiteVerifyResponse;

      if (!data.success) {
        this.logger.warn('reCAPTCHA invalid token', {
          errorCodes: data['error-codes'],
          hostname: data.hostname,
          action: data.action,
        });

        return { success: false, reason: RecaptchaVerificationReason.InvalidToken };
      }

      const score = data.score ?? 0;
      const isSuccess = data.success === true && score >= 0.5;

      return {
        success: isSuccess,
        reason: isSuccess ? RecaptchaVerificationReason.ValidToken : RecaptchaVerificationReason.LowScore,
      };
    } catch (error) {
      this.logger.error(`reCAPTCHA verification failed ->`, error);
      return {
        success: false,
        reason: RecaptchaVerificationReason.GoogleError,
      };
    }
  }
}
