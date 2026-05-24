import { MatrixClient } from 'matrix-js-sdk';
import { IImageInfo } from '../../../../types/matrix/common';
import { getNormalizedMimeType } from '../../utils/mimeTypes';
import { isHttpUrl, isMxcUrl, mxcUrlToHttp } from '../../utils/matrix';

const ANIMATED_EMOJI_MEDIA_MIME_TYPES = new Set([
  'image/gif',
  'image/apng',
  'image/webp',
  'image/avif',
]);

export const isAnimatedEmojiBoardMedia = (info?: IImageInfo): boolean =>
  ANIMATED_EMOJI_MEDIA_MIME_TYPES.has(getNormalizedMimeType(info?.mimetype ?? ''));

type EmojiBoardMediaUrlsOptions = {
  mx: MatrixClient;
  mxc?: string;
  useAuthentication?: boolean;
  info?: IImageInfo;
  width: number;
  height: number;
  resizeMethod?: string;
};

export const getEmojiBoardMediaUrls = ({
  mx,
  mxc,
  useAuthentication,
  info,
  width,
  height,
  resizeMethod = 'scale',
}: EmojiBoardMediaUrlsOptions): {
  primaryUrl?: string;
  fallbackUrl?: string;
} => {
  if (!mxc) {
    return {};
  }

  if (isHttpUrl(mxc)) {
    return {
      primaryUrl: mxc,
    };
  }

  if (!isMxcUrl(mxc)) {
    return {};
  }

  const thumbnailUrl =
    mxcUrlToHttp(mx, mxc, useAuthentication, width, height, resizeMethod) ?? undefined;
  const originalUrl = mxcUrlToHttp(mx, mxc, useAuthentication) ?? undefined;
  const animated = isAnimatedEmojiBoardMedia(info);

  const primaryUrl = animated ? originalUrl ?? thumbnailUrl : thumbnailUrl ?? originalUrl;
  const fallbackUrl =
    primaryUrl === originalUrl
      ? thumbnailUrl !== originalUrl
        ? thumbnailUrl
        : undefined
      : originalUrl !== thumbnailUrl
        ? originalUrl
        : undefined;

  return {
    primaryUrl,
    fallbackUrl,
  };
};

export const getEmojiBoardMediaCandidates = (
  options: EmojiBoardMediaUrlsOptions
): string[] => {
  const { primaryUrl, fallbackUrl } = getEmojiBoardMediaUrls(options);
  return Array.from(new Set([primaryUrl, fallbackUrl].filter(Boolean) as string[]));
};
