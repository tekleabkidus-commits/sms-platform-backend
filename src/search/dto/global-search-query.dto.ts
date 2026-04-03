import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class GlobalSearchQueryDto {
  @ApiPropertyOptional({ example: '815204' })
  @IsString()
  q!: string;

  @ApiPropertyOptional({ example: 'f326bb66-7e4d-4dc5-a90d-6db1e871c799' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 6;
}
