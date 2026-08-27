import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class GetFileDownloadUrlParamsDto {
  @ApiProperty({
    description: 'Identifier of the completed, non-deleted image file.',
    type: 'string',
    format: 'uuid',
    example: '83d26252-a350-4e39-a78e-0bdf54d2341d',
  })
  @IsUUID('4')
  declare readonly fileId: string;
}
