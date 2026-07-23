import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Box, Icon, Icons, Text } from 'folds';
import classNames from 'classnames';
import * as css from './styles.css';
import { UserAvatar } from '../user-avatar';
import colorMXID from '../../../util/colorMXID';
import { getMxIdLocalPart } from '../../utils/matrix';
import { BreakWord, LineClamp3 } from '../../styles/Text.css';
import { UserPresence } from '../../hooks/useUserPresence';
import { AvatarPresence, PresenceBadge } from '../presence';
import { ImageViewer, ImageViewerDialog } from '../image-viewer';
import { useResilientAvatarMedia } from '../../hooks/useResilientAvatarMedia';
import {
  invalidateCachedMediaUrl,
  primeCachedMediaObjectUrl,
  primePersistentMediaUrl,
} from '../../utils/mediaUrlCache';

const AVATAR_PREVIEW_RETRY_DELAY_MS = 400;

const wait = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

type UserHeroProps = {
  userId: string;
  avatarUrl?: string;
  avatarOriginalUrl?: string;
  presence?: UserPresence;
};
export function UserHero({ userId, avatarUrl, avatarOriginalUrl, presence }: UserHeroProps) {
  const coverMedia = useResilientAvatarMedia(avatarUrl);
  const [viewAvatar, setViewAvatar] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewRequestRef = useRef(0);

  useEffect(() => {
    previewRequestRef.current += 1;
    setViewAvatar(false);
    setPreviewSrc(undefined);
    setPreviewLoading(false);
    setPreviewFailed(false);
  }, [avatarOriginalUrl, avatarUrl]);

  useEffect(
    () => () => {
      previewRequestRef.current += 1;
    },
    []
  );

  useEffect(() => {
    primePersistentMediaUrl(avatarOriginalUrl, 'background');
  }, [avatarOriginalUrl]);

  useEffect(() => {
    if (viewAvatar && !previewSrc && coverMedia.displaySrc) {
      setPreviewSrc(coverMedia.displaySrc);
    }
  }, [coverMedia.displaySrc, previewSrc, viewAvatar]);

  const loadAvatarPreview = () => {
    const source = avatarOriginalUrl ?? avatarUrl;
    if (!source) return;

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setViewAvatar(true);
    setPreviewSrc(coverMedia.displaySrc);
    setPreviewLoading(true);
    setPreviewFailed(false);

    const previewPromise = (async () => {
      const firstUrl = await primeCachedMediaObjectUrl(source, 'visible', true);
      if (firstUrl || previewRequestRef.current !== requestId) {
        return firstUrl;
      }

      await wait(AVATAR_PREVIEW_RETRY_DELAY_MS);
      if (previewRequestRef.current !== requestId) return undefined;

      await invalidateCachedMediaUrl(source);
      if (previewRequestRef.current !== requestId) return undefined;

      return primeCachedMediaObjectUrl(source, 'visible', true);
    })();

    previewPromise
      .then((resolvedUrl) => {
        if (previewRequestRef.current !== requestId) return;
        if (resolvedUrl) {
          setPreviewSrc(resolvedUrl);
          return;
        }
        setPreviewFailed(true);
      })
      .catch(() => {
        if (previewRequestRef.current === requestId) setPreviewFailed(true);
      })
      .finally(() => {
        if (previewRequestRef.current === requestId) setPreviewLoading(false);
      });
  };

  const closeAvatarPreview = () => {
    previewRequestRef.current += 1;
    setViewAvatar(false);
    setPreviewLoading(false);
  };

  return (
    <Box direction="Column" className={css.UserHero}>
      <div
        className={css.UserHeroCoverContainer}
        style={{
          backgroundColor: colorMXID(userId),
          filter: coverMedia.displaySrc ? undefined : 'brightness(50%)',
        }}
      >
        {coverMedia.displaySrc && !coverMedia.showFallback && (
          <img
            key={coverMedia.imageKey}
            className={css.UserHeroCover}
            src={coverMedia.displaySrc}
            alt={userId}
            onLoad={coverMedia.handleLoad}
            onError={coverMedia.handleError}
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
            as={avatarUrl ? 'button' : 'div'}
            onClick={avatarUrl ? loadAvatarPreview : undefined}
            className={css.UserHeroAvatar}
            size="500"
          >
            <UserAvatar
              className={css.UserHeroAvatarImg}
              userId={userId}
              src={avatarUrl}
              alt={userId}
              renderFallback={() => <Icon size="500" src={Icons.User} filled />}
            />
          </Avatar>
        </AvatarPresence>
        {viewAvatar && previewSrc && (
          <ImageViewerDialog
            open
            src={previewSrc}
            alt={userId}
            loading={previewLoading}
            originalLoadFailed={previewFailed}
            onRetryOriginal={loadAvatarPreview}
            requestClose={closeAvatarPreview}
            renderViewer={(viewerProps) => <ImageViewer {...viewerProps} />}
          />
        )}
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
