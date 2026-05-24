import { useAtomValue, useSetAtom } from 'jotai';
import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClientEvent,
  MatrixEvent,
  RoomEvent,
  RoomEventHandlerMap,
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
} from '../../utils/room';
import { NotificationType, UnreadInfo } from '../../../types/matrix/room';
import {
  AccountDataEvent,
  CinnyAISettingsContent,
  CinnyAppearanceSettingsContent,
  CinnyAccountPinPolicyContent,
} from '../../../types/matrix/accountData';
import {
  fetchMediaWithAuth,
  getMxIdLocalPart,
  mxcUrlToHttp,
} from '../../utils/matrix';
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
  applyAppearanceAccountData,
  DEFAULT_APPEARANCE_ACCOUNT_DATA_SIGNATURE,
  getAppearanceAccountDataContent,
  getAppearanceAccountDataSignature,
} from '../../state/appearanceAccountData';
import {
  applyAccountPinPolicyContent,
  hasAccountPin,
  isDesktopPinLockSupported,
  lockScreenForAccount,
  syncAccountPinPolicy,
} from '../../utils/pinLock';
import { blobToDataUrl, dataUrlToFile, isDataUrl } from '../../utils/dataUrl';
import { openExternalUrl, shouldOpenHrefExternally } from '../../utils/desktop';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { useDesktopUpdater } from '../../hooks/useDesktopUpdater';
import { sendAppNotification } from '../../utils/notifications';

const EXTERNAL_LINK_SELECTOR = 'a[href]';
const DESKTOP_UPDATE_AUTO_CHECK_DELAY_MS = 30000;
const DESKTOP_UPDATE_AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DESKTOP_UPDATE_AUTO_CHECK_FOCUS_COOLDOWN_MS = 15 * 60 * 1000;
const APPEARANCE_ACCOUNT_DATA_SAVE_DEBOUNCE_MS = 450;
const APPEARANCE_BACKGROUND_FILE_NAME = 'cinny-chat-background.webp';

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
    const updatePresence = mx.setPresence?.({
      presence: presenceVisibility,
    });
    updatePresence?.catch(() => undefined);
  }, [mx, presenceVisibility]);

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

