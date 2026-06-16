import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { FILES_SERVICE } from './files-client.constants.js';
import { FilesClientService } from './files-client.service.js';
import { FilesController } from './files.controller.js';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: FILES_SERVICE,
        transport: Transport.TCP,
        options: {
          host: process.env.FILES_TCP_HOST,
          port: 3003,
        },
      },
    ]),
  ],
  controllers: [FilesController],
  providers: [FilesClientService],
})
export class FilesModule {}
