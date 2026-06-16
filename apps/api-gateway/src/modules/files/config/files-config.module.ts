import { Module } from '@nestjs/common';
import { FilesClientConfig } from './files-client.config.js';

@Module({
  providers: [FilesClientConfig],
  exports: [FilesClientConfig],
})
export class FilesConfigModule {}
