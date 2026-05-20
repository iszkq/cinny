import { useAtomValue, useSetAtom } from 'jotai';
import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClientEvent,
  ClientEventHandlerMap,
  MatrixEvent,
  MatrixEventEvent,
  MatrixEventHandlerMap,
  MatrixClient,
  Room,
  RoomEvent,
  RoomEventHandlerMap,
  SyncState,
} from 'matrix-js-sdk';
import { roomToUnreadAtom, unreadEqual, unreadInfoToUnread } from '../../state/room/roomToUnread';
import NotificationSound from '../../../../public/sound/notification.ogg';
import InviteSound from '../../../../public/sound/invite.ogg';
import { APP_LOGO_URL } from '../../constants/branding';
import {
  editableActiveElement,
  loadImageElement,
  setFavicon,
  targetFromEvent,
} from '../../utils/dom';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { allInvitesAtom } from '../../state/room-list/inviteList';
import { usePreviousValue } from '../../hooks/usePreviousValue';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { getInboxInvitesPath, getInboxNotificationsPath } from '../pathUtils';
import { DesktopUpdatePrompt } from '../../components/DesktopUpdatePrompt';
import {
  getMemberDisplayName,
  getNotificationType,
  getUnreadInfo,
  isNotificationEvent,
  decryptAllTimelineEvent,
} from '../../utils/room';
import { NotificationType, UnreadInfo } from '../../../types/matrix/room';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { useInboxNotificationsSelected } from '../../hooks/router/useInbox';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { ensurePersonalPackSync } from '../../plugins/custom-emoji';
import { useWarmAllImagePackMedia, useWarmWebImagePackMedia } from '../../hooks/useImagePacks';
import { getFallbackSession } from '../../state/sessions';
import {
  aiSettingsAtom,
  applyAISettingsAccountData,
  getAISettingsAccountDataContent,
  getAISettingsAccountDataSignature,
} from '../../state/ai';
import {
  CinnyAISettingsContent,
  CinnyAccountPinPolicyContent,
} from '../../../types/matrix/accountData';
import {
  getSyncTransportDiagnostics,
  markSyncRealtimeActivity,
  startClient,
} from '../../../client/initMatrix';
import {
  applyAccountPinPolicyContent,
  hasAccountPin,
  isDesktopPinLockSupported,
  lockScreenForAccount,
  syncAccountPinPolicy,
} from '../../utils/pinLock';
import { openExternalUrl, shouldOpenHrefExternally } from '../../utils/desktop';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { useDesktopUpdater } from '../../hooks/useDesktopUpdater';
import { sendAppNotification } from '../../utils/notifications';

const ACTIVE_SYNC_STATES = new Set<SyncState>([
  SyncState.Prepared,
  SyncState.Catchup,
  SyncState.Syncing,
]);
const FAILED_PENDING_MESSAGE_STATUS = 'not_sent';
const ACTIVE_PENDING_MESSAGE_STATUSES = new Set<PendingMessageStatus>([
  'encrypting',
  'queued',
  'sending',
]);
const EXTERNAL_LINK_SELECTOR = 'a[href]';
const SYNC_RECOVERY_RETRY_INTERVAL_MS = 4000;
const SYNC_RECOVERY_WATCHDOG_INTERVAL_MS = 5000;
const SYNC_RECOVERY_PENDING_RETRY_WATCHDOG_INTERVAL_MS = 12000;
const SYNC_RECOVERY_STALL_MS = 30000;
const SYNC_RECOVERY_STALE_TRANSPORT_MS = 75000;
const SYNC_RECOVERY_ERROR_RETRY_GRACE_MS = 10000;
const SYNC_RECOVERY_STALE_RESPONSE_MS = 45000;
const SYNC_RECOVERY_HUNG_REQUEST_MS = 45000;
const SYNC_RECOVERY_FORCE_RESTART_MS = 18000;
const SYNC_RECOVERY_HARD_RESTART_STALE_MS = 90000;
const SYNC_RECOVERY_HARD_RESTART_COOLDOWN_MS = 90000;
const SYNC_RECOVERY_HARD_RESTART_DELAY_MS = 750;
const SYNC_RECOVERY_BURST_WINDOW_MS = 60000;
const SYNC_RECOVERY_BURST_THRESHOLD = 4;
const DESKTOP_UPDATE_AUTO_CHECK_DELAY_MS = 4000;
const DESKTOP_UPDATE_AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DESKTOP_UPDATE_AUTO_CHECK_FOCUS_COOLDOWN_MS = 15 * 60 * 1000;

type PendingMessageStatus = 'encrypting' | 'queued' | 'sending' | 'not_sent' | 'cancelled';

