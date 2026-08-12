import { ApiProperty } from '@nestjs/swagger';

export class AuthorPostImageDto {
  @ApiProperty({
    description: 'Image file identifier.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  declare fileId: string;

  @ApiProperty({
    description: 'Zero-based image position inside the post.',
    example: 0,
    minimum: 0,
  })
  declare position: number;

  @ApiProperty({
    description: 'Absolute API Gateway URL that redirects to the public image.',
    example:
      'https://api.remark-gram.com/api/v1/files/images/550e8400-e29b-41d4-a716-446655440000',
    format: 'uri',
  })
  declare url: string;
}