function AppearanceSettingsAccountDataFeature() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const settings = useAtomValue(settingsAtom);
  const setSettings = useSetAtom(settingsAtom);

  const settingsRef = useRef(settings);
  const hydratedRef = useRef(false);
  const remoteSignatureRef = useRef<string>();
  const applyingRemoteSignatureRef = useRef<string>();
  const pendingSaveSignatureRef = useRef<string>();
  const pendingBackgroundUploadRef = useRef<string>();
  const backgroundFetchTokenRef = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;

    if (
      applyingRemoteSignatureRef.current &&
      getAppearanceAccountDataSignature(settings) === applyingRemoteSignatureRef.current
    ) {
      applyingRemoteSignatureRef.current = undefined;
      hydratedRef.current = true;
    }
  }, [settings]);

  const hydrateBackgroundDataUrl = useCallback(
    async (backgroundMxc: string) => {
      const fetchToken = backgroundFetchTokenRef.current + 1;
      backgroundFetchTokenRef.current = fetchToken;

      const mediaUrl =
        mxcUrlToHttp(mx, backgroundMxc, useAuthentication) ??
        mxcUrlToHttp(mx, backgroundMxc, false);

      if (!mediaUrl) {
        return;
      }

      const response = await fetchMediaWithAuth(mediaUrl).catch(() => undefined);
      if (!response?.ok) {
        return;
      }

      const dataUrl = await blobToDataUrl(await response.blob());

      if (
        backgroundFetchTokenRef.current !== fetchToken ||
        settingsRef.current.chatBackgroundMediaMxc !== backgroundMxc ||
        settingsRef.current.chatBackgroundDataUrl === dataUrl
      ) {
        return;
      }

      setSettings({
        ...settingsRef.current,
        chatBackgroundDataUrl: dataUrl,
      });
    },
    [mx, setSettings, useAuthentication]
  );

  useEffect(() => {
    const applyAccountData = (content?: CinnyAppearanceSettingsContent) => {
      if (!content) {
        remoteSignatureRef.current = undefined;
        applyingRemoteSignatureRef.current = undefined;
        hydratedRef.current = true;
        return;
      }

      const remoteSignature = getAppearanceAccountDataSignature(content);
      remoteSignatureRef.current = remoteSignature;

      const currentSettings = settingsRef.current;
      const currentSignature = getAppearanceAccountDataSignature(currentSettings);
      const remoteBackgroundMxc = content.chatBackgroundMediaMxc;
      const backgroundChanged = currentSettings.chatBackgroundMediaMxc !== remoteBackgroundMxc;
      let nextSettings = applyAppearanceAccountData(currentSettings, content);

      if (!remoteBackgroundMxc) {
        nextSettings = {
          ...nextSettings,
          chatBackgroundMediaMxc: undefined,
          chatBackgroundDataUrl: undefined,
        };
      } else if (backgroundChanged) {
        nextSettings = {
          ...nextSettings,
          chatBackgroundDataUrl: undefined,
        };
      }

      if (currentSignature !== remoteSignature || backgroundChanged) {
        applyingRemoteSignatureRef.current = remoteSignature;
        setSettings(nextSettings);
      } else {
        applyingRemoteSignatureRef.current = undefined;
        hydratedRef.current = true;
      }

      if (
        remoteBackgroundMxc &&
        (backgroundChanged || !currentSettings.chatBackgroundDataUrl)
      ) {
        void hydrateBackgroundDataUrl(remoteBackgroundMxc).catch(() => undefined);
      }
    };

    applyAccountData(
      mx
        .getAccountData(AccountDataEvent.CinnyAppearanceSettings)
        ?.getContent<CinnyAppearanceSettingsContent>()
    );

    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== AccountDataEvent.CinnyAppearanceSettings) {
        return;
      }

      applyAccountData(event.getContent<CinnyAppearanceSettingsContent>());
    };

    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [hydrateBackgroundDataUrl, mx, setSettings]);

  useEffect(() => {
    if (!hydratedRef.current || applyingRemoteSignatureRef.current) {
      return undefined;
    }

    const currentSignature = getAppearanceAccountDataSignature(settings);
    if (
      currentSignature === remoteSignatureRef.current ||
      currentSignature === pendingSaveSignatureRef.current
    ) {
      return undefined;
    }

    if (settings.chatBackgroundDataUrl && !settings.chatBackgroundMediaMxc) {
      if (
        isDataUrl(settings.chatBackgroundDataUrl) &&
        pendingBackgroundUploadRef.current !== settings.chatBackgroundDataUrl
      ) {
        pendingBackgroundUploadRef.current = settings.chatBackgroundDataUrl;

        void dataUrlToFile(settings.chatBackgroundDataUrl, APPEARANCE_BACKGROUND_FILE_NAME)
          .then((file) =>
            mx.uploadContent(file, {
              includeFilename: true,
              name: file.name,
              type: file.type,
            })
          )
          .then((response) => {
            const backgroundMxc = response.content_uri;
            if (
              !backgroundMxc ||
              settingsRef.current.chatBackgroundDataUrl !== settings.chatBackgroundDataUrl
            ) {
              return;
            }

            setSettings({
              ...settingsRef.current,
              chatBackgroundMediaMxc: backgroundMxc,
            });
          })
          .catch(() => undefined)
          .finally(() => {
            if (pendingBackgroundUploadRef.current === settings.chatBackgroundDataUrl) {
              pendingBackgroundUploadRef.current = undefined;
            }
          });
      }

      return undefined;
    }

    const saveTimer = window.setTimeout(() => {
      const latestSettings = settingsRef.current;
      const latestSignature = getAppearanceAccountDataSignature(latestSettings);

      if (
        !latestSignature ||
        latestSignature === remoteSignatureRef.current ||
        latestSignature === pendingSaveSignatureRef.current ||
        (latestSignature === DEFAULT_APPEARANCE_ACCOUNT_DATA_SIGNATURE &&
          !remoteSignatureRef.current)
      ) {
        return;
      }

      if (latestSettings.chatBackgroundDataUrl && !latestSettings.chatBackgroundMediaMxc) {
        return;
      }

      pendingSaveSignatureRef.current = latestSignature;

      mx.setAccountData(
        AccountDataEvent.CinnyAppearanceSettings,
        getAppearanceAccountDataContent(latestSettings)
      )
        .then(() => {
          remoteSignatureRef.current = latestSignature;
        })
        .catch(() => undefined)
        .finally(() => {
          if (pendingSaveSignatureRef.current === latestSignature) {
            pendingSaveSignatureRef.current = undefined;
          }
        });
    }, APPEARANCE_ACCOUNT_DATA_SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(saveTimer);
    };
  }, [mx, settings, setSettings]);

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
      return;
    }
    if (notification) {
      setFavicon(faviconUrls.unread);
      return;
    }
    setFavicon(faviconUrls.normal);
  }, [roomToUnread, faviconUrls]);

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
    if (invites.length > perviousInviteLen && mx.getSyncState() === 'SYNCING') {
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
      if (mx.getSyncState() !== 'SYNCING') return;
      if (
        !room ||
        !data.liveEvent ||
        room.isSpaceRoom() ||
        !isNotificationEvent(mEvent) ||
        getNotificationType(mx, room.roomId) === NotificationType.Mute
      ) {
        return;
      }

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
      <DesktopExternalLinkFeature />
      <DesktopPinLockShortcutFeature />
      <DesktopAutoUpdateFeature />
      <AccountPinPolicyFeature />
      <PersonalPackSyncFeature />
      <AppearanceSettingsAccountDataFeature />
      <AISettingsAccountDataFeature />
      <ImagePackMediaWarmFeature />
      <FaviconUpdater />
      <InviteNotifications />
      <MessageNotifications />
      {children}
    </>
  );
}
