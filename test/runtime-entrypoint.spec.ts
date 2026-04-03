import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('runtime entrypoint wiring', () => {
  const root = path.resolve(__dirname, '..');

  it('builds the backend entrypoint at dist/main.js', () => {
    expect(existsSync(path.join(root, 'dist', 'main.js'))).toBe(true);
  });

  it('keeps package scripts and Docker runtime aligned to dist/main.js', () => {
    const packageJson = readFileSync(path.join(root, 'package.json'), 'utf8');
    const dockerfile = readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const startRole = readFileSync(path.join(root, 'scripts', 'start-role.mjs'), 'utf8');

    expect(packageJson).toContain('"start": "node dist/main.js"');
    expect(packageJson).toContain('"start:prod": "node dist/main.js"');
    expect(dockerfile).toContain('CMD ["node", "dist/main.js"]');
    expect(startRole).toContain("path.join(rootDir, 'dist', 'main.js')");
  });
});
