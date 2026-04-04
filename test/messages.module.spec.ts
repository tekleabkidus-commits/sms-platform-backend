import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ComplianceModule } from '../src/compliance/compliance.module';
import { MessagesModule } from '../src/messages/messages.module';

describe('MessagesModule', () => {
  it('imports ComplianceModule so ComplianceService is resolvable for MessagesService', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, MessagesModule) as unknown[] | undefined;

    expect(imports).toBeDefined();
    expect(imports).toContain(ComplianceModule);
  });
});
