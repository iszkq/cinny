import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { APP_VERSION } from '../constants/branding';

const DECRYPTION_DIAGNOSTIC_STORAGE_KEY = 'starfire_decryption_diagnostics_v1';
const MAX_STORED_ENTRIES = 200;
const MAX_REPORT_ENTRIES = 100;

export type DecryptionDiagnosticStage =
  | 'failure_observed'
  | 'session_queued'
  | 'session_retry_scheduled'
  | 'backup_lookup_started'
  | 'backup_key_imported'
  | 'backup_key_not_found'
  | 'backup_lookup_unavailable'
  | 'backup_lookup_failed'
  | 'outgoing_requests_flushed'
  | 'outgoing_requests_failed'
  | 'retry_started'
  | 'retry_finished'
  | 'key_received'
  | 'session_recovered'
  | 'session_expired';

type DecryptionDiagnosticEntry = {
  at: string;
  stage: DecryptionDiagnosticStage;
  eventId: string | null;
  roomId: string | null;
  senderId: string | null;
  eventTimestamp: number;
  failureReason: string | null;
  sessionId: string | null;
  senderKey: string | null;
  senderDeviceId: string | null;
  algorithm: string | null;
  retryAttempt?: number;
  retryDelayMs?: number;
  activeBackupVersion?: string | null;
  backupServerVersion?: string | null;
  hasBackupPrivateKey?: boolean;
  backupTrusted?: boolean;
  matchesDecryptionKey?: boolean;
  error?: string | null;
  online: boolean;
  visibility: DocumentVisibilityState;
  syncState: string | null;
};

const safeString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, 500) : null;

const safeError = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const message = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return message
    .slice(0, 500)
    .replace(
      /(access[_-]?token|authorization|cookie|password|secret|recovery[_-]?key)=([^&\s]+)/gi,
      '$1=[redacted]'
    )
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]');
};

const readEntries = (): DecryptionDiagnosticEntry[] => {
  try {
    const value = localStorage.getItem(DECRYPTION_DIAGNOSTIC_STORAGE_KEY);
    if (!value) return [];
    const entries = JSON.parse(value);
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
};

const writeEntries = (entries: DecryptionDiagnosticEntry[]): void => {
  try {
    localStorage.setItem(
      DECRYPTION_DIAGNOSTIC_STORAGE_KEY,
      JSON.stringify(entries.slice(-MAX_STORED_ENTRIES))
    );
  } catch {
    // Diagnostics must never interfere with message rendering or decryption.
  }
};

const getEncryptedMetadata = (mEvent: MatrixEvent) => {
  const wireContent = mEvent.getWireContent() as Record<string, unknown>;
  return {
    algorithm: safeString(wireContent.algorithm),
    sessionId: safeString(wireContent.session_id),
    senderKey: safeString(wireContent.sender_key) ?? mEvent.getSenderKey(),
    senderDeviceId: safeString(wireContent.device_id),
  };
};

export const getDecryptionFailureLabel = (failureReason: string | null): string => {
  switch (failureReason) {
    case 'MEGOLM_UNKNOWN_INBOUND_SESSION_ID':
      return '缺少此加密会话的密钥';
    case 'MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE':
      return '发送方因本设备未受信任而未分享密钥';
    case 'MEGOLM_KEY_WITHHELD':
      return '发送方未向本设备分享密钥';
    case 'OLM_UNKNOWN_MESSAGE_INDEX':
      return '收到的会话密钥版本无法解密此消息';
    case 'HISTORICAL_MESSAGE_NO_KEY_BACKUP':
      return '历史消息没有可用的密钥备份';
    case 'HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED':
      return '尚未取得历史消息备份的解密密钥';
    case 'HISTORICAL_MESSAGE_WORKING_BACKUP':
      return '正在从备份查找此消息密钥';
    case 'HISTORICAL_MESSAGE_USER_NOT_JOINED':
      return '消息发送时本账号尚未加入房间';
    case 'UNSIGNED_SENDER_DEVICE':
      return '发送设备未签名';
    case 'UNKNOWN_SENDER_DEVICE':
      return '无法识别发送设备';
    case 'SENDER_IDENTITY_PREVIOUSLY_VERIFIED':
      return '发送方身份验证状态已发生变化';
    default:
      return '原因尚未确定';
  }
};

export const recordDecryptionDiagnostic = (
  mx: MatrixClient,
  mEvent: MatrixEvent,
  stage: DecryptionDiagnosticStage,
  details: {
    retryAttempt?: number;
    retryDelayMs?: number;
    activeBackupVersion?: string | null;
    backupServerVersion?: string | null;
    hasBackupPrivateKey?: boolean;
    backupTrusted?: boolean;
    matchesDecryptionKey?: boolean;
    error?: unknown;
  } = {}
): void => {
  const metadata = getEncryptedMetadata(mEvent);
  const entry: DecryptionDiagnosticEntry = {
    at: new Date().toISOString(),
    stage,
    eventId: mEvent.getId() ?? null,
    roomId: mEvent.getRoomId() ?? null,
    senderId: mEvent.getSender() ?? null,
    eventTimestamp: mEvent.getTs(),
    failureReason: mEvent.decryptionFailureReason,
    sessionId: metadata.sessionId,
    senderKey: metadata.senderKey,
    senderDeviceId: metadata.senderDeviceId,
    algorithm: metadata.algorithm,
    retryAttempt: details.retryAttempt,
    retryDelayMs: details.retryDelayMs,
    activeBackupVersion: details.activeBackupVersion,
    backupServerVersion: details.backupServerVersion,
    hasBackupPrivateKey: details.hasBackupPrivateKey,
    backupTrusted: details.backupTrusted,
    matchesDecryptionKey: details.matchesDecryptionKey,
    error: safeError(details.error),
    online: navigator.onLine,
    visibility: document.visibilityState,
    syncState: mx.getSyncState(),
  };

  const entries = readEntries();
  const previous = entries.at(-1);
  if (
    previous?.eventId === entry.eventId &&
    previous.stage === entry.stage &&
    previous.retryAttempt === entry.retryAttempt &&
    previous.failureReason === entry.failureReason
  ) {
    return;
  }
  writeEntries([...entries, entry]);
};

const getCryptoDatabaseSelection = (): string[] => {
  const selections = new Set<string>();
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('cinny_rust_crypto_database:')) continue;
      const value = localStorage.getItem(key);
      if (value) selections.add(value);
    }
  } catch {
    return [];
  }
  return Array.from(selections);
};

