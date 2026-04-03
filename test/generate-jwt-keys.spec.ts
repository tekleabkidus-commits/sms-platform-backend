import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('generate-jwt-keys script', () => {
  const root = path.resolve(__dirname, '..');
  const script = path.join(root, 'scripts', 'generate-jwt-keys.mjs');

  it('prints both PEM blocks for Railway secrets', () => {
    const output = execFileSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(output).toContain('JWT_PUBLIC_KEY');
    expect(output).toContain('JWT_PRIVATE_KEY');
    expect(output).toContain('-----BEGIN PUBLIC KEY-----');
    expect(output).toContain('-----BEGIN PRIVATE KEY-----');
  });
});
