import { ClientEvent, MatrixClient, Room, SyncState } from 'matrix-js-sdk';
import { decryptAllTimelineEvent } from './room';

type DecryptionScheduler = {
  queued: Set<string>;
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
      const roomId = scheduler.queued.values().next().value as string;
      scheduler.queued.delete(roomId);
      const room = mx.getRoom(roomId);
      if (room) await decryptRoom(mx, room);
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
  void decryptRoom(mx, room);
  const scheduler = schedulers.get(mx);
  if (scheduler) {
    scheduler.queued.delete(room.roomId);
    scheduler.queued.add(room.roomId);
    void runQueue(mx, scheduler);
  }
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
  mx.on(ClientEvent.Sync, handleSync as any);
  mx.on(ClientEvent.Room, handleRoom);
  if (mx.getSyncState()) handleSync(mx.getSyncState()!);
  return () => {
    scheduler.stopped = true;
    scheduler.queued.clear();
    mx.removeListener(ClientEvent.Sync, handleSync as any);
    mx.removeListener(ClientEvent.Room, handleRoom);
    schedulers.delete(mx);
  };
};
