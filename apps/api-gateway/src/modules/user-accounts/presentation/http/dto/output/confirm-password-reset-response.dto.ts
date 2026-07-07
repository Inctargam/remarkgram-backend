import { ApiProperty } from '@nestjs/swagger';

export class ConfirmPasswordResetResponseDto {
  @ApiProperty({ example: 'Password has been changed successfully.' })
  readonly message: string = 'Password has been changed successfully.';
}
