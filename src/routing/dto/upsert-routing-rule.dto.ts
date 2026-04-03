import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class UpsertRoutingRuleDto {
  @ApiPropertyOptional({ example: 'f326bb66-7e4d-4dc5-a90d-6db1e871c799' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({ example: 'ethio-primary-otp' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'ET' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ example: 'otp', enum: ['transactional', 'otp', 'marketing'] })
  @IsOptional()
  @IsString()
  @IsIn(['transactional', 'otp', 'marketing'])
  trafficType?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  providerId!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  smppConfigId?: number;

  @ApiPropertyOptional({ example: 'smpp', enum: ['http', 'smpp'] })
  @IsOptional()
  @IsString()
  @IsIn(['http', 'smpp'])
  preferredProtocol?: 'http' | 'smpp';

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  weight?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  costRank?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  failoverOrder?: number;

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @IsInt()
  maxTps?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
