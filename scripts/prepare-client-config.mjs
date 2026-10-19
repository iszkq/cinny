import { readFileSync, writeFileSync } from 'node:fs';

const defaultConfig = new URL('../config.json', import.meta.url);

export function restoreDefaultAIConfig(targetFile, sourceFile = defaultConfig) {
  const defaults = JSON.parse(readFileSync(sourceFile, 'utf8'));
  const config = JSON.parse(readFileSync(targetFile, 'utf8'));
  for (const feature of ['audioTranscription', 'imageOcr']) {
    config[feature] = { ...defaults[feature] };
  }
  writeFileSync(targetFile, `${JSON.stringify(config, null, 2)}\n`);
}
