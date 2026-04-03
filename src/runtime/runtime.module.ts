import { Global, Module } from '@nestjs/common';
import { RuntimeRoleService } from './runtime-role.service';

@Global()
@Module({
  providers: [RuntimeRoleService],
  exports: [RuntimeRoleService],
})
export class RuntimeModule {}
