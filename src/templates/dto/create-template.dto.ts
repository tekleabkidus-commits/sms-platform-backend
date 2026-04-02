import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({ example: 'otp-login' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'Your OTP is {{code}} and expires in {{minutes}} minutes.' })
  @IsString()
  body!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
