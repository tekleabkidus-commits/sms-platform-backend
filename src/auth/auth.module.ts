import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ReauthGuard } from '../common/guards/reauth.guard';

@Module({
  imports: [JwtModule.register({})],
  providers: [AuthService, ReauthGuard],
  controllers: [AuthController],
  exports: [AuthService, ReauthGuard, JwtModule],
})
export class AuthModule {}
