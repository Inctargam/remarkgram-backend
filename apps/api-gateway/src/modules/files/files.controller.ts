import { Controller, Get } from '@nestjs/common';
import { FilesClientService } from './files-client.service.js';

@Controller('files')
export class FilesController {
  constructor(private filesService: FilesClientService) {}

  @Get('/ping')
  ping() {
    return this.filesService.cmdTestPing();
  }
}
