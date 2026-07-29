import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const manifestPath = path.join(distDir, '.vite', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const basePath = `/${(process.env.APP_BASE_PATH ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace(
  /^\/\/$/,
  '/'
);
const missing = [];
let referenceCount = 0;

const verifyFile = async (source, file) => {
  referenceCount += 1;
  try {
    await access(path.join(distDir, file));
  } catch {
    missing.push(`${source} -> ${file}`);
  }
};

for (const [source, entry] of Object.entries(manifest)) {
  const files = [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])].filter(Boolean);
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await verifyFile(source, file);
  }

  const imports = [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])];
  imports.forEach((importSource) => {
    referenceCount += 1;
    if (!manifest[importSource]) missing.push(`${source} -> manifest:${importSource}`);
  });
}

const indexHtml = await readFile(path.join(distDir, 'index.html'), 'utf8');
for (const match of indexHtml.matchAll(/(?:src|href)=["']([^"'?#]+)["']/g)) {
  const reference = match[1];
  if (!reference || reference.includes('://') || reference.startsWith('data:')) continue;
  const normalizedReference = reference.replace(/^\.\//, '/');
  const file = (
    basePath !== '/' && normalizedReference.startsWith(basePath)
      ? normalizedReference.slice(basePath.length)
      : normalizedReference.replace(/^\//, '')
  ).replace(/^\//, '');
  // eslint-disable-next-line no-await-in-loop
  await verifyFile('index.html', file);
}

if (missing.length > 0) {
  throw new Error(`Build references missing files:\n${missing.join('\n')}`);
}

console.log(`Verified ${referenceCount} built asset references.`);
