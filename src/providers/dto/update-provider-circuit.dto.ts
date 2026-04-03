import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProviderCircuitDto {
  @ApiProperty({ example: 'open', enum: ['closed', 'open', 'half_open'] })
  @IsString()
  @IsIn(['closed', 'open', 'half_open'])
  state!: 'closed' | 'open' | 'half_open';

  @ApiPropertyOptional({ example: 'Manual maintenance window' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
