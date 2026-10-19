import { ApiProperty } from '@nestjs/swagger';
import { PaymentListItemResponseDto } from './payment-list-item-response.dto.js';

export class GetPaymentsResponseDto {
  @ApiProperty({ type: () => [PaymentListItemResponseDto] })
  declare readonly items: PaymentListItemResponseDto[];
  @ApiProperty({ example: 1 })
  declare readonly pageNumber: number;
  @ApiProperty({ example: 10 })
  declare readonly pageSize: number;
  @ApiProperty({ example: 24 })
  declare readonly totalCount: number;
  @ApiProperty({ example: 3 })
  declare readonly pagesCount: number;
}
