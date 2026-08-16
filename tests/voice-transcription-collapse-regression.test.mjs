import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('long voice transcriptions can be expanded and collapsed', async () => {
  const source = await readFile(
    new URL('../src/app/components/message/content/AudioContent.tsx', import.meta.url),
    'utf8'
  );

  assert.match(source, /const LONG_TRANSCRIPTION_MIN_CHARS = 240/);
  assert.match(source, /const COLLAPSED_TRANSCRIPTION_LINES = 6/);
  assert.match(
    source,
    /const \[transcriptionExpanded, setTranscriptionExpanded\] = useState\(false\)/
  );
  assert.match(source, /WebkitLineClamp: COLLAPSED_TRANSCRIPTION_LINES/);
  assert.match(source, /transcriptionExpanded \? '收起' : '展开全文'/);
  assert.match(source, /setTranscriptionExpanded\(false\);\s+transcribe\(/);
});
