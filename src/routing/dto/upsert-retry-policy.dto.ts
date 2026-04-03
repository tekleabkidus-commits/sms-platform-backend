import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpsertRetryPolicyDto {
  @ApiPropertyOptional({ example: 'f326bb66-7e4d-4dc5-a90d-6db1e871c799' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  providerId?: number;

  @ApiPropertyOptional({ example: 'transactional', enum: ['transactional', 'otp', 'marketing'] })
  @IsOptional()
  @IsString()
  @IsIn(['transactional', 'otp', 'marketing'])
  trafficType?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @ApiProperty({ example: [5, 30, 300] })
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  retryIntervals!: number[];

  @ApiProperty({ example: ['timeout', 'throttle', 'http_provider_error'] })
  @IsArray()
  @IsString({ each: true })
  retryOnErrors!: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
