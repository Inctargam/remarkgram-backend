import { configValidationUtility } from '@app/config';
import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { IsUrl } from 'class-validator';

class PostsMessageBrokerConfig {
  @IsUrl(
    {
      protocols: ['amqp', 'amqps'],
      require_protocol: true,
      require_valid_protocol: true,
      require_tld: false,
    },
    {
      message: 'Set env variable AMQPS_URL, example: amqps://username:password@broker.example.com/vhost',
    },
  )
  declare readonly url: string;
}

export const postsMessageBrokerConfig = registerAs('postsMessageBroker', () => {
  const config = plainToInstance(PostsMessageBrokerConfig, {
    url: process.env.AMQPS_URL?.trim(),
  });

  configValidationUtility.validateConfig(config);

  return config;
});