const createFaviconUrl = async (logoUrl: string, badgeColor?: string): Promise<string> => {
  const img = await loadImageElement(logoUrl);
  const size = 32;
  const badgeRadius = 6;
  const badgeCenter = size - badgeRadius - 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return logoUrl;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);

  if (badgeColor) {
    ctx.beginPath();
    ctx.arc(badgeCenter, badgeCenter, badgeRadius + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(badgeCenter, badgeCenter, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = badgeColor;
    ctx.fill();
  }

  return canvas.toDataURL('image/png');
};

const playAudio = (audioElement: HTMLAudioElement | null) => {
  if (!audioElement) return;

  try {
    audioElement.currentTime = 0;
  } catch {
    // Ignore seek errors while the browser is still preparing the audio element.
  }
  const playPromise = audioElement.play();
  if (playPromise) {
    playPromise.catch(() => undefined);
  }
};

const isActiveSyncState = (state: SyncState | null | undefined): state is SyncState =>
  Boolean(state && ACTIVE_SYNC_STATES.has(state));

const getLastSyncTransportActivityAt = (mx: MatrixClient): number => {
  const diagnostics = getSyncTransportDiagnostics(mx);

  return Math.max(
    diagnostics.lastSyncRequestAt,
    diagnostics.lastSyncResponseAt,
    diagnostics.lastSyncErrorAt,
    diagnostics.lastSyncRealtimeActivityAt
  );
};

const getPendingEventKey = (mEvent: MatrixEvent): string | undefined => {
  const txnId = (
    mEvent as MatrixEvent & {
      getTxnId?: () => string | undefined;
    }
  ).getTxnId?.();

  return mEvent.getId() ?? txnId;
};

const getPendingMessageStatus = (mEvent: MatrixEvent): PendingMessageStatus | undefined => {
  const status = (mEvent as MatrixEvent & { status?: unknown }).status;
  return typeof status === 'string' ? (status as PendingMessageStatus) : undefined;
};

const isRetryablePendingEvent = (
  mx: MatrixClient,
  mEvent: MatrixEvent,
  retryingEventIds?: Set<string>
): boolean => {
  const eventKey = getPendingEventKey(mEvent);
  const status = getPendingMessageStatus(mEvent);

  return Boolean(
    eventKey &&
      !retryingEventIds?.has(eventKey) &&
      mEvent.getSender() === mx.getUserId() &&
      status === FAILED_PENDING_MESSAGE_STATUS
  );
};

const hasRetryablePendingEvents = (
  mx: MatrixClient,
  retryingEventIds: Set<string>
): boolean =>
  mx.getRooms().some((room) => {
    const pendingEvents =
      (
        room as Room & {
          getPendingEvents?: () => MatrixEvent[];
        }
      ).getPendingEvents?.() ?? [];

    return pendingEvents.some((mEvent) => isRetryablePendingEvent(mx, mEvent, retryingEventIds));
  });

const hasRetryableTimelineDecryptions = (mx: MatrixClient): boolean =>
  mx.getRooms().some((room) =>
    room
      .getLiveTimeline()
      .getEvents()
      .some((event) => event.isDecryptionFailure())
  );

const hasActiveOutboundPendingEvents = (mx: MatrixClient): boolean =>
  mx.getRooms().some((room) => {
    const pendingEvents =
      (
        room as Room & {
          getPendingEvents?: () => MatrixEvent[];
        }
      ).getPendingEvents?.() ?? [];

    return pendingEvents.some((mEvent) => {
      const status = getPendingMessageStatus(mEvent);

      return Boolean(
        status &&
          ACTIVE_PENDING_MESSAGE_STATUSES.has(status) &&
          mEvent.getSender() === mx.getUserId()
      );
    });
  });

const retryPendingEvents = async (
  mx: MatrixClient,
  retryingEventIds: Set<string>
): Promise<void> => {
  const resendEvent = (
    mx as MatrixClient & {
      resendEvent?: (event: MatrixEvent, eventRoom: Room) => Promise<unknown>;
    }
  ).resendEvent;

  if (typeof resendEvent !== 'function') {
    return;
  }

  const retryTasks = mx.getRooms().flatMap((room) => {
    const pendingEvents =
      (
        room as Room & {
          getPendingEvents?: () => MatrixEvent[];
        }
      ).getPendingEvents?.() ?? [];

    return pendingEvents.flatMap((mEvent) => {
      const eventKey = getPendingEventKey(mEvent);

      if (!eventKey || !isRetryablePendingEvent(mx, mEvent, retryingEventIds)) {
        return [];
      }

      retryingEventIds.add(eventKey);

      return [
        resendEvent.call(mx, mEvent, room).catch(() => undefined).finally(() => {
          retryingEventIds.delete(eventKey);
        }),
      ];
    });
  });

  await Promise.all(retryTasks);
};

const retryLiveTimelineDecryptions = async (mx: MatrixClient): Promise<void> => {
  const retryTasks = mx.getRooms().flatMap((room) => {
    const liveTimeline = room.getLiveTimeline();
    const hasRetryableEvents = liveTimeline.getEvents().some((event) => event.isDecryptionFailure());

    if (!hasRetryableEvents) {
      return [];
    }

    return [decryptAllTimelineEvent(mx, liveTimeline).catch(() => undefined)];
  });

  await Promise.all(retryTasks);
};

function SystemEmojiFeature() {
  const [twitterEmoji] = useSetting(settingsAtom, 'twitterEmoji');

  if (twitterEmoji) {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji');
  } else {
    document.documentElement.style.setProperty('--font-emoji', 'Twemoji_DISABLED');
  }

  return null;
}

function PageZoomFeature() {
  const [pageZoom] = useSetting(settingsAtom, 'pageZoom');

  if (pageZoom === 100) {
    document.documentElement.style.removeProperty('font-size');
  } else {
    document.documentElement.style.setProperty('font-size', `calc(1em * ${pageZoom / 100})`);
  }

  return null;
}

function PresenceSyncFeature() {
  const mx = useMatrixClient();
  const [presenceVisibility] = useSetting(settingsAtom, 'presenceVisibility');

  useEffect(() => {
    void mx.setSyncPresence?.(presenceVisibility);
    const updatePresence = mx.setPresence?.({
      presence: presenceVisibility,
    });
    updatePresence?.catch(() => undefined);
  }, [mx, presenceVisibility]);

  return null;
}

function SyncRecoveryFeature() {
  const mx = useMatrixClient();
  const recoveryPromiseRef = useRef<Promise<void>>();
  const lastHealthySyncRef = useRef(Date.now());
  const lastRecoveryAttemptRef = useRef(0);
  const lastPendingRetryAtRef = useRef(0);
  const retryingPendingEventIdsRef = useRef<Set<string>>(new Set());
  const lastHardRestartAtRef = useRef(0);
  const reconnectStartedAtRef = useRef<number>();
  const reconnectBurstCountRef = useRef(0);
  const lastReconnectTransitionAtRef = useRef(0);

  const resetReconnectTracking = useCallback(() => {
    reconnectStartedAtRef.current = undefined;
    reconnectBurstCountRef.current = 0;
    lastReconnectTransitionAtRef.current = 0;
  }, []);

  const getReconnectDuration = useCallback(() => {
    if (typeof reconnectStartedAtRef.current !== 'number') {
      return 0;
    }

    return Date.now() - reconnectStartedAtRef.current;
  }, []);

  const getLastSuccessfulSyncAt = useCallback(() => {
    const diagnostics = getSyncTransportDiagnostics(mx);

    return Math.max(
      lastHealthySyncRef.current,
      diagnostics.lastSyncResponseAt,
      diagnostics.lastSyncRealtimeActivityAt
    );
  }, [mx]);

  const trackReconnectState = useCallback(
    (state: SyncState | null, previous?: SyncState | null) => {
      if (!state || isActiveSyncState(state)) {
        resetReconnectTracking();
        return;
      }

      if (state !== SyncState.Reconnecting && state !== SyncState.Error && state !== SyncState.Stopped) {
        return;
      }

      const now = Date.now();
      if (typeof reconnectStartedAtRef.current !== 'number') {
        reconnectStartedAtRef.current = now;
      }

      if (previous !== state) {
        if (
          lastReconnectTransitionAtRef.current > 0 &&
          now - lastReconnectTransitionAtRef.current <= SYNC_RECOVERY_BURST_WINDOW_MS
        ) {
          reconnectBurstCountRef.current += 1;
        } else {
          reconnectBurstCountRef.current = 1;
        }

        lastReconnectTransitionAtRef.current = now;
      }
    },
    [resetReconnectTracking]
  );

  const shouldForceRestartSync = useCallback(
    (syncState: SyncState | null) => {
      if (syncState === SyncState.Stopped) {
        return true;
      }

      const reconnectDuration = getReconnectDuration();
      if (reconnectDuration >= SYNC_RECOVERY_FORCE_RESTART_MS) {
        return true;
      }

      if (
        reconnectBurstCountRef.current >= SYNC_RECOVERY_BURST_THRESHOLD &&
        Date.now() - getLastSuccessfulSyncAt() >= 10000
      ) {
        return true;
      }

      if (
        syncState === SyncState.Error &&
        reconnectDuration >= SYNC_RECOVERY_RETRY_INTERVAL_MS * 2
      ) {
        return true;
      }

      return false;
    },
    [getLastSuccessfulSyncAt, getReconnectDuration]
  );

  const hasStaleSyncTransport = useCallback(() => {
    const diagnostics = getSyncTransportDiagnostics(mx);
    const { lastSyncRequestAt, lastSyncResponseAt, lastSyncNetworkErrorAt } = diagnostics;
    const now = Date.now();
    const pendingSyncRequest = lastSyncRequestAt > lastSyncResponseAt;
    const syncActivityObservedAfterNetworkError =
      Math.max(
        lastSyncRequestAt,
        lastSyncResponseAt,
        diagnostics.lastSyncRealtimeActivityAt
      ) > lastSyncNetworkErrorAt;

    if (
      lastSyncNetworkErrorAt > 0 &&
      !syncActivityObservedAfterNetworkError &&
      now - lastSyncNetworkErrorAt >= SYNC_RECOVERY_ERROR_RETRY_GRACE_MS
    ) {
      return true;
    }

    if (
      !pendingSyncRequest &&
      lastSyncResponseAt > 0 &&
      now - lastSyncResponseAt >= SYNC_RECOVERY_STALE_RESPONSE_MS
    ) {
      return true;
    }

    if (
      pendingSyncRequest &&
      now - lastSyncRequestAt >= SYNC_RECOVERY_HUNG_REQUEST_MS
    ) {
      return true;
    }

    const lastSyncTransportActivityAt = getLastSyncTransportActivityAt(mx);
    if (lastSyncTransportActivityAt === 0) {
      return false;
    }

    return now - lastSyncTransportActivityAt >= SYNC_RECOVERY_STALE_TRANSPORT_MS;
  }, [mx]);

  const shouldHardRestartSync = useCallback(
    (syncState: SyncState | null, forceRestart: boolean, now: number) => {
      if (!forceRestart || !mx.clientRunning || syncState === SyncState.Stopped) {
        return false;
      }

      if (now - lastHardRestartAtRef.current < SYNC_RECOVERY_HARD_RESTART_COOLDOWN_MS) {
        return false;
      }

      if (hasActiveOutboundPendingEvents(mx)) {
        return false;
      }

      const diagnostics = getSyncTransportDiagnostics(mx);
      const lastSuccessfulSyncAt = getLastSuccessfulSyncAt();
      const pendingSyncRequest = diagnostics.lastSyncRequestAt > diagnostics.lastSyncResponseAt;
      const staleSuccessfulSync =
        now - lastSuccessfulSyncAt >= SYNC_RECOVERY_HARD_RESTART_STALE_MS;
      const severelyHungSyncRequest =
        pendingSyncRequest &&
        now - diagnostics.lastSyncRequestAt >= SYNC_RECOVERY_HARD_RESTART_STALE_MS;

      return staleSuccessfulSync || severelyHungSyncRequest;
    },
    [getLastSuccessfulSyncAt, mx]
  );

  const recoverSync = useCallback(
    (forceRestart = false) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }

      const now = Date.now();
      if (now - lastRecoveryAttemptRef.current < SYNC_RECOVERY_RETRY_INTERVAL_MS) {
        return;
      }

      const syncState = mx.getSyncState();
      if (!forceRestart && isActiveSyncState(syncState)) {
        return;
      }

      if (recoveryPromiseRef.current) {
        return;
      }

      lastRecoveryAttemptRef.current = now;
      recoveryPromiseRef.current = (async () => {
        if (!mx.clientRunning || syncState === SyncState.Stopped) {
          await startClient(mx);
          return;
        }

        if (
          syncState !== SyncState.Error &&
          syncState !== SyncState.Reconnecting &&
          !forceRestart
        ) {
          return;
        }

        if (shouldHardRestartSync(syncState, forceRestart, now)) {
          lastHardRestartAtRef.current = now;
          mx.stopClient();

          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, SYNC_RECOVERY_HARD_RESTART_DELAY_MS);
          });

          await startClient(mx);
          return;
        }

        const retried = mx.retryImmediately();
        if (!retried && !mx.clientRunning) {
          await startClient(mx);
        }
      })()
        .catch(() => undefined)
        .finally(() => {
          recoveryPromiseRef.current = undefined;
        });
    },
    [mx, shouldHardRestartSync]
  );

  const retryPendingMessages = useCallback(() => {
    const syncState = mx.getSyncState();
    if (!isActiveSyncState(syncState)) {
      return;
    }

    if (
      !hasRetryablePendingEvents(mx, retryingPendingEventIdsRef.current) &&
      !hasRetryableTimelineDecryptions(mx)
    ) {
      return;
    }

    const now = Date.now();
    if (now - lastPendingRetryAtRef.current < SYNC_RECOVERY_RETRY_INTERVAL_MS) {
      return;
    }

    lastPendingRetryAtRef.current = now;
    void Promise.allSettled([
      retryPendingEvents(mx, retryingPendingEventIdsRef.current),
      retryLiveTimelineDecryptions(mx),
    ]);
  }, [mx]);

  useEffect(() => {
    const handleSync: ClientEventHandlerMap[ClientEvent.Sync] = (state, previous) => {
      if (isActiveSyncState(state)) {
        lastHealthySyncRef.current = Date.now();
        markSyncRealtimeActivity(mx);
        resetReconnectTracking();
        retryPendingMessages();
        return;
      }

      trackReconnectState(state, previous);

      if (state === SyncState.Error) {
        recoverSync(shouldForceRestartSync(state));
      }
    };

    mx.on(ClientEvent.Sync, handleSync);
    return () => {
      mx.removeListener(ClientEvent.Sync, handleSync);
    };
  }, [mx, recoverSync, resetReconnectTracking, retryPendingMessages, shouldForceRestartSync, trackReconnectState]);

  useEffect(() => {
    const triggerRetry: () => void = () => {
      retryPendingMessages();
    };

    const handleToDeviceEvent: ClientEventHandlerMap[ClientEvent.ToDeviceEvent] = () => {
      lastHealthySyncRef.current = Date.now();
      markSyncRealtimeActivity(mx);
      void retryLiveTimelineDecryptions(mx);
      triggerRetry();
    };

    const handleEventDecrypted: MatrixEventHandlerMap[MatrixEventEvent.Decrypted] = () => {
      triggerRetry();
    };

    const handleRoomTimeline: RoomEventHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      room,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (!room || toStartOfTimeline || removed || !data?.liveEvent) {
        return;
      }

      lastHealthySyncRef.current = Date.now();
      markSyncRealtimeActivity(mx);

      if (mEvent.isEncrypted() || mEvent.isDecryptionFailure()) {
        void decryptAllTimelineEvent(mx, room.getLiveTimeline()).catch(() => undefined);
        triggerRetry();
      }
    };

    mx.on(ClientEvent.ToDeviceEvent, handleToDeviceEvent);
    mx.on(MatrixEventEvent.Decrypted, handleEventDecrypted);
    mx.on(RoomEvent.Timeline, handleRoomTimeline);

    return () => {
      mx.removeListener(ClientEvent.ToDeviceEvent, handleToDeviceEvent);
      mx.removeListener(MatrixEventEvent.Decrypted, handleEventDecrypted);
      mx.removeListener(RoomEvent.Timeline, handleRoomTimeline);
    };
  }, [mx, retryPendingMessages]);

  useEffect(() => {
    const recoverVisibleSession = () => {
      recoverSync(hasStaleSyncTransport());
      retryPendingMessages();
    };

    const handleOnline = () => {
      recoverVisibleSession();
    };
    const handleFocus = () => {
      recoverVisibleSession();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recoverVisibleSession();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const recoveryTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const syncState = mx.getSyncState();
      if (hasStaleSyncTransport()) {
        recoverSync(true);
        return;
      }

      if (isActiveSyncState(syncState)) {
        return;
      }

      if (Date.now() - getLastSuccessfulSyncAt() < SYNC_RECOVERY_STALL_MS) {
        return;
      }

      recoverSync(shouldForceRestartSync(syncState));
    }, SYNC_RECOVERY_WATCHDOG_INTERVAL_MS);

    const pendingRetryTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }

      retryPendingMessages();
    }, SYNC_RECOVERY_PENDING_RETRY_WATCHDOG_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(recoveryTimer);
      window.clearInterval(pendingRetryTimer);
    };
  }, [
    getLastSuccessfulSyncAt,
    hasStaleSyncTransport,
    mx,
    recoverSync,
    retryPendingMessages,
    shouldForceRestartSync,
  ]);

  return null;
}

