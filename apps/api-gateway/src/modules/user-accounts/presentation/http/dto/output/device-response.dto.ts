export class DeviceResponseDto {
  constructor(
    readonly ip: string,
    readonly title: string,
    readonly lastActiveDate: string,
    readonly deviceId: string,
    readonly isCurrent: boolean,
  ) {}
}
