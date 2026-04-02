import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

@Module({
  providers: [CampaignsService],
  controllers: [CampaignsController],
})
export class CampaignsModule {}
