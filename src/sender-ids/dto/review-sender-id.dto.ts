import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewSenderIdDto {
  @ApiPropertyOptional({ example: 'Documentation mismatch' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
