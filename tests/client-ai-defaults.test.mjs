import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { restoreDefaultAIConfig } from '../scripts/prepare-client-config.mjs';

test('transcription and OCR have usable default configuration on every client', () => {
  const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
  for (const feature of ['audioTranscription', 'imageOcr']) {
    assert.ok(config[feature]?.defaultAihubmixApiKey?.trim(), `${feature} lost its default key`);
    assert.ok(config[feature]?.baseUrl?.startsWith('https://'), `${feature} lost its endpoint`);
  }
});

test('frozen Web and Windows checkouts receive current AI defaults without changing server settings', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'cinny-ai-defaults-'));
  try {
    const configFile = path.join(directory, 'config.json');
    const defaults = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
    writeFileSync(
      configFile,
      JSON.stringify({
        defaultHomeserver: 1,
        homeserverList: ['https://custom.example.org'],
        audioTranscription: { defaultAihubmixApiKey: '' },
        imageOcr: { defaultAihubmixApiKey: '' },
      })
    );
    restoreDefaultAIConfig(configFile);
    const actual = JSON.parse(readFileSync(configFile, 'utf8'));
    assert.deepEqual(actual.homeserverList, ['https://custom.example.org']);
    assert.equal(actual.defaultHomeserver, 1);
    for (const feature of ['audioTranscription', 'imageOcr']) {
      // Never print credential values in a failing assertion.
      assert.ok(JSON.stringify(actual[feature]) === JSON.stringify(defaults[feature]));
    }
  } finally {
    rmSync(path.join(directory, 'config.json'), { force: true });
    rmdirSync(directory);
  }
});
