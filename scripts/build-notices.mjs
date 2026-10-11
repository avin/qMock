import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const notices = [];
const seen = new Set();

function visit(name, from) {
  const require = createRequire(from);
  const directory = (require.resolve.paths(name) ?? [])
    .map(base => path.join(base, name))
    .find(candidate => existsSync(path.join(candidate, 'package.json')));
  if (!directory) throw new Error(`Cannot find package manifest for ${name}`);
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  if (seen.has(directory)) return;
  seen.add(directory);
  const licenseFiles = readdirSync(directory).filter(file => /^licen[sc]e(?:\.|$)/i.test(file));
  if (!licenseFiles.length) throw new Error(`No license file found for ${name}`);
  notices.push(`${manifest.name} ${manifest.version}\n${licenseFiles.map(file => readFileSync(path.join(directory, file), 'utf8')).join('\n')}`);
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    visit(dependency, path.join(directory, 'package.json'));
  }
}

for (const name of ['react', 'react-dom', '@base-ui/react', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities', 'clsx']) {
  visit(name, path.join(root, 'package.json'));
}
writeFileSync(path.join(root, 'dist/ui/THIRD_PARTY_NOTICES.txt'),
  `Third-party software used by the prebuilt QMock dashboard.\n\n${notices.join('\n\n--------------------\n\n')}\n`);
