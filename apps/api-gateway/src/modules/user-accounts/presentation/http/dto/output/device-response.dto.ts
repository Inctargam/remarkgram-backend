import { ApiProperty } from '@nestjs/swagger';

export class DeviceResponseDto {
  @ApiProperty({ example: '127.0.0.1' })
  readonly ip: string;

  @ApiProperty({ example: 'Mozilla/5.0' })
  readonly title: string;

  @ApiProperty({ example: '2026-07-07T12:00:00.000Z', format: 'date-time' })
  readonly lastActiveDate: string;

  @ApiProperty({ example: 'e3637e61-194b-4f79-9676-e59a20bb7c42', format: 'uuid' })
  readonly deviceId: string;

  @ApiProperty({ example: true })
  readonly isCurrent: boolean;

  constructor(ip: string, title: string, lastActiveDate: string, deviceId: string, isCurrent: boolean) {
    this.ip = ip;
    this.title = title;
    this.lastActiveDate = lastActiveDate;
    this.deviceId = deviceId;
    this.isCurrent = isCurrent;
  }
}
