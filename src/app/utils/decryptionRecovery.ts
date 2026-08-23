import {
  MatrixClient,
  MatrixEvent,
  MatrixEventEvent,
  MatrixEventHandlerMap,
  RoomEvent,
  RoomEventHandlerMap,
} from 'matrix-js-sdk';
import { recordDecryptionDiagnostic } from './decryptionDiagnostics';

const RECENT_ENCRYPTED_EVENT_WINDOW_MS = 60 * 60 * 1000;
// matrix-js-sdk owns per-session backup download and retries network failures
// with a five-second backoff. Keep the non-terminal UI around long enough for
// those bounded attempts, then reveal the actionable decryption failure.
const SDK_RECOVERY_GRACE_MS = 15_000;
const UNKNOWN_MEGOLM_SESSION = 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID';

type RecoveryTask = {
  events: Set<MatrixEvent>;
  timer: number;
};

const getSessionKey = (mEvent: MatrixEvent): string | undefined => {
  const roomId = mEvent.getRoomId();
  const sessionId = mEvent.getWireContent().session_id;
  if (!roomId || typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
  return `${roomId}\0${sessionId}`;
};

const needsSessionRecovery = (mEvent: MatrixEvent): boolean =>
  mEvent.isDecryptionFailure() && mEvent.decryptionFailureReason === UNKNOWN_MEGOLM_SESSION;

/**
 * Tracks the short interval in which matrix-js-sdk is recovering a missing
 * Megolm session. The SDK is deliberately the sole owner of backup lookup,
 * room-key handling and decryption retries; duplicating those operations here
 * races its PerSessionKeyBackupDownloader and outgoing-request queue.
 */
class DecryptionRecoveryObserver {
  private readonly tasks = new Map<string, RecoveryTask>();

  private readonly observedEvents = new Map<
    MatrixEvent,
    MatrixEventHandlerMap[MatrixEventEvent.Decrypted]
  >();

  private started = false;

  constructor(private readonly mx: MatrixClient) {}

  hasPendingEvent(mEvent: MatrixEvent): boolean {
    const sessionKey = getSessionKey(mEvent);
    return !!sessionKey && this.tasks.get(sessionKey)?.events.has(mEvent) === true;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.mx.on(RoomEvent.Timeline, this.handleTimelineEvent);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.mx.removeListener(RoomEvent.Timeline, this.handleTimelineEvent);
    this.tasks.forEach((task) => window.clearTimeout(task.timer));
    this.tasks.clear();
    this.observedEvents.forEach((handler, mEvent) => {
      mEvent.removeListener(MatrixEventEvent.Decrypted, handler);
    });
    this.observedEvents.clear();
  }

  observe(mEvent: MatrixEvent): void {
    if (Date.now() - mEvent.getTs() > RECENT_ENCRYPTED_EVENT_WINDOW_MS) return;
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
      if (task.events.size === 0) this.removeTask(sessionKey!);
    }
    this.unobserve(mEvent);
  }

  private queue(mEvent: MatrixEvent): void {
    const sessionKey = getSessionKey(mEvent);
    if (!sessionKey) return;

    const existing = this.tasks.get(sessionKey);
    if (existing) {
      existing.events.add(mEvent);
      return;
    }

    const task: RecoveryTask = {
      events: new Set([mEvent]),
      timer: window.setTimeout(() => this.expireTask(sessionKey), SDK_RECOVERY_GRACE_MS),
    };
    this.tasks.set(sessionKey, task);
    recordDecryptionDiagnostic(this.mx, mEvent, 'session_queued', {
      retryDelayMs: SDK_RECOVERY_GRACE_MS,
    });
  }

  private expireTask(sessionKey: string): void {
    const task = this.tasks.get(sessionKey);
    if (!task) return;
    const representative = task.events.values().next().value as MatrixEvent | undefined;
    if (representative) recordDecryptionDiagnostic(this.mx, representative, 'session_expired');
    this.removeTask(sessionKey);
  }

  private removeTask(sessionKey: string): void {
    const task = this.tasks.get(sessionKey);
    if (!task) return;
    window.clearTimeout(task.timer);
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

const recoveryByClient = new WeakMap<MatrixClient, DecryptionRecoveryObserver>();

const getRecovery = (mx: MatrixClient): DecryptionRecoveryObserver => {
  const existing = recoveryByClient.get(mx);
  if (existing) return existing;
  const recovery = new DecryptionRecoveryObserver(mx);
  recoveryByClient.set(mx, recovery);
  return recovery;
};

export const observeEncryptedEvent = (mx: MatrixClient, mEvent: MatrixEvent): void => {
  getRecovery(mx).observe(mEvent);
};

/** True while matrix-js-sdk is still attempting to recover this event's session. */
export const isDecryptionRecoveryPending = (mx: MatrixClient, mEvent: MatrixEvent): boolean =>
  getRecovery(mx).hasPendingEvent(mEvent);

export const startDecryptionRecovery = (mx: MatrixClient): (() => void) => {
  const recovery = getRecovery(mx);
  recovery.start();
  return () => {
    recovery.stop();
    if (recoveryByClient.get(mx) === recovery) recoveryByClient.delete(mx);
  };
};
