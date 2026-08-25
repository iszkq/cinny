import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('client waits for initial Matrix sync before mounting room features', async () => {
  const source = await readSource('src/app/pages/client/ClientRoot.tsx');

  assert.match(source, /const \[loading, setLoading\] = useState\(true\)/);
  assert.match(source, /INITIAL_SYNC_ENTRY_FALLBACK_MS = 1_200/);
  assert.match(source, /mx\.getRooms\(\)\.length > 0/);
  assert.match(source, /const clientReady = !startupFailed && !!mx && !loading/);
  assert.match(source, /startClient first performs homeserver capability requests/);
  assert.match(source, /startupFailed \? \(/);
  assert.match(source, /: !clientReady \? \(/);
  assert.match(source, /clientReady \? \(/);
});

test('a failed Matrix start rebuilds the client instead of reusing a half-started instance', async () => {
  const source = await readSource('src/app/pages/client/ClientRoot.tsx');

  assert.match(
    source,
    /if \(startState\.status === AsyncStatus\.Error\) \{\s*window\.location\.reload\(\);\s*return;/
  );
  assert.match(
    source,
    /if \(loadState\.status === AsyncStatus\.Error\) \{\s*loadMatrix\(\)\.catch\(\(\) => undefined\);/
  );
  assert.doesNotMatch(source, /mx \? startMatrix\(mx\) : loadMatrix\(\)/);
});

test('optional server version discovery never replaces the client with another splash page', async () => {
  const source = await readSource('src/app/pages/client/SpecVersions.tsx');
  const asyncSource = await readSource('src/app/hooks/useAsyncCallback.ts');

  assert.match(source, /window\.localStorage\.getItem/);
  assert.match(source, /useAsyncCallbackValue/);
  assert.match(source, /cachedVersions \?\? \{ versions: \[\] \}/);
  assert.doesNotMatch(source, /SplashScreen|Connecting to server/);
  assert.match(asyncSource, /load\(\)\.catch\(\(\) => undefined\)/);
});

test('initial sync cannot block entry or show a timeout dialog', async () => {
  const rootSource = await readSource('src/app/pages/client/ClientRoot.tsx');
  const statusSource = await readSource('src/app/pages/client/SyncStatus.tsx');

  assert.match(
    rootSource,
    /window\.setTimeout\(\(\) => \{\s*setLoading\(false\);\s*\}, INITIAL_SYNC_ENTRY_FALLBACK_MS\)/
  );
  assert.doesNotMatch(rootSource, /房间同步超时|清理房间缓存并重载/);
  assert.doesNotMatch(statusSource, /!syncEstablished\s*&&\s*isVisibleConnectionIssue/);
});

test('Matrix logger warning wrapper preserves its receiver during push-rule startup', async () => {
  const source = await readSource('src/client/initMatrix.ts');

  assert.match(source, /const originalWarn = matrixLogger\.warn/);
  assert.match(source, /matrixLogger\.warn = \(\.\.\.messages: unknown\[\]\) =>/);
  assert.match(source, /Reflect\.apply\(originalWarn, matrixLogger, messages\)/);
});

test('live encrypted event recovery is platform-neutral and client-scoped', async () => {
  const timelineSource = await readSource('src/app/features/room/RoomTimeline.tsx');
  const recoverySource = await readSource('src/app/utils/decryptionRecovery.ts');

  assert.doesNotMatch(timelineSource, /mx\.decryptEventIfNeeded\(mEvt, \{ isRetry: true \}\)/);
  assert.match(recoverySource, /mx\.on\(RoomEvent\.Timeline, this\.handleTimelineEvent\)/);
  assert.match(recoverySource, /isDecryptionRecoveryPending/);
  assert.match(recoverySource, /SDK_RECOVERY_GRACE_MS = 15_000/);
  assert.doesNotMatch(
    recoverySource,
    /attemptDecryption|outgoingRequestsManager|restoreSessionFromBackup/
  );
  assert.doesNotMatch(recoverySource, /isDesktopUpdaterSupported|isAndroidApp|mobileOrTablet/);
});

test('the first room list is revealed in cancellable activity-sorted batches', async () => {
  const utilsSource = await readSource('src/app/state/room-list/utils.ts');
  const roomListSource = await readSource('src/app/state/room-list/roomList.ts');
  const inviteListSource = await readSource('src/app/state/room-list/inviteList.ts');

  assert.match(utilsSource, /INITIAL_ROOM_BATCH_SIZE = 24/);
  assert.match(utilsSource, /ROOM_BATCH_SIZE = 48/);
  assert.match(utilsSource, /sort\(factoryRoomIdByActivity\(mx\)\)/);
  assert.match(utilsSource, /type: 'INITIALIZE',[\s\S]*slice\(0, INITIAL_ROOM_BATCH_SIZE\)/);
  assert.match(utilsSource, /type: 'APPEND', rooms: nextRoomIds/);
  assert.match(utilsSource, /initializationGenerationRef/);
  assert.match(utilsSource, /window\.clearTimeout\(batchTimerRef\.current\)/);
  assert.match(roomListSource, /action\.type === 'APPEND'/);
  assert.match(inviteListSource, /action\.type === 'APPEND'/);
});

test('initial messages stay bounded and the visible encrypted room is prioritized', async () => {
  const clientSource = await readSource('src/client/initMatrix.ts');
  const timelineSource = await readSource('src/app/features/room/RoomTimeline.tsx');

  assert.match(clientSource, /INITIAL_SYNC_LIMIT = 4/);
  assert.match(clientSource, /initialSyncLimit: INITIAL_SYNC_LIMIT/);
  assert.match(timelineSource, /prioritizeRoomDecryption\(mx, room\)/);
  const backgroundSource = await readSource('src/app/utils/backgroundDecryption.ts');
  assert.match(backgroundSource, /getTimelines\(\)/);
  assert.match(backgroundSource, /retryFailures: true/);
});
