import { Trim } from '../../../../../../../common/http/decorators/trim.decorator.js';
import { MaxLength } from 'class-validator';
import { MAX_POST_DESCRIPTION_LENGTH } from '@app/posts-grpc';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePostDto {
  @ApiProperty({
    example: 'Some description',
  })
  @Trim()
  @MaxLength(MAX_POST_DESCRIPTION_LENGTH, {
    message: `Text content must not exceed ${MAX_POST_DESCRIPTION_LENGTH} characters.`,
  })
  declare description: string;
}
