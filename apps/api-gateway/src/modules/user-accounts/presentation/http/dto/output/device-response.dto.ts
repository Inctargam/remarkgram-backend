import type { Device } from '@app/user-accounts-grpc';

export class DeviceResponseDto {
  constructor(
    readonly ip: string,
    readonly title: string,
    readonly lastActiveDate: string,
    readonly deviceId: string,
  ) {}

  static fromGrpc(device: Device): DeviceResponseDto {
    return new DeviceResponseDto(device.ip, device.title, device.lastActiveDate, device.deviceId);
  }
}
