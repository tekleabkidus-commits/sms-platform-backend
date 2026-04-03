import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class TenantScopeQueryDto {
  @ApiPropertyOptional({
    description: 'Optional tenant scope override for authorized operations staff',
    example: 'f326bb66-7e4d-4dc5-a90d-6db1e871c799',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
