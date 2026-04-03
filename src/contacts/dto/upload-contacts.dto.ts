import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UploadContactsDto {
  @ApiProperty({ example: 'contacts.csv' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({
    example: 'phone_number,name,city\n+251911234567,Abel,Addis Ababa\n0911223344,Selam,Adama',
  })
  @IsString()
  csvContent!: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetGroupId?: number;

  @ApiPropertyOptional({ example: ',' })
  @IsOptional()
  @IsString()
  @MaxLength(1)
  delimiter?: string;
}
