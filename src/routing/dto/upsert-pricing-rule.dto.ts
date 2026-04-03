import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class UpsertPricingRuleDto {
  @ApiProperty({ example: 'cost', enum: ['sell', 'cost'] })
  @IsString()
  @IsIn(['sell', 'cost'])
  kind!: 'sell' | 'cost';

  @ApiPropertyOptional({ example: 'f326bb66-7e4d-4dc5-a90d-6db1e871c799' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  providerId?: number;

  @ApiPropertyOptional({ example: 'ET' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  countryCode?: string;

  @ApiPropertyOptional({ example: 'transactional', enum: ['transactional', 'otp', 'marketing'] })
  @IsOptional()
  @IsString()
  @IsIn(['transactional', 'otp', 'marketing'])
  trafficType?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  partsFrom?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  partsTo?: number;

  @ApiProperty({ example: 18 })
  @IsInt()
  unitPriceMinor!: number;

  @ApiPropertyOptional({ example: 'ETB' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
