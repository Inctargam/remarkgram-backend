import { configValidationUtility } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

class StripeConfig {
  @IsString() @IsNotEmpty() declare readonly secretKey: string;
  @IsString() @IsNotEmpty() declare readonly webhookSecret: string;
  @IsUrl({ require_tld: false }) declare readonly successUrl: string;
  @IsUrl({ require_tld: false }) declare readonly cancelUrl: string;
}

export const stripeConfig = registerAs('stripe', () => {
  const config = plainToInstance(StripeConfig, {
    secretKey: process.env.STRIPE_SECRET_KEY?.trim(),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim(),
    successUrl: process.env.STRIPE_SUCCESS_URL?.trim(),
    cancelUrl: process.env.STRIPE_CANCEL_URL?.trim(),
  });
  configValidationUtility.validateConfig(config);
  return config;
});
