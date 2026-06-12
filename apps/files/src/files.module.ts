import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FilesConfig } from './config/files.config.js';
import { FilesMessageController } from './presentation/files-message.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        `apps/files/.env.${process.env.NODE_ENV}.local`,
        `apps/files/.env.${process.env.NODE_ENV}`,
        'apps/files/.env.production',
        'apps/files/.env',
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        '.env.production',
        '.env',
      ],
    }),
  ],
  controllers: [FilesMessageController],
  providers: [FilesConfig],
  exports: [FilesConfig],
})
export class FilesModule {}
