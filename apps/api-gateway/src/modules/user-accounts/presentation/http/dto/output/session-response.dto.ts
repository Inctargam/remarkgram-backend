import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({ example: 'e3637e61-194b-4f79-9676-e59a20bb7c42', format: 'uuid' })
  readonly sessionId: string;

  @ApiProperty({ example: 'Mozilla/5.0' })
  readonly deviceName: string;

  @ApiProperty({ example: '127.0.0.1' })
  readonly ip: string;

  @ApiProperty({ example: '2026-07-07T12:00:00.000Z', format: 'date-time' })
  readonly lastActiveAt: string;

  @ApiProperty({ example: true })
  readonly isCurrent: boolean;

  constructor(params: {
    sessionId: string;
    deviceName: string;
    ip: string;
    lastActiveAt: string;
    isCurrent: boolean;
  }) {
    this.sessionId = params.sessionId;
    this.deviceName = params.deviceName;
    this.ip = params.ip;
    this.lastActiveAt = params.lastActiveAt;
    this.isCurrent = params.isCurrent;
  }
}
