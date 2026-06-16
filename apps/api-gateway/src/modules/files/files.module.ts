import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { FilesClientConfig } from './config/files-client.config.js';
import { FilesConfigModule } from './config/files-config.module.js';
import { FILES_SERVICE } from './files-client.constants.js';
import { FilesController } from './files.controller.js';
import { FilesClientService } from './files-client.service.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        imports: [FilesConfigModule],
        name: FILES_SERVICE,
        useFactory: (config: FilesClientConfig) => ({
          transport: Transport.TCP,
          options: {
            host: config.tcpHost,
            port: config.tcpPort,
          },
        }),
        inject: [FilesClientConfig],
      },
    ]),
  ],
  controllers: [FilesController],
  providers: [FilesClientService],
})
export class FilesModule {}