function DesktopExternalLinkFeature() {
  useEffect(() => {
    if (!isDesktopUpdaterSupported()) {
      return undefined;
    }

    const handleClick = (evt: MouseEvent) => {
      if (evt.defaultPrevented || evt.button !== 0) {
        return;
      }

      const anchor = targetFromEvent(evt, EXTERNAL_LINK_SELECTOR) as HTMLAnchorElement | undefined;
      if (!anchor || anchor.hasAttribute('download')) {
        return;
      }

      if (anchor.dataset.mentionId || anchor.dataset.mentionEventId || anchor.dataset.mentionVia) {
        return;
      }

      const href = anchor.getAttribute('href');
      if (!shouldOpenHrefExternally(href)) {
        return;
      }

      evt.preventDefault();
      void openExternalUrl(anchor.href || href);
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  return null;
}

function DesktopPinLockShortcutFeature() {
  const mx = useMatrixClient();
  const session = getFallbackSession();

  useEffect(() => {
    if (!isDesktopUpdaterSupported()) {
      return undefined;
    }

    const baseUrl = session?.baseUrl;
    const userId = mx.getUserId();

    if (!baseUrl || !userId) {
      return undefined;
    }

    const handleKeyDown = (evt: KeyboardEvent) => {
      if (editableActiveElement()) {
        return;
      }

      if (!(evt.ctrlKey || evt.metaKey) || evt.altKey || evt.shiftKey) {
        return;
      }

      if (evt.key.toLowerCase() !== 'l') {
        return;
      }

      if (!hasAccountPin(baseUrl, userId)) {
        return;
      }

      evt.preventDefault();
      lockScreenForAccount(baseUrl, userId);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mx, session?.baseUrl]);

  return null;
}

function DesktopAutoUpdateFeature() {
  const { desktopSupported, pendingUpdate, checkForUpdates } = useDesktopUpdater();
  const [promptOpen, setPromptOpen] = useState(false);
  const promptedVersionRef = useRef<string>();
  const lastAutoCheckAtRef = useRef(0);

  useEffect(() => {
    if (!desktopSupported) {
      return undefined;
    }

    const triggerCheck = (force = false) => {
      const now = Date.now();
      if (!force && now - lastAutoCheckAtRef.current < DESKTOP_UPDATE_AUTO_CHECK_FOCUS_COOLDOWN_MS) {
        return;
      }

      lastAutoCheckAtRef.current = now;
      void checkForUpdates({ silentIfLatest: true, showErrors: false });
    };

    const initialTimer = window.setTimeout(() => {
      triggerCheck(true);
    }, DESKTOP_UPDATE_AUTO_CHECK_DELAY_MS);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        triggerCheck(true);
      }
    }, DESKTOP_UPDATE_AUTO_CHECK_INTERVAL_MS);

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        triggerCheck();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerCheck();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkForUpdates, desktopSupported]);

  useEffect(() => {
    const version = pendingUpdate?.version;

    if (!version) {
      setPromptOpen(false);
      return;
    }

    if (promptedVersionRef.current === version) {
      return;
    }

    promptedVersionRef.current = version;
    setPromptOpen(true);
  }, [pendingUpdate?.version]);

  return <DesktopUpdatePrompt open={promptOpen} requestClose={() => setPromptOpen(false)} />;
}

function PersonalPackSyncFeature() {
  const mx = useMatrixClient();

  useEffect(() => {
    void ensurePersonalPackSync(mx).catch(() => undefined);

    const handleAccountData = (mEvent: MatrixEvent) => {
      const eventType = mEvent.getType();
      if (
        eventType === AccountDataEvent.CinnyUserEmojiPacks ||
        eventType === AccountDataEvent.PoniesUserEmotes
      ) {
        void ensurePersonalPackSync(mx).catch(() => undefined);
      }
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx]);

  return null;
}

function AISettingsAccountDataFeature() {
  const mx = useMatrixClient();
  const settings = useAtomValue(aiSettingsAtom);
  const setAISettings = useSetAtom(aiSettingsAtom);

  const settingsRef = useRef(settings);
  const hydratedRef = useRef(false);
  const remoteSignatureRef = useRef<string>();
  const applyingRemoteSignatureRef = useRef<string>();
  const pendingSaveSignatureRef = useRef<string>();

  useEffect(() => {
    settingsRef.current = settings;

    if (
      applyingRemoteSignatureRef.current &&
      getAISettingsAccountDataSignature(settings) === applyingRemoteSignatureRef.current
    ) {
      applyingRemoteSignatureRef.current = undefined;
      hydratedRef.current = true;
    }
  }, [settings]);

  useEffect(() => {
    const applyAccountData = (content?: CinnyAISettingsContent) => {
      const remoteSignature = content
        ? getAISettingsAccountDataSignature(content)
        : undefined;
      remoteSignatureRef.current = remoteSignature;

      if (
        remoteSignature &&
        getAISettingsAccountDataSignature(settingsRef.current) !== remoteSignature
      ) {
        applyingRemoteSignatureRef.current = remoteSignature;
        setAISettings(applyAISettingsAccountData(settingsRef.current, content));
        return;
      }

      applyingRemoteSignatureRef.current = undefined;
      hydratedRef.current = true;
    };

    applyAccountData(
      mx.getAccountData(AccountDataEvent.CinnyAISettings)?.getContent<CinnyAISettingsContent>()
    );

    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== AccountDataEvent.CinnyAISettings) {
        return;
      }

      applyAccountData(event.getContent<CinnyAISettingsContent>());
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx, setAISettings]);

  useEffect(() => {
    if (!hydratedRef.current || applyingRemoteSignatureRef.current) {
      return;
    }

    const signature = getAISettingsAccountDataSignature(settings);
    if (
      signature === remoteSignatureRef.current ||
      signature === pendingSaveSignatureRef.current
    ) {
      return;
    }

    pendingSaveSignatureRef.current = signature;

    mx.setAccountData(AccountDataEvent.CinnyAISettings, getAISettingsAccountDataContent(settings))
      .then(() => {
        remoteSignatureRef.current = signature;
      })
      .catch(() => undefined)
      .finally(() => {
        if (pendingSaveSignatureRef.current === signature) {
          pendingSaveSignatureRef.current = undefined;
        }
      });
  }, [mx, settings]);

  return null;
}

function AccountPinPolicyFeature() {
  const mx = useMatrixClient();
  const session = getFallbackSession();

  useEffect(() => {
    if (!isDesktopPinLockSupported()) {
      return undefined;
    }

    const baseUrl = session?.baseUrl;
    const accessToken = session?.accessToken;
    const userId = mx.getUserId();

    if (!baseUrl || !accessToken || !userId) {
      return undefined;
    }

    const applyPolicy = (content?: CinnyAccountPinPolicyContent) => {
      applyAccountPinPolicyContent(baseUrl, userId, content);
    };

    applyPolicy(
      mx.getAccountData(AccountDataEvent.CinnyAccountPinPolicy)?.getContent<
        CinnyAccountPinPolicyContent
      >()
    );
    void syncAccountPinPolicy(baseUrl, userId, accessToken).catch(() => undefined);

    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== AccountDataEvent.CinnyAccountPinPolicy) {
        return;
      }

      applyPolicy(event.getContent<CinnyAccountPinPolicyContent>());
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx, session?.accessToken, session?.baseUrl]);

  return null;
}

