import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class MessageExplorerQueryDto {
  @ApiPropertyOptional({ example: 'f326bb66-7e4d-4dc5-a90d-6db1e871c799' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'provider_accepted', enum: ['accepted', 'routed', 'submitting', 'provider_accepted', 'delivered', 'failed'] })
  @IsOptional()
  @IsString()
  @IsIn(['accepted', 'routed', 'submitting', 'provider_accepted', 'delivered', 'failed'])
  status?: string;

  @ApiPropertyOptional({ example: 'MYAPP' })
  @IsOptional()
  @IsString()
  senderId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  providerId?: number;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  campaignId?: number;

  @ApiPropertyOptional({ example: '+251911234567' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'abc-provider-message-id' })
  @IsOptional()
  @IsString()
  providerMessageId?: string;

  @ApiPropertyOptional({ example: '2026-04-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-04-02T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
