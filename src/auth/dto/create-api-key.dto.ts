import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Primary transactional key' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: ['sms:send', 'templates:read'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  rateLimitRps?: number;

  @ApiPropertyOptional({ example: 1000000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  dailyQuota?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number;
}