function DesktopImagePackMediaWarmFeature() {
  useWarmAllImagePackMedia();

  return null;
}

function DefaultImagePackMediaWarmFeature() {
  useWarmWebImagePackMedia();

  return null;
}

function ImagePackMediaWarmFeature() {
  return isDesktopUpdaterSupported() ? (
    <DesktopImagePackMediaWarmFeature />
  ) : (
    <DefaultImagePackMediaWarmFeature />
  );
}

function FaviconUpdater() {
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [faviconUrls, setFaviconUrls] = useState({
    normal: APP_LOGO_URL,
    unread: APP_LOGO_URL,
    highlight: APP_LOGO_URL,
  });
  const baseTitleRef = useRef<string>();

  useEffect(() => {
    let mounted = true;

    Promise.all([
      createFaviconUrl(APP_LOGO_URL),
      createFaviconUrl(APP_LOGO_URL, '#989898'),
      createFaviconUrl(APP_LOGO_URL, '#45B83B'),
    ])
      .then(([normal, unread, highlight]) => {
        if (!mounted) return;
        setFaviconUrls({ normal, unread, highlight });
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!baseTitleRef.current) {
      baseTitleRef.current = document.title || '星火';
    }

    let notification = false;
    let highlight = false;
    roomToUnread.forEach((unread) => {
      if (unread.total > 0) {
        notification = true;
      }
      if (unread.highlight > 0) {
        highlight = true;
      }
    });

    if (highlight) {
      setFavicon(faviconUrls.highlight);
    } else if (notification) {
      setFavicon(faviconUrls.unread);
    } else {
      setFavicon(faviconUrls.normal);
    }

    const titlePrefix = highlight ? '\u25cf ' : notification ? '\u2022 ' : '';
    const nextTitle = `${titlePrefix}${baseTitleRef.current}`;
    if (document.title !== nextTitle) {
      document.title = nextTitle;
    }
  }, [roomToUnread, faviconUrls]);

  useEffect(
    () => () => {
      if (baseTitleRef.current) {
        document.title = baseTitleRef.current;
      }
    },
    []
  );

  return null;
}

function InviteNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const invites = useAtomValue(allInvitesAtom);
  const perviousInviteLen = usePreviousValue(invites.length, 0);
  const mx = useMatrixClient();

  const navigate = useNavigate();
  const [showNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');

  const notify = useCallback(
    (count: number) => {
      return sendAppNotification({
        title: 'Invitation',
        icon: APP_LOGO_URL,
        badge: APP_LOGO_URL,
        body: `You have ${count} new invitation request.`,
        silent: true,
        onClick: () => {
          if (!window.closed) navigate(getInboxInvitesPath());
        },
      });
    },
    [navigate]
  );

  const playSound = useCallback(() => {
    playAudio(audioRef.current);
  }, []);

  useEffect(() => {
    if (invites.length > perviousInviteLen && isActiveSyncState(mx.getSyncState())) {
      if (showNotifications) {
        void notify(invites.length - perviousInviteLen);
      }

      if (notificationSound) {
        playSound();
      }
    }
  }, [mx, invites, perviousInviteLen, showNotifications, notificationSound, notify, playSound]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }} preload="auto">
      <source src={InviteSound} type="audio/ogg" />
    </audio>
  );
}

