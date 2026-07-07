import { IsUUID } from 'class-validator';
import { Trim } from '../../../../../../common/http/decorators/trim.decorator.js';

export class DeleteDeviceParamsDto {
  @Trim()
  @IsUUID()
  declare deviceId: string;
}
