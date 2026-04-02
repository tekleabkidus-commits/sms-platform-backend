import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ScheduleCampaignDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  campaignId?: number;

  @ApiPropertyOptional({ example: 'Promo April 2026' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  campaignName?: string;

  @ApiProperty({ example: '2026-04-03T08:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiPropertyOptional({ example: '0 8 * * *' })
  @IsOptional()
  @IsString()
  recurrenceCron?: string;

  @ApiProperty({ example: 'promo-template@1' })
  @IsString()
  templateRef!: string;

  @ApiProperty({ example: 'MYAPP' })
  @IsString()
  senderId!: string;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  shardCount?: number;
}
