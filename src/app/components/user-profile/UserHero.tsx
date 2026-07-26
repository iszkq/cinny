import React, { ReactEventHandler, useEffect, useState } from 'react';
import { Avatar, Box, Text } from 'folds';
import { useSetAtom } from 'jotai';
import classNames from 'classnames';
import * as css from './styles.css';
import { UserAvatar } from '../user-avatar';
import colorMXID from '../../../util/colorMXID';
import { getMxIdLocalPart } from '../../utils/matrix';
import { BreakWord, LineClamp3 } from '../../styles/Text.css';
import { UserPresence } from '../../hooks/useUserPresence';
import { AvatarPresence, PresenceBadge } from '../presence';
import { ImageViewer } from '../image-viewer';
import { useResilientAvatarMedia } from '../../hooks/useResilientAvatarMedia';
import {
  invalidateCachedMediaUrl,
  primeCachedMediaObjectUrl,
  primePersistentMediaUrl,
} from '../../utils/mediaUrlCache';
import { imageViewerSessionAtom } from '../../state/imageViewer';
import { nameInitials } from '../../utils/common';

const AVATAR_PREVIEW_RETRY_DELAY_MS = 400;

const wait = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

type UserHeroProps = {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  avatarOriginalUrl?: string;
  presence?: UserPresence;
};
export function UserHero({
  userId,
  displayName,
  avatarUrl,
  avatarOriginalUrl,
  presence,
}: UserHeroProps) {
  const coverMedia = useResilientAvatarMedia(avatarUrl);
  const setImageViewerSession = useSetAtom(imageViewerSessionAtom);
  const fallbackName = displayName ?? getMxIdLocalPart(userId) ?? userId;
  const coverImageKey = `${userId}-${coverMedia.imageKey}`;
  const [loadedCoverImageKey, setLoadedCoverImageKey] = useState<string>();
  const coverImageReady = !coverMedia.showFallback && loadedCoverImageKey === coverImageKey;

  useEffect(() => {
    primePersistentMediaUrl(avatarOriginalUrl, 'background');
  }, [avatarOriginalUrl]);

  const loadAvatarPreview = () => {
    const source = avatarOriginalUrl ?? avatarUrl;
    if (!source || !coverImageReady) return;

    const itemId = `avatar-${userId}`;
    setImageViewerSession({
      activeItemId: itemId,
      items: [
        {
          id: itemId,
          body: userId,
          url: source,
        },
      ],
      initialSrc: coverMedia.displaySrc,
      resolveSource: async (item) => {
        const firstUrl = await primeCachedMediaObjectUrl(item.url, 'visible', true);
        if (firstUrl) return firstUrl;

        await wait(AVATAR_PREVIEW_RETRY_DELAY_MS);
        await invalidateCachedMediaUrl(item.url);
        const retryUrl = await primeCachedMediaObjectUrl(item.url, 'visible', true);
        if (!retryUrl) throw new Error('头像原图加载失败。');
        return retryUrl;
      },
      renderViewer: (viewerProps) => <ImageViewer {...viewerProps} />,
    });
  };

  const handleCoverLoad: ReactEventHandler<HTMLImageElement> = () => {
    setLoadedCoverImageKey(coverImageKey);
    coverMedia.handleLoad();
  };

  const handleCoverError: ReactEventHandler<HTMLImageElement> = () => {
    setLoadedCoverImageKey(undefined);
    coverMedia.handleError();
  };

  return (
    <Box direction="Column" className={css.UserHero}>
      <div
        className={css.UserHeroCoverContainer}
        style={{
          backgroundColor: colorMXID(userId),
          filter: coverImageReady ? undefined : 'brightness(50%)',
        }}
      >
        {coverMedia.displaySrc && !coverMedia.showFallback && (
          <img
            key={coverMedia.imageKey}
            className={css.UserHeroCover}
            src={coverMedia.displaySrc}
            alt=""
            aria-hidden={!coverImageReady}
            style={{ visibility: coverImageReady ? 'visible' : 'hidden' }}
            onLoad={handleCoverLoad}
            onError={handleCoverError}
            draggable="false"
          />
        )}
      </div>
      <div className={css.UserHeroAvatarContainer}>
        <AvatarPresence
          className={css.UserAvatarContainer}
          badge={
            presence && <PresenceBadge presence={presence.presence} status={presence.status} />
          }
        >
          <Avatar
            as={coverImageReady ? 'button' : 'div'}
            onClick={coverImageReady ? loadAvatarPreview : undefined}
            className={css.UserHeroAvatar}
            size="500"
          >
            <UserAvatar
              className={css.UserHeroAvatarImg}
              userId={userId}
              fallbackWhileLoading
              src={avatarUrl}
              alt={fallbackName}
              renderFallback={() => <span>{nameInitials(fallbackName)}</span>}
            />
          </Avatar>
        </AvatarPresence>
      </div>
    </Box>
  );
}

type UserHeroNameProps = {
  displayName?: string;
  userId: string;
};
export function UserHeroName({ displayName, userId }: UserHeroNameProps) {
  const username = getMxIdLocalPart(userId);

  return (
    <Box grow="Yes" direction="Column" gap="0">
      <Box alignItems="Baseline" gap="200" wrap="Wrap">
        <Text
          size="H4"
          className={classNames(BreakWord, LineClamp3)}
          title={displayName ?? username}
        >
          {displayName ?? username ?? userId}
        </Text>
      </Box>
      <Box alignItems="Center" gap="100" wrap="Wrap">
        <Text size="T200" className={classNames(BreakWord, LineClamp3)} title={username}>
          @{username}
        </Text>
      </Box>
    </Box>
  );
}