export const createDecryptionDiagnosticReport = async (
  mx: MatrixClient,
  mEvent: MatrixEvent
): Promise<string> => {
  const crypto = mx.getCrypto();
  const metadata = getEncryptedMetadata(mEvent);
  const failureReason = mEvent.decryptionFailureReason;
  const backup = {
    activeVersion: null as string | null,
    serverVersion: null as string | null,
    serverSessionCount: null as number | null,
    trusted: null as boolean | null,
    matchesDecryptionKey: null as boolean | null,
    error: null as string | null,
  };
  const currentDevice = {
    userId: mx.getUserId(),
    deviceId: mx.getDeviceId(),
    cryptoDeviceCreationTimeMs: null as number | null,
    crossSigningVerified: null as boolean | null,
    localVerified: null as boolean | null,
    verificationError: null as string | null,
    roomKeyRequestsEnabled: null as boolean | null,
    roomKeyForwardingEnabled: null as boolean | null,
    serverDeviceFound: null as boolean | null,
    serverCurve25519MatchesLocal: null as boolean | null,
    serverEd25519MatchesLocal: null as boolean | null,
    serverKeyQueryError: null as string | null,
  };
  const senderDevice = {
    serverDeviceFound: null as boolean | null,
    serverCurve25519MatchesEvent: null as boolean | null,
    serverKeyQueryError: null as string | null,
  };

  if (crypto) {
    const olmMachine = (
      crypto as object as {
        olmMachine?: {
          deviceCreationTimeMs?: unknown;
          roomKeyRequestsEnabled?: unknown;
          roomKeyForwardingEnabled?: unknown;
        };
      }
    ).olmMachine;
    if (typeof olmMachine?.deviceCreationTimeMs === 'number') {
      currentDevice.cryptoDeviceCreationTimeMs = olmMachine.deviceCreationTimeMs;
    }
    if (typeof olmMachine?.roomKeyRequestsEnabled === 'boolean') {
      currentDevice.roomKeyRequestsEnabled = olmMachine.roomKeyRequestsEnabled;
    }
    if (typeof olmMachine?.roomKeyForwardingEnabled === 'boolean') {
      currentDevice.roomKeyForwardingEnabled = olmMachine.roomKeyForwardingEnabled;
    }
    const userId = mx.getUserId();
    const deviceId = mx.getDeviceId();
    const senderId = mEvent.getSender();
    const keyQueryUsers = Array.from(
      new Set([userId, senderId].filter((value): value is string => !!value))
    );
    const [
      activeBackupResult,
      backupInfoResult,
      verificationResult,
      ownKeysResult,
      serverKeysResult,
    ] = await Promise.allSettled([
      crypto.getActiveSessionBackupVersion(),
      crypto.getKeyBackupInfo(),
      userId && deviceId
        ? crypto.getDeviceVerificationStatus(userId, deviceId)
        : Promise.resolve(null),
      crypto.getOwnDeviceKeys(),
      keyQueryUsers.length > 0 ? mx.downloadKeysForUsers(keyQueryUsers) : Promise.resolve(null),
    ]);

    if (activeBackupResult.status === 'fulfilled') {
      backup.activeVersion = activeBackupResult.value;
    } else {
      backup.error = safeError(activeBackupResult.reason);
    }
    if (backupInfoResult.status === 'fulfilled' && backupInfoResult.value) {
      backup.serverVersion = backupInfoResult.value.version ?? null;
      backup.serverSessionCount = backupInfoResult.value.count ?? null;
      try {
        const trust = await crypto.isKeyBackupTrusted(backupInfoResult.value);
        backup.trusted = trust.trusted;
        backup.matchesDecryptionKey = trust.matchesDecryptionKey;
      } catch (error) {
        backup.error = safeError(error);
      }
    } else if (backupInfoResult.status === 'rejected') {
      backup.error = safeError(backupInfoResult.reason);
    }
    if (verificationResult.status === 'fulfilled' && verificationResult.value) {
      currentDevice.crossSigningVerified = verificationResult.value.crossSigningVerified;
      currentDevice.localVerified = verificationResult.value.localVerified;
    } else if (verificationResult.status === 'rejected') {
      currentDevice.verificationError = safeError(verificationResult.reason);
    }
    if (serverKeysResult.status === 'rejected') {
      const error = safeError(serverKeysResult.reason);
      currentDevice.serverKeyQueryError = error;
      senderDevice.serverKeyQueryError = error;
    } else if (serverKeysResult.value) {
      if (userId && deviceId) {
        const serverDevice = serverKeysResult.value.device_keys?.[userId]?.[deviceId];
        currentDevice.serverDeviceFound = !!serverDevice;
        if (serverDevice && ownKeysResult.status === 'fulfilled') {
          const serverCurve25519 = serverDevice.keys?.[`curve25519:${deviceId}`];
          const serverEd25519 = serverDevice.keys?.[`ed25519:${deviceId}`];
          currentDevice.serverCurve25519MatchesLocal =
            typeof serverCurve25519 === 'string'
              ? serverCurve25519 === ownKeysResult.value.curve25519
              : false;
          currentDevice.serverEd25519MatchesLocal =
            typeof serverEd25519 === 'string'
              ? serverEd25519 === ownKeysResult.value.ed25519
              : false;
        }
      }

      if (senderId && metadata.senderDeviceId) {
        const serverSenderDevice =
          serverKeysResult.value.device_keys?.[senderId]?.[metadata.senderDeviceId];
        senderDevice.serverDeviceFound = !!serverSenderDevice;
        if (serverSenderDevice) {
          const serverSenderCurve25519 =
            serverSenderDevice.keys?.[`curve25519:${metadata.senderDeviceId}`];
          senderDevice.serverCurve25519MatchesEvent =
            typeof serverSenderCurve25519 === 'string' && !!metadata.senderKey
              ? serverSenderCurve25519 === metadata.senderKey
              : null;
        }
      }
    }
  }

  const eventId = mEvent.getId() ?? null;
  const sessionEntries = readEntries()
    .filter(
      (entry) =>
        entry.eventId === eventId ||
        (metadata.sessionId && entry.sessionId === metadata.sessionId) ||
        entry.roomId === mEvent.getRoomId()
    )
    .slice(-MAX_REPORT_ENTRIES);
  const homeserver = (() => {
    try {
      return new URL(mx.getHomeserverUrl()).origin;
    } catch {
      return 'invalid';
    }
  })();
  const roomKeyWithheldStatusObserved =
    failureReason?.startsWith('MEGOLM_KEY_WITHHELD') === true ||
    sessionEntries.some((entry) => entry.failureReason?.startsWith('MEGOLM_KEY_WITHHELD'));

  return JSON.stringify(
    {
      report: 'Starfire decryption diagnostic',
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      platform: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
      visibility: document.visibilityState,
      homeserver,
      sync: {
        state: mx.getSyncState(),
        catchingUp: mx.getSyncStateData()?.catchingUp ?? null,
      },
      currentDevice,
      cryptoDatabaseSelections: getCryptoDatabaseSelection(),
      backup,
      failedEvent: {
        eventId,
        roomId: mEvent.getRoomId() ?? null,
        senderId: mEvent.getSender() ?? null,
        timestamp: mEvent.getTs(),
        ageMs: Math.max(0, Date.now() - mEvent.getTs()),
        failureReason,
        failureLabel: getDecryptionFailureLabel(failureReason),
        wireType: mEvent.getWireType(),
        algorithm: metadata.algorithm,
        sessionId: metadata.sessionId,
        senderKey: metadata.senderKey,
        senderDeviceId: metadata.senderDeviceId,
        senderDevice,
        roomKeyWithheldStatusObserved,
      },
      attempts: sessionEntries,
      privacy:
        'No message body, ciphertext, access token, recovery key, backup private key, password or attachment content is included.',
    },
    null,
    2
  );
};
