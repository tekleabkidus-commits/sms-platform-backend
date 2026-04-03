import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateContactDto {
  @ApiPropertyOptional({ example: 'Abel Tesfaye' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: { city: 'Addis Ababa' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, string | number | boolean | null>;
}
