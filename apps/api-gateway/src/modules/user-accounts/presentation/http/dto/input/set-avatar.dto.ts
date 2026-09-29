import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SetAvatarDto {
  @ApiProperty({
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
    description: 'ID of a completed JPEG/PNG upload, up to 10 MiB inclusive.',
  })
  @IsUUID('4')
  declare fileId: string;
}
