import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type DependencyBlock =
  | 'dependencies'
  | 'devDependencies'
  | 'optionalDependencies'
  | 'peerDependencies';
type PackageManifest = Partial<Record<DependencyBlock, Record<string, string>>>;

const dbPackageName = ['@pusula', 'db'].join('/');

function readWebFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('web package boundary', () => {
  it('keeps the database package out of the web dependency and build surface', () => {
    const manifest = JSON.parse(readWebFile('package.json')) as PackageManifest;

    const dependencyBlocks: DependencyBlock[] = [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ];

    for (const dependencyBlock of dependencyBlocks) {
      expect(manifest[dependencyBlock] ?? {}).not.toHaveProperty(dbPackageName);
    }

    expect(readWebFile('next.config.ts')).not.toContain(dbPackageName);
  });
});
