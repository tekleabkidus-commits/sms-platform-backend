import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class RotateApiKeyDto {
  @ApiPropertyOptional({ example: 'Rotated production key' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: ['sms:send'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}
