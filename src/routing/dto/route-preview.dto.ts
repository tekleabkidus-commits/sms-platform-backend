import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class RoutePreviewDto {
  @ApiProperty({ example: '+251911234567' })
  @IsString()
  phoneNumber!: string;

  @ApiProperty({ example: 'transactional', enum: ['transactional', 'otp', 'marketing'] })
  @IsString()
  @IsIn(['transactional', 'otp', 'marketing'])
  trafficType!: string;

  @ApiProperty({ example: 'ETHIO' })
  @IsOptional()
  @IsString()
  countryCode?: string;
}
