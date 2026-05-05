import { Box, Icon, Icons, Text } from 'folds';
import React from 'react';
import { Atom, atom, useAtomValue } from 'jotai';
import * as css from './styles.css';
import { IImageInfo } from '../../../../types/matrix/common';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useStableMediaUrl } from './useStableMediaUrl';
import { getEmojiBoardMediaUrls, isAnimatedEmojiBoardMedia } from './media';
import { isHttpUrl, isMxcUrl } from '../../../utils/matrix';

export type PreviewData = {
  key: string;
  shortcode: string;
  info?: IImageInfo;
};

export const createPreviewDataAtom = (initial?: PreviewData) =>
  atom<PreviewData | undefined>(initial);

type PreviewProps = {
  previewAtom: Atom<PreviewData | undefined>;
};
export function Preview({ previewAtom }: PreviewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const { key, shortcode, info } = useAtomValue(previewAtom) ?? {};
  const customEmoji = isMxcUrl(key) || isHttpUrl(key);
  const { primaryUrl, fallbackUrl } = getEmojiBoardMediaUrls({
    mx,
    mxc: customEmoji ? key : undefined,
    useAuthentication,
    info,
    width: 256,
    height: 256,
  });
  const animated = isAnimatedEmojiBoardMedia(info);
  const { displayUrl, hasFailed, requestKey, handleLoad, handleError } =
    useStableMediaUrl(primaryUrl, fallbackUrl, {
      disableObjectUrlCache: animated,
    });

  if (!shortcode) return null;

  return (
    <Box shrink="No" className={css.Preview} gap="300" alignItems="Center">
      {key && (
        <Box
          display="InlineFlex"
          className={css.PreviewEmoji}
          alignItems="Center"
          justifyContent="Center"
        >
          {customEmoji ? (
            displayUrl && !hasFailed ? (
              <img
                key={requestKey}
                className={css.PreviewImg}
                src={displayUrl}
                alt=""
                loading="eager"
                decoding="async"
                onLoad={handleLoad}
                onError={handleError}
              />
            ) : (
              <Box className={css.PreviewFallback}>
                <Icon src={Icons.Photo} size="100" />
              </Box>
            )
          ) : (
            key
          )}
        </Box>
      )}
      <Text size="H5" truncate>
        :{shortcode}:
      </Text>
    </Box>
  );
}
