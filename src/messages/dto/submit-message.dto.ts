import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitMessageDto {
  @ApiProperty({ example: '+251911234567' })
  @IsString()
  phoneNumber!: string;

  @ApiProperty({ example: 'MYAPP' })
  @IsString()
  @MaxLength(20)
  senderId!: string;

  @ApiPropertyOptional({ example: 'Hello {{name}}' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ example: 'otp-login@2' })
  @IsOptional()
  @IsString()
  templateRef?: string;

  @ApiPropertyOptional({ example: { code: '815204', minutes: 5 } })
  @IsOptional()
  @IsObject()
  mergeData?: Record<string, string | number>;

  @ApiPropertyOptional({ example: 'transactional', enum: ['transactional', 'otp', 'marketing'] })
  @IsOptional()
  @IsString()
  @IsIn(['transactional', 'otp', 'marketing'])
  trafficType?: string;

  @ApiPropertyOptional({ example: 'client-msg-12345' })
  @IsOptional()
  @IsString()
  clientMessageId?: string;
}
