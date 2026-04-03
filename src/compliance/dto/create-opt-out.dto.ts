import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOptOutDto {
  @ApiProperty({ example: '+251911234567' })
  @IsString()
  phoneNumber!: string;

  @ApiProperty({ example: 'customer_request', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reason?: string;
}
