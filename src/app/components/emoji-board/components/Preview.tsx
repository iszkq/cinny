import { Box, Icon, Icons, Text } from 'folds';
import React from 'react';
import { Atom, atom, useAtomValue } from 'jotai';
import * as css from './styles.css';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { useStableMediaUrl } from './useStableMediaUrl';

export type PreviewData = {
  key: string;
  shortcode: string;
};

export const createPreviewDataAtom = (initial?: PreviewData) =>
  atom<PreviewData | undefined>(initial);

type PreviewProps = {
  previewAtom: Atom<PreviewData | undefined>;
};
export function Preview({ previewAtom }: PreviewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const { key, shortcode } = useAtomValue(previewAtom) ?? {};
  const mediaUrl =
    key && key.startsWith('mxc://')
      ? (mxcUrlToHttp(mx, key, useAuthentication, 256, 256, 'scale') ??
          mxcUrlToHttp(mx, key, useAuthentication) ??
          key)
      : undefined;
  const { displayUrl, hasFailed, requestKey, handleLoad, handleError } =
    useStableMediaUrl(mediaUrl);

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
          {key.startsWith('mxc://') ? (
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
