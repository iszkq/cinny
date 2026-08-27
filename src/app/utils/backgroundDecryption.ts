import { ClientEvent, MatrixClient, Room, SyncState } from 'matrix-js-sdk';
import { decryptAllTimelineEvent } from './room';
import { ANDROID_FULL_BACKUP_RESTORE_COMPLETED_EVENT } from '../../client/initMatrix';

type DecryptionScheduler = {
  queued: Set<string>;
  priorityRoomId?: string;
  activeRoomId?: string;
  running: boolean;
  stopped: boolean;
  initialized: boolean;
};

const schedulers = new WeakMap<MatrixClient, DecryptionScheduler>();

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    const callback = (
      globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void) => number }
    ).requestIdleCallback;
    if (callback) callback(resolve);
    else window.setTimeout(resolve, 16);
  });

const decryptRoom = async (mx: MatrixClient, room: Room) => {
  if (!room.hasEncryptionStateEvent()) return;
  const timelines = room.getUnfilteredTimelineSet().getTimelines();
  for (const timeline of timelines) {
    await decryptAllTimelineEvent(mx, timeline, { retryFailures: true });
    await yieldToBrowser();
  }
};

const runQueue = async (mx: MatrixClient, scheduler: DecryptionScheduler) => {
  if (scheduler.running) return;
  scheduler.running = true;
  try {
    while (!scheduler.stopped && scheduler.queued.size > 0) {
      const roomId =
        scheduler.priorityRoomId && scheduler.queued.has(scheduler.priorityRoomId)
          ? scheduler.priorityRoomId
          : (scheduler.queued.values().next().value as string);
      if (scheduler.priorityRoomId === roomId) scheduler.priorityRoomId = undefined;
      scheduler.queued.delete(roomId);
      scheduler.activeRoomId = roomId;
      try {
        const room = mx.getRoom(roomId);
        if (room) await decryptRoom(mx, room);
      } finally {
        if (scheduler.activeRoomId === roomId) scheduler.activeRoomId = undefined;
      }
      await yieldToBrowser();
    }
  } finally {
    scheduler.running = false;
  }
};

const queueAllRooms = (mx: MatrixClient, scheduler: DecryptionScheduler) => {
  mx.getRooms()
    .filter((room) => room.hasEncryptionStateEvent())
    .sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp())
    .forEach((room) => scheduler.queued.add(room.roomId));
  void runQueue(mx, scheduler);
};

export const prioritizeRoomDecryption = (mx: MatrixClient, room: Room): void => {
  const scheduler = schedulers.get(mx);
  if (scheduler) {
    // Put the visible room ahead of the global activity-sorted queue. Do not
    // launch a second decryptRoom concurrently: that races the Rust Crypto
    // backend and can make the foreground room compete with background work.
    scheduler.priorityRoomId = room.roomId;
    if (scheduler.activeRoomId === room.roomId) return;
    scheduler.queued.delete(room.roomId);
    scheduler.queued.add(room.roomId);
    void runQueue(mx, scheduler);
    return;
  }
  // The feature normally starts the scheduler before RoomTimeline mounts,
  // but retain a safe fallback for isolated/test mounts.
  void decryptRoom(mx, room);
};

export const startBackgroundRoomDecryption = (mx: MatrixClient): (() => void) => {
  const existing = schedulers.get(mx);
  if (existing) return () => undefined;
  const scheduler: DecryptionScheduler = {
    queued: new Set(),
    running: false,
    stopped: false,
    initialized: false,
  };
  schedulers.set(mx, scheduler);
  const handleSync = (state: string) => {
    if (scheduler.initialized) return;
    if (
      state === SyncState.Prepared ||
      state === SyncState.Syncing ||
      state === SyncState.Catchup
    ) {
      scheduler.initialized = true;
      queueAllRooms(mx, scheduler);
    }
  };
  const handleRoom = (room: Room) => {
    if (!scheduler.initialized || !room.hasEncryptionStateEvent()) return;
    scheduler.queued.add(room.roomId);
    void runQueue(mx, scheduler);
  };
  const handleAndroidBackupRestoreCompleted = () => {
    // The initial pass can race the one-time full backup import. Requeue all
    // encrypted rooms after the import so events which previously failed with
    // an unknown Megolm session are retried without user interaction.
    if (!scheduler.stopped) {
      scheduler.queued.clear();
      queueAllRooms(mx, scheduler);
    }
  };
  mx.on(ClientEvent.Sync, handleSync as any);
  mx.on(ClientEvent.Room, handleRoom);
  window.addEventListener(
    ANDROID_FULL_BACKUP_RESTORE_COMPLETED_EVENT,
    handleAndroidBackupRestoreCompleted
  );
  if (mx.getSyncState()) handleSync(mx.getSyncState()!);
  return () => {
    scheduler.stopped = true;
    scheduler.queued.clear();
    mx.removeListener(ClientEvent.Sync, handleSync as any);
    mx.removeListener(ClientEvent.Room, handleRoom);
    window.removeEventListener(
      ANDROID_FULL_BACKUP_RESTORE_COMPLETED_EVENT,
      handleAndroidBackupRestoreCompleted
    );
    schedulers.delete(mx);
  };
};
