import { Box, Icon, Icons, Text } from 'folds';
import React from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import { Atom, atom, useAtomValue } from 'jotai';
import * as css from './styles.css';
import { IImageInfo } from '../../../types/matrix/common';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useStableMediaUrl } from './useStableMediaUrl';
import { getEmojiBoardMediaUrls } from './media';
import { isHttpUrl, isMxcUrl } from '../../utils/matrix';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';

export type PreviewData = {
  key: string;
  shortcode: string;
  info?: IImageInfo;
  preferOriginal?: boolean;
  anchor?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
};

export const createPreviewDataAtom = (initial?: PreviewData) =>
  atom<PreviewData | undefined>(initial);

type PreviewProps = {
  previewAtom: Atom<PreviewData | undefined>;
};
export function Preview({ previewAtom }: PreviewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const desktopSupported = isDesktopUpdaterSupported();

  const { key, shortcode, info, preferOriginal, anchor } = useAtomValue(previewAtom) ?? {};
  const remoteHttpEmoji = isHttpUrl(key);
  const customEmoji = isMxcUrl(key) || remoteHttpEmoji;
  const { primaryUrl, fallbackUrl } = getEmojiBoardMediaUrls({
    mx,
    mxc: customEmoji ? key : undefined,
    useAuthentication,
    info,
    width: 256,
    height: 256,
    preferOriginal,
  });
  const { displayUrl, hasFailed, isLoaded, requestKey, handleLoad, handleError } =
    useStableMediaUrl(primaryUrl, fallbackUrl, {
      mimeType: info?.mimetype,
      fallbackMimeType: info?.mimetype,
    });

  if (!shortcode || !anchor || typeof document === 'undefined') return null;

  const previewWidth = 176;
  const viewportPadding = 12;
  const anchorCenter = (anchor.left + anchor.right) / 2;
  const left = Math.min(
    window.innerWidth - viewportPadding - previewWidth / 2,
    Math.max(viewportPadding + previewWidth / 2, anchorCenter)
  );
  const showBelow = anchor.top < 190;
  const top = showBelow ? anchor.bottom + 8 : anchor.top - 8;

  let previewContent: React.ReactNode = key;
  if (customEmoji) {
    previewContent = (
      <Box className={css.PreviewFallback}>
        <Icon src={Icons.Photo} size="100" />
      </Box>
    );

    if (displayUrl && !hasFailed) {
      previewContent = (
        <img
          key={requestKey}
          className={css.PreviewImg}
          src={displayUrl}
          referrerPolicy={remoteHttpEmoji ? 'no-referrer' : undefined}
          alt=""
          loading="eager"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
        />
      );

      if (desktopSupported) {
        previewContent = (
          <Box className={css.MediaFrame}>
            <img
              key={requestKey}
              className={classNames(css.PreviewImg, !isLoaded && css.MediaImgPending)}
              src={displayUrl}
              referrerPolicy={remoteHttpEmoji ? 'no-referrer' : undefined}
              alt=""
              loading="eager"
              decoding="async"
              onLoad={handleLoad}
              onError={handleError}
            />
            <Box className={classNames(css.PreviewFallback, isLoaded && css.MediaFallbackHidden)}>
              <Icon src={Icons.Photo} size="100" />
            </Box>
          </Box>
        );
      }
    }
  }

  return createPortal(
    <Box
      className={css.Preview}
      direction="Column"
      gap="200"
      alignItems="Center"
      style={{
        left,
        top,
        transform: showBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      role="status"
      aria-label={`表情预览：${shortcode}`}
    >
      {key && (
        <Box
          display="InlineFlex"
          className={css.PreviewEmoji}
          alignItems="Center"
          justifyContent="Center"
        >
          {previewContent}
        </Box>
      )}
      <Text size="T200" truncate style={{ maxWidth: '100%' }}>
        :{shortcode}:
      </Text>
    </Box>,
    document.body
  );
}
