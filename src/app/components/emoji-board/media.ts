import { MatrixClient } from 'matrix-js-sdk';
import { IImageInfo } from '../../../types/matrix/common';
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

const requestStaticThumbnail = (src: string | undefined): string | undefined => {
  if (!src) return undefined;

  try {
    const url = new URL(src);
    url.searchParams.set('animated', 'false');
    return url.toString();
  } catch {
    return src;
  }
};

type EmojiBoardMediaUrlsOptions = {
  mx: MatrixClient;
  mxc?: string;
  useAuthentication?: boolean;
  info?: IImageInfo;
  width: number;
  height: number;
  resizeMethod?: string;
  preferOriginal?: boolean;
  forceThumbnail?: boolean;
};

export const getEmojiBoardMediaUrls = ({
  mx,
  mxc,
  useAuthentication,
  info,
  width,
  height,
  resizeMethod = 'scale',
  preferOriginal = false,
  forceThumbnail = false,
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
  const preferredThumbnailUrl = forceThumbnail
    ? requestStaticThumbnail(thumbnailUrl)
    : thumbnailUrl;
  const animated = isAnimatedEmojiBoardMedia(info);

  const primaryUrl = forceThumbnail
    ? preferredThumbnailUrl ?? originalUrl
    : animated || preferOriginal
    ? originalUrl ?? thumbnailUrl
    : thumbnailUrl ?? originalUrl;
  const fallbackUrl =
    primaryUrl === originalUrl
      ? preferredThumbnailUrl !== originalUrl
        ? preferredThumbnailUrl
        : undefined
      : originalUrl !== preferredThumbnailUrl
      ? originalUrl
      : undefined;

  return {
    primaryUrl,
    fallbackUrl,
  };
};

export const getEmojiBoardMediaCandidates = (options: EmojiBoardMediaUrlsOptions): string[] => {
  const { primaryUrl, fallbackUrl } = getEmojiBoardMediaUrls(options);
  return Array.from(new Set([primaryUrl, fallbackUrl].filter(Boolean) as string[]));
};
