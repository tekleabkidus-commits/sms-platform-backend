import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateFraudRuleDto {
  @ApiProperty({ example: 'block-scam-keywords' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'keyword_block', enum: ['keyword_block', 'prefix_block', 'velocity_threshold'] })
  @IsString()
  @IsIn(['keyword_block', 'prefix_block', 'velocity_threshold'])
  ruleType!: string;

  @ApiProperty({ example: 'block', enum: ['allow', 'throttle', 'block', 'alert'] })
  @IsString()
  @IsIn(['allow', 'throttle', 'block', 'alert'])
  action!: string;

  @ApiProperty({ example: ['win cash', 'free money'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  values?: string[];

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