function MessageNotifications() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const notifRef = useRef<Notification>();
  const unreadCacheRef = useRef<Map<string, UnreadInfo>>(new Map());
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [showNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [notificationSound] = useSetting(settingsAtom, 'isNotificationSounds');

  const navigate = useNavigate();
  const notificationSelected = useInboxNotificationsSelected();
  const selectedRoomId = useSelectedRoom();

  const notify = useCallback(
    async ({
      roomName,
      roomAvatar,
      username,
    }: {
      roomName: string;
      roomAvatar?: string;
      username: string;
      roomId: string;
      eventId: string;
    }) => {
      const noti = await sendAppNotification({
        title: roomName,
        icon: roomAvatar,
        badge: roomAvatar,
        body: `New inbox notification from ${username}`,
        silent: true,
        onClick: () => {
          if (!window.closed) navigate(getInboxNotificationsPath());
          notifRef.current = undefined;
        },
      });

      if (noti) {
        notifRef.current?.close();
        notifRef.current = noti;
      }
    },
    [navigate]
  );

  const playSound = useCallback(() => {
    playAudio(audioRef.current);
  }, []);

  useEffect(() => {
    const handleTimelineEvent: RoomEventHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      room,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (!isActiveSyncState(mx.getSyncState())) return;
      if (
        !room ||
        !data?.liveEvent ||
        room.isSpaceRoom() ||
        !isNotificationEvent(mEvent) ||
        getNotificationType(mx, room.roomId) === NotificationType.Mute
      ) {
        return;
      }

      try {
        const sender = mEvent.getSender();
        const eventId = mEvent.getId();
        if (!sender || !eventId || mEvent.getSender() === mx.getUserId()) return;
        const unreadInfo = getUnreadInfo(mx, room);
        const cachedUnreadInfo = unreadCacheRef.current.get(room.roomId);
        unreadCacheRef.current.set(room.roomId, unreadInfo);
        const suppressDesktopNotification =
          document.hasFocus() && (selectedRoomId === room.roomId || notificationSelected);

        if (!suppressDesktopNotification) {
          if (unreadInfo.total === 0) return;
          if (
            cachedUnreadInfo &&
            unreadEqual(unreadInfoToUnread(cachedUnreadInfo), unreadInfoToUnread(unreadInfo))
          ) {
            return;
          }
        }

        if (!suppressDesktopNotification && showNotifications) {
          const avatarMxc =
            room.getAvatarFallbackMember()?.getMxcAvatarUrl() ?? room.getMxcAvatarUrl();
          void notify({
            roomName: room.name ?? 'Unknown',
            roomAvatar: avatarMxc
              ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined
              : undefined,
            username: getMemberDisplayName(room, sender) ?? getMxIdLocalPart(sender) ?? sender,
            roomId: room.roomId,
            eventId,
          });
        }

        if (notificationSound) {
          playSound();
        }
      } catch {
        // Notification failures must not interrupt sync event processing.
      }
    };
    mx.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [
    mx,
    notificationSound,
    notificationSelected,
    showNotifications,
    playSound,
    notify,
    selectedRoomId,
    useAuthentication,
  ]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={audioRef} style={{ display: 'none' }} preload="auto">
      <source src={NotificationSound} type="audio/ogg" />
    </audio>
  );
}

type ClientNonUIFeaturesProps = {
  children: ReactNode;
};

export function ClientNonUIFeatures({ children }: ClientNonUIFeaturesProps) {
  return (
    <>
      <SystemEmojiFeature />
      <PageZoomFeature />
      <PresenceSyncFeature />
      <SyncRecoveryFeature />
      <DesktopExternalLinkFeature />
      <DesktopPinLockShortcutFeature />
      <DesktopAutoUpdateFeature />
      <AccountPinPolicyFeature />
      <PersonalPackSyncFeature />
      <AISettingsAccountDataFeature />
      <ImagePackMediaWarmFeature />
      <FaviconUpdater />
      <InviteNotifications />
      <MessageNotifications />
      {children}
    </>
  );
}
