import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const loadOfficeFileUtils = async () => {
  const source = await readSource('src/app/utils/officeFile.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
  return import(moduleUrl);
};

const latestFileContent = {
  msgtype: 'm.file',
  body: 'report.docx',
  filename: 'report.docx',
  url: 'mxc://example.org/new-revision',
  info: {
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 2048,
  },
};

test('the original sender publishes a spec-compatible m.file replacement', async () => {
  const { buildOfficeFileUpdateMessage, OFFICE_UPDATE_PROPERTY } = await loadOfficeFileUtils();
  const result = buildOfficeFileUpdateMessage({
    sourceEventId: '$original',
    sourceSenderId: '@alice:example.org',
    currentUserId: '@alice:example.org',
    latestContent: latestFileContent,
    updatedAt: 1234,
  });

  assert.equal(result.mode, 'replace');
  assert.equal(result.content.msgtype, 'm.file');
  assert.equal(result.content.body, '* report.docx');
  assert.deepEqual(result.content['m.relates_to'], {
    event_id: '$original',
    rel_type: 'm.replace',
  });
  assert.deepEqual(result.content['m.new_content'], {
    ...latestFileContent,
    [OFFICE_UPDATE_PROPERTY]: {
      source_event_id: '$original',
      updated_at: 1234,
    },
  });
  assert.equal(result.content['m.new_content'].body, 'report.docx');
  assert.equal(result.content['m.new_content'].url, 'mxc://example.org/new-revision');
});

test('a collaborator publishes a visible standalone m.file revision', async () => {
  const { buildOfficeFileUpdateMessage, OFFICE_UPDATE_PROPERTY } = await loadOfficeFileUtils();
  const result = buildOfficeFileUpdateMessage({
    sourceEventId: '$original',
    sourceSenderId: '@alice:example.org',
    currentUserId: '@bob:example.org',
    latestContent: latestFileContent,
    updatedAt: 5678,
  });

  assert.equal(result.mode, 'successor');
  assert.equal(result.content.msgtype, 'm.file');
  assert.equal(result.content.body, 'report.docx');
  assert.equal(result.content.url, 'mxc://example.org/new-revision');
  assert.deepEqual(result.content['m.relates_to'], {
    rel_type: 'm.reference',
    event_id: '$original',
  });
  assert.equal(result.content['m.new_content'], undefined);
  assert.deepEqual(result.content[OFFICE_UPDATE_PROPERTY], {
    source_event_id: '$original',
    updated_at: 5678,
  });
});

test('encrypted attachment metadata is preserved in both replacement content layers', async () => {
  const { buildOfficeFileUpdateMessage } = await loadOfficeFileUtils();
  const encryptedFile = {
    url: 'mxc://example.org/encrypted-revision',
    v: 'v2',
    iv: 'example-iv',
    hashes: { sha256: 'example-hash' },
    key: { alg: 'A256CTR', k: 'example-key', key_ops: ['encrypt', 'decrypt'], kty: 'oct' },
  };
  const result = buildOfficeFileUpdateMessage({
    sourceEventId: '$encrypted-original',
    sourceSenderId: '@alice:example.org',
    currentUserId: '@alice:example.org',
    latestContent: {
      ...latestFileContent,
      url: undefined,
      file: encryptedFile,
    },
  });

  assert.deepEqual(result.content.file, encryptedFile);
  assert.deepEqual(result.content['m.new_content'].file, encryptedFile);
  assert.equal(result.content.url, undefined);
  assert.equal(result.content['m.new_content'].url, undefined);
});

test('an unknown source sender cannot create an invalid replacement relation', async () => {
  const { buildOfficeFileUpdateMessage } = await loadOfficeFileUtils();
  const result = buildOfficeFileUpdateMessage({
    sourceEventId: '$missing-from-timeline',
    currentUserId: '@alice:example.org',
    latestContent: latestFileContent,
  });

  assert.equal(result.mode, 'successor');
  assert.deepEqual(result.content['m.relates_to'], {
    rel_type: 'm.reference',
    event_id: '$missing-from-timeline',
  });
});

test('strict legacy parsing keeps an existing collaborator revision accessible', async () => {
  const {
    isLegacyCrossSenderOfficeFileReplacement,
    LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS,
    OFFICE_UPDATE_PROPERTY,
  } = await loadOfficeFileUtils();
  const legacyReplacement = {
    msgtype: 'm.file',
    body: '* report.docx',
    [OFFICE_UPDATE_PROPERTY]: true,
    'm.new_content': {
      ...latestFileContent,
      [OFFICE_UPDATE_PROPERTY]: {
        source_event_id: '$original',
        updated_at: 1000,
      },
    },
    'm.relates_to': { rel_type: 'm.replace', event_id: '$original' },
  };

  assert.equal(
    isLegacyCrossSenderOfficeFileReplacement(
      '$original',
      { msgtype: 'm.file', body: 'report.docx' },
      legacyReplacement,
      LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS
    ),
    true
  );
  assert.equal(
    isLegacyCrossSenderOfficeFileReplacement(
      '$different-source',
      { msgtype: 'm.file', body: 'report.docx' },
      legacyReplacement,
      LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS
    ),
    false
  );
  assert.equal(
    isLegacyCrossSenderOfficeFileReplacement(
      '$original',
      { msgtype: 'm.file', body: 'report.docx' },
      { ...legacyReplacement, 'm.new_content': { msgtype: 'm.file', body: 'no media' } },
      LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS
    ),
    false
  );
});

test('legacy Office parsing rejects relation mismatches', async () => {
  const {
    isLegacyCrossSenderOfficeFileReplacement,
    LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS,
    OFFICE_UPDATE_PROPERTY,
  } = await loadOfficeFileUtils();
  const replacement = {
    msgtype: 'm.file',
    body: '* report.docx',
    [OFFICE_UPDATE_PROPERTY]: true,
    'm.new_content': {
      ...latestFileContent,
      [OFFICE_UPDATE_PROPERTY]: {
        source_event_id: '$original',
        updated_at: 1000,
      },
    },
    'm.relates_to': { rel_type: 'm.replace', event_id: '$original' },
  };
  const isLegacy = (content) =>
    isLegacyCrossSenderOfficeFileReplacement(
      '$original',
      { msgtype: 'm.file', body: 'report.docx' },
      content,
      LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS
    );

  assert.equal(
    isLegacy({
      ...replacement,
      'm.relates_to': { rel_type: 'm.reference', event_id: '$original' },
    }),
    false
  );
  assert.equal(
    isLegacy({ ...replacement, 'm.relates_to': { rel_type: 'm.replace', event_id: '$other' } }),
    false
  );
  assert.equal(isLegacy({ ...replacement, 'm.relates_to': undefined }), false);
});

test('legacy Office parsing only accepts Matrix content URIs', async () => {
  const {
    isLegacyCrossSenderOfficeFileReplacement,
    LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS,
    OFFICE_UPDATE_PROPERTY,
  } = await loadOfficeFileUtils();
  const replacement = {
    msgtype: 'm.file',
    body: '* report.docx',
    [OFFICE_UPDATE_PROPERTY]: true,
    'm.new_content': {
      ...latestFileContent,
      url: 'https://example.org/report.docx',
      [OFFICE_UPDATE_PROPERTY]: {
        source_event_id: '$original',
        updated_at: 1000,
      },
    },
    'm.relates_to': { rel_type: 'm.replace', event_id: '$original' },
  };

  assert.equal(
    isLegacyCrossSenderOfficeFileReplacement(
      '$original',
      { msgtype: 'm.file', body: 'report.docx' },
      replacement,
      LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS
    ),
    false
  );
});

test('legacy Office migration accepts the cutoff instant and rejects later events', async () => {
  const {
    isLegacyCrossSenderOfficeFileReplacement,
    LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS,
    OFFICE_UPDATE_PROPERTY,
  } = await loadOfficeFileUtils();
  const replacement = {
    msgtype: 'm.file',
    body: '* report.docx',
    [OFFICE_UPDATE_PROPERTY]: true,
    'm.new_content': {
      ...latestFileContent,
      [OFFICE_UPDATE_PROPERTY]: {
        source_event_id: '$original',
        updated_at: 1000,
      },
    },
    'm.relates_to': { rel_type: 'm.replace', event_id: '$original' },
  };
  const isLegacyAt = (timestamp) =>
    isLegacyCrossSenderOfficeFileReplacement(
      '$original',
      { msgtype: 'm.file', body: 'report.docx' },
      replacement,
      timestamp
    );

  assert.equal(LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS, Date.parse('2026-09-10T00:00:00Z'));
  assert.equal(isLegacyAt(LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS), true);
  assert.equal(isLegacyAt(LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS + 1), false);
  assert.equal(isLegacyAt(Number.NaN), false);
});

test('the newest valid standalone successor is used by the original and successor cards', async () => {
  const { OFFICE_UPDATE_PROPERTY, resolveLatestOfficeFileRevision } = await loadOfficeFileUtils();
  const sourceContent = {
    ...latestFileContent,
    url: 'mxc://example.org/original',
  };
  const successor = (eventId, timestamp, updatedAt, url) => ({
    eventId,
    senderId: '@bob:example.org',
    eventType: 'm.room.message',
    timestamp,
    content: {
      ...latestFileContent,
      url,
      [OFFICE_UPDATE_PROPERTY]: { source_event_id: '$original', updated_at: updatedAt },
      'm.relates_to': { rel_type: 'm.reference', event_id: '$original' },
    },
  });
  const events = [
    {
      eventId: '$original',
      senderId: '@alice:example.org',
      eventType: 'm.room.message',
      timestamp: 1000,
      content: sourceContent,
    },
    successor('$older', 2000, 999999, 'mxc://example.org/older'),
    successor('$newest', 3000, 1, 'mxc://example.org/newest'),
  ];

  const fromOriginal = resolveLatestOfficeFileRevision({
    currentEventId: '$original',
    currentContent: sourceContent,
    currentEventTimestamp: 1000,
    timelineEvents: events,
  });
  const fromOlderCard = resolveLatestOfficeFileRevision({
    currentEventId: '$older',
    currentContent: events[1].content,
    currentEventTimestamp: 2000,
    timelineEvents: events,
  });

  assert.equal(fromOriginal.sourceEventId, '$original');
  assert.equal(fromOriginal.revisionEventId, '$newest');
  assert.equal(fromOriginal.content.url, 'mxc://example.org/newest');
  assert.equal(fromOlderCard.sourceEventId, '$original');
  assert.equal(fromOlderCard.content.url, 'mxc://example.org/newest');
});

test('successor selection rejects unrelated, malformed, redacted, and local events', async () => {
  const { OFFICE_UPDATE_PROPERTY, resolveLatestOfficeFileRevision } = await loadOfficeFileUtils();
  const sourceContent = { ...latestFileContent, url: 'mxc://example.org/original' };
  const candidateContent = {
    ...latestFileContent,
    [OFFICE_UPDATE_PROPERTY]: { source_event_id: '$original', updated_at: 2000 },
    'm.relates_to': { rel_type: 'm.reference', event_id: '$original' },
  };
  const events = [
    {
      eventId: '$original',
      senderId: '@alice:example.org',
      eventType: 'm.room.message',
      timestamp: 1000,
      content: sourceContent,
    },
    {
      eventId: '$wrong-source',
      senderId: '@bob:example.org',
      eventType: 'm.room.message',
      timestamp: 6000,
      content: {
        ...candidateContent,
        [OFFICE_UPDATE_PROPERTY]: { source_event_id: '$other', updated_at: 6000 },
      },
    },
    {
      eventId: '$bad-media',
      senderId: '@bob:example.org',
      eventType: 'm.room.message',
      timestamp: 5000,
      content: { ...candidateContent, url: 'https://example.org/report.docx' },
    },
    {
      eventId: '$redacted',
      senderId: '@bob:example.org',
      eventType: 'm.room.message',
      timestamp: 4000,
      redacted: true,
      content: candidateContent,
    },
    {
      eventId: '~local',
      senderId: '@bob:example.org',
      eventType: 'm.room.message',
      timestamp: 3000,
      content: candidateContent,
    },
  ];

  const resolved = resolveLatestOfficeFileRevision({
    currentEventId: '$original',
    currentContent: sourceContent,
    currentEventTimestamp: 1000,
    timelineEvents: events,
  });
  assert.equal(resolved.revisionEventId, '$original');
  assert.equal(resolved.content.url, 'mxc://example.org/original');
});

test('unmatched current metadata cannot override a timeline revision with a forged timestamp', async () => {
  const { OFFICE_UPDATE_PROPERTY, resolveLatestOfficeFileRevision } = await loadOfficeFileUtils();
  const sourceContent = { ...latestFileContent, url: 'mxc://example.org/original' };
  const currentContent = {
    ...latestFileContent,
    url: 'mxc://example.org/current',
    [OFFICE_UPDATE_PROPERTY]: { source_event_id: '$original', updated_at: 5000 },
  };
  const successorContent = {
    ...latestFileContent,
    url: 'mxc://example.org/older-successor',
    [OFFICE_UPDATE_PROPERTY]: { source_event_id: '$original', updated_at: 999999 },
    'm.relates_to': { rel_type: 'm.reference', event_id: '$original' },
  };
  const resolved = resolveLatestOfficeFileRevision({
    currentEventId: '$original',
    currentContent,
    currentEventTimestamp: 1000,
    timelineEvents: [
      {
        eventId: '$original',
        senderId: '@alice:example.org',
        eventType: 'm.room.message',
        timestamp: 1000,
        content: sourceContent,
      },
      {
        eventId: '$successor',
        senderId: '@bob:example.org',
        eventType: 'm.room.message',
        timestamp: 4000,
        content: successorContent,
      },
    ],
  });

  assert.equal(resolved.revisionEventId, '$successor');
  assert.equal(resolved.content.url, 'mxc://example.org/older-successor');
});

test('ordinary cross-sender replacements are not accepted as legacy Office revisions', async () => {
  const {
    isLegacyCrossSenderOfficeFileReplacement,
    LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS,
    OFFICE_UPDATE_PROPERTY,
  } = await loadOfficeFileUtils();
  const ordinaryReplacement = {
    msgtype: 'm.file',
    body: '* report.docx',
    'm.new_content': latestFileContent,
    'm.relates_to': { rel_type: 'm.replace', event_id: '$original' },
  };

  assert.equal(
    isLegacyCrossSenderOfficeFileReplacement(
      '$original',
      { msgtype: 'm.file', body: 'report.docx' },
      ordinaryReplacement,
      LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS
    ),
    false
  );
  assert.equal(
    isLegacyCrossSenderOfficeFileReplacement(
      '$original',
      { msgtype: 'm.file', body: 'report.docx' },
      { ...ordinaryReplacement, [OFFICE_UPDATE_PROPERTY]: { source_event_id: '$original' } },
      LEGACY_OFFICE_REPLACEMENT_CUTOFF_TS
    ),
    false
  );
});

test('Office updates reject non-file Matrix content', async () => {
  const { buildOfficeFileUpdateMessage } = await loadOfficeFileUtils();

  assert.throws(
    () =>
      buildOfficeFileUpdateMessage({
        sourceEventId: '$original',
        sourceSenderId: '@alice:example.org',
        currentUserId: '@alice:example.org',
        latestContent: { msgtype: 'm.text', body: 'not a file' },
      }),
    /must use an m\.file message/
  );
});

test('generic edit selection only keeps the strict legacy Office migration path', async () => {
  const source = await readSource('src/app/utils/room.ts');
  const getLatestEditStart = source.indexOf('export const getLatestEdit');
  const getLatestEditEnd = source.indexOf('export const getEditedEvent', getLatestEditStart);
  const getLatestEditSource = source.slice(getLatestEditStart, getLatestEditEnd);

  assert.match(
    getLatestEditSource,
    /replacementEvent\.getSender\(\) === targetEvent\.getSender\(\)/
  );
  assert.match(getLatestEditSource, /isLegacyCrossSenderOfficeFileReplacement/);
  assert.match(getLatestEditSource, /\[\.\.\.editEvents\]/);
});

test('the Office editor chooses replacement or successor from the source sender', async () => {
  const source = await readSource('src/app/components/file-viewer/OfficeFileEditor.tsx');

  assert.match(source, /buildOfficeFileUpdateMessage\(\{/);
  assert.match(source, /sourceSenderId: room\.findEventById\(eventId\)\?\.getSender\(\)/);
  assert.match(source, /currentUserId: mx\.getSafeUserId\(\)/);
  assert.match(source, /await mx\.sendMessage\(room\.roomId, content as never\)/);
  assert.doesNotMatch(source, /const OFFICE_UPDATE_PROPERTY/);
});

test('Office revision resolution includes the SDK aggregated replacement event', async () => {
  const source = await readSource('src/app/components/RenderMessageContent.tsx');

  assert.match(source, /addEvent\(currentEvent\?\.replacingEvent\(\) \?\? undefined\)/);
});
