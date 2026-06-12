import { Controller, Get, Post } from '@nestjs/common';
import { FilesClientService } from './files-client.service.js';

@Controller('files')
export class FilesController {
  constructor(private filesService: FilesClientService) {}

  @Get('/test-ping')
  ping() {
    return this.filesService.cmdTestPing();
  }

  @Post('/test-event')
  async emitTestEvent(): Promise<{ status: 'accepted' }> {
    await this.filesService.emitTestEvent();

    return { status: 'accepted' };
  }
}
