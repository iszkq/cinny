import {
  ClientEvent,
  ClientEventHandlerMap,
  MatrixClient,
  MatrixEvent,
  MatrixEventEvent,
  MatrixEventHandlerMap,
  RoomEvent,
  RoomEventHandlerMap,
  SyncState,
} from 'matrix-js-sdk';
import { CryptoBackend } from 'matrix-js-sdk/lib/common-crypto/CryptoBackend';
import { recordDecryptionDiagnostic } from './decryptionDiagnostics';

const RECENT_DECRYPTION_RETRY_WINDOW_MS = 60 * 60 * 1000;
const DECRYPTION_RETRY_DELAYS_MS = [0, 500, 2_000, 5_000, 15_000, 30_000, 60_000] as const;
const DECRYPTION_IN_PROGRESS_POLL_MS = 250;
const UNKNOWN_MEGOLM_SESSION = 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID';

const DECRYPTION_RECOVERY_SYNC_STATES = new Set<SyncState>([
  SyncState.Prepared,
  SyncState.Catchup,
  SyncState.Syncing,
]);

type RecoveryTask = {
  events: Set<MatrixEvent>;
  expiresAt: number;
  retryIndex: number;
  lastDelayMs: number;
  timer?: number;
  running: boolean;
};

const getSessionKey = (mEvent: MatrixEvent): string | undefined => {
  const roomId = mEvent.getRoomId();
  const sessionId = mEvent.getWireContent().session_id;
  if (!roomId || typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
  return `${roomId}\0${sessionId}`;
};

const needsSessionRecovery = (mEvent: MatrixEvent): boolean =>
  mEvent.isDecryptionFailure() && mEvent.decryptionFailureReason === UNKNOWN_MEGOLM_SESSION;

class DecryptionRecoveryCoordinator {
  private readonly tasks = new Map<string, RecoveryTask>();

  private readonly observedEvents = new Map<
    MatrixEvent,
    MatrixEventHandlerMap[MatrixEventEvent.Decrypted]
  >();

  private started = false;

  constructor(private readonly mx: MatrixClient) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.mx.on(RoomEvent.Timeline, this.handleTimelineEvent);
    this.mx.on(ClientEvent.Sync, this.handleSync);
    window.addEventListener('focus', this.handleWindowFocus);
    window.addEventListener('online', this.handleOnline);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.mx.removeListener(RoomEvent.Timeline, this.handleTimelineEvent);
    this.mx.removeListener(ClientEvent.Sync, this.handleSync);
    window.removeEventListener('focus', this.handleWindowFocus);
    window.removeEventListener('online', this.handleOnline);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    this.tasks.forEach((task) => {
      if (task.timer !== undefined) window.clearTimeout(task.timer);
    });
    this.tasks.clear();
    this.observedEvents.forEach((handler, mEvent) => {
      mEvent.removeListener(MatrixEventEvent.Decrypted, handler);
    });
    this.observedEvents.clear();
  }

  observe(mEvent: MatrixEvent): void {
    if (Date.now() - mEvent.getTs() > RECENT_DECRYPTION_RETRY_WINDOW_MS) return;
    if (mEvent.getWireType() !== 'm.room.encrypted') return;

    if (!this.observedEvents.has(mEvent)) {
      const handleDecrypted: MatrixEventHandlerMap[MatrixEventEvent.Decrypted] = (event) => {
        this.handleDecrypted(event);
      };
      this.observedEvents.set(mEvent, handleDecrypted);
      mEvent.on(MatrixEventEvent.Decrypted, handleDecrypted);
    }

    if (needsSessionRecovery(mEvent)) this.queue(mEvent);
  }

  private readonly handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = (mEvent) => {
    this.observe(mEvent);
  };

  private readonly handleSync: ClientEventHandlerMap[ClientEvent.Sync] = (state, prevState) => {
    if (
      state &&
      DECRYPTION_RECOVERY_SYNC_STATES.has(state) &&
      state !== prevState &&
      (!prevState || !DECRYPTION_RECOVERY_SYNC_STATES.has(prevState))
    ) {
      this.restartPendingTasks();
    }
  };

  private readonly handleWindowFocus = (): void => this.restartPendingTasks();

  private readonly handleOnline = (): void => this.restartPendingTasks();

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.restartPendingTasks();
  };

  private handleDecrypted(mEvent: MatrixEvent): void {
    if (needsSessionRecovery(mEvent)) {
      this.queue(mEvent);
      return;
    }

    const sessionKey = getSessionKey(mEvent);
    const task = sessionKey ? this.tasks.get(sessionKey) : undefined;
    if (task) {
      task.events.delete(mEvent);
      recordDecryptionDiagnostic(this.mx, mEvent, 'session_recovered');
      if (task.events.size === 0) {
        this.removeTask(sessionKey!);
      } else if (!task.running) {
        this.schedule(sessionKey!, task, 0);
      }
    }
    this.unobserve(mEvent);
  }

  private queue(mEvent: MatrixEvent): void {
    const sessionKey = getSessionKey(mEvent);
    if (!sessionKey) return;

    let task = this.tasks.get(sessionKey);
    if (!task) {
      task = {
        events: new Set(),
        expiresAt: mEvent.getTs() + RECENT_DECRYPTION_RETRY_WINDOW_MS,
        retryIndex: 0,
        lastDelayMs: 0,
        running: false,
      };
      this.tasks.set(sessionKey, task);
      recordDecryptionDiagnostic(this.mx, mEvent, 'session_queued');
    }

    task.events.add(mEvent);
    task.expiresAt = Math.max(task.expiresAt, mEvent.getTs() + RECENT_DECRYPTION_RETRY_WINDOW_MS);
    this.schedule(sessionKey, task, DECRYPTION_RETRY_DELAYS_MS[task.retryIndex] ?? 0);
  }

  private schedule(sessionKey: string, task: RecoveryTask, delayMs: number): void {
    if (task.timer !== undefined || task.running) return;
    if (Date.now() >= task.expiresAt) {
      this.expireTask(sessionKey, task);
      return;
    }

    task.lastDelayMs = delayMs;
    const representative = task.events.values().next().value as MatrixEvent | undefined;
    if (representative) {
      recordDecryptionDiagnostic(this.mx, representative, 'session_retry_scheduled', {
        retryAttempt: task.retryIndex + 1,
        retryDelayMs: delayMs,
      });
    }
    task.timer = window.setTimeout(() => {
      task.timer = undefined;
      void this.retrySession(sessionKey, task);
    }, delayMs);
  }

  private async retrySession(sessionKey: string, task: RecoveryTask): Promise<void> {
    if (this.tasks.get(sessionKey) !== task || task.running) return;
    if (Date.now() >= task.expiresAt) {
      this.expireTask(sessionKey, task);
      return;
    }

    const crypto = this.mx.getCrypto();
    if (!crypto) {
      this.schedule(sessionKey, task, DECRYPTION_IN_PROGRESS_POLL_MS);
      return;
    }

    const failedEvents = Array.from(task.events).filter(needsSessionRecovery);
    task.events.forEach((mEvent) => {
      if (!needsSessionRecovery(mEvent)) task.events.delete(mEvent);
    });
    if (failedEvents.length === 0) {
      this.removeTask(sessionKey);
      return;
    }
    if (failedEvents.some((mEvent) => mEvent.isBeingDecrypted())) {
      this.schedule(sessionKey, task, DECRYPTION_IN_PROGRESS_POLL_MS);
      return;
    }

    task.running = true;
    const retryAttempt = task.retryIndex + 1;
    const representative = failedEvents[0];
    recordDecryptionDiagnostic(this.mx, representative, 'retry_started', {
      retryAttempt,
      retryDelayMs: task.lastDelayMs,
    });
    const results = await Promise.allSettled(
      failedEvents.map((mEvent) =>
        mEvent.attemptDecryption(crypto as CryptoBackend, { isRetry: true })
      )
    );
    const retryError = results.find((result) => result.status === 'rejected');
    recordDecryptionDiagnostic(this.mx, representative, 'retry_finished', {
      retryAttempt,
      retryDelayMs: task.lastDelayMs,
      error: retryError?.status === 'rejected' ? retryError.reason : undefined,
    });
    task.running = false;

    if (this.tasks.get(sessionKey) !== task) return;
    task.events.forEach((mEvent) => {
      if (!needsSessionRecovery(mEvent)) task.events.delete(mEvent);
    });
    if (task.events.size === 0) {
      recordDecryptionDiagnostic(this.mx, representative, 'session_recovered');
      this.removeTask(sessionKey);
      return;
    }

    task.retryIndex += 1;
    const nextDelay = DECRYPTION_RETRY_DELAYS_MS[task.retryIndex];
    if (nextDelay !== undefined) this.schedule(sessionKey, task, nextDelay);
  }

  private restartPendingTasks(): void {
    this.tasks.forEach((task, sessionKey) => {
      if (task.running) return;
      if (task.timer !== undefined) return;
      this.schedule(sessionKey, task, 0);
    });
  }

  private expireTask(sessionKey: string, task: RecoveryTask): void {
    const representative = task.events.values().next().value as MatrixEvent | undefined;
    if (representative) recordDecryptionDiagnostic(this.mx, representative, 'session_expired');
    this.removeTask(sessionKey);
  }

  private removeTask(sessionKey: string): void {
    const task = this.tasks.get(sessionKey);
    if (!task) return;
    if (task.timer !== undefined) window.clearTimeout(task.timer);
    task.events.forEach((mEvent) => this.unobserve(mEvent));
    this.tasks.delete(sessionKey);
  }

  private unobserve(mEvent: MatrixEvent): void {
    const handler = this.observedEvents.get(mEvent);
    if (!handler) return;
    mEvent.removeListener(MatrixEventEvent.Decrypted, handler);
    this.observedEvents.delete(mEvent);
  }
}

const recoveryByClient = new WeakMap<MatrixClient, DecryptionRecoveryCoordinator>();

const getRecovery = (mx: MatrixClient): DecryptionRecoveryCoordinator => {
  const existing = recoveryByClient.get(mx);
  if (existing) return existing;
  const recovery = new DecryptionRecoveryCoordinator(mx);
  recoveryByClient.set(mx, recovery);
  return recovery;
};

export const observeEncryptedEvent = (mx: MatrixClient, mEvent: MatrixEvent): void => {
  getRecovery(mx).observe(mEvent);
};

export const startDecryptionRecovery = (mx: MatrixClient): (() => void) => {
  const recovery = getRecovery(mx);
  recovery.start();
  return () => {
    recovery.stop();
    if (recoveryByClient.get(mx) === recovery) recoveryByClient.delete(mx);
  };
};
