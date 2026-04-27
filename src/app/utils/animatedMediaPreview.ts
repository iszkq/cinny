import { IImageInfo } from '../../types/matrix/common';
import { getThumbnail, loadImageElement } from './dom';
import { getNormalizedMimeType } from './mimeTypes';
import { fetchMediaWithAuth } from './matrix';

const STATIC_PREVIEW_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/apng',
  'image/webp',
]);

const STATIC_PREVIEW_CONCURRENCY = 2;

type StaticPreviewTask = {
  src: string;
  info?: IImageInfo;
  resolve: (value: string | undefined) => void;
};

const staticPreviewCache = new Map<string, string>();
const pendingStaticPreviewCache = new Map<string, Promise<string | undefined>>();
const staticPreviewQueue: StaticPreviewTask[] = [];
let activeStaticPreviewTasks = 0;
let staticPreviewCleanupBound = false;

const revokePreviewUrl = (url?: string) => {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const clearStaticPreviewCache = () => {
  staticPreviewCache.forEach((previewUrl) => {
    revokePreviewUrl(previewUrl);
  });
  staticPreviewCache.clear();
};

const bindStaticPreviewCleanup = () => {
  if (staticPreviewCleanupBound || typeof window === 'undefined') {
    return;
  }

  staticPreviewCleanupBound = true;
  window.addEventListener(
    'pagehide',
    () => {
      clearStaticPreviewCache();
      pendingStaticPreviewCache.clear();
      staticPreviewQueue.splice(0, staticPreviewQueue.length);
    },
    { once: true }
  );
};

const getPreviewDimensions = (width?: number, height?: number): [number, number] => {
  const safeWidth = width && width > 0 ? width : 96;
  const safeHeight = height && height > 0 ? height : 96;
  const maxDimension = 160;
  const scale = Math.min(maxDimension / safeWidth, maxDimension / safeHeight, 1);

  return [
    Math.max(Math.round(safeWidth * scale), 1),
    Math.max(Math.round(safeHeight * scale), 1),
  ];
};

export const isAnimatedPreviewCandidate = (info?: IImageInfo): boolean => {
  const mimeType = getNormalizedMimeType(info?.mimetype ?? '');
  return STATIC_PREVIEW_MIME_TYPES.has(mimeType);
};

export const getAnimatedMediaPreview = (src?: string): string | undefined =>
  (src && staticPreviewCache.get(src)) || undefined;

const createAnimatedMediaPreview = async (
  src: string,
  info?: IImageInfo
): Promise<string | undefined> => {
  if (typeof document === 'undefined') return undefined;

  const response = await fetchMediaWithAuth(src, { method: 'GET' });
  if (!response.ok) return undefined;

  const mediaBlob = await response.blob();
  const mediaObjectUrl = URL.createObjectURL(mediaBlob);

  try {
    bindStaticPreviewCleanup();

    const mediaImage = await loadImageElement(mediaObjectUrl);
    const [previewWidth, previewHeight] = getPreviewDimensions(
      info?.w ?? mediaImage.naturalWidth,
      info?.h ?? mediaImage.naturalHeight
    );

    const thumbnailBlob = await getThumbnail(mediaImage, previewWidth, previewHeight, 'image/png');
    if (!thumbnailBlob) return undefined;

    const previewUrl = URL.createObjectURL(thumbnailBlob);
    const previousPreviewUrl = staticPreviewCache.get(src);

    if (previousPreviewUrl && previousPreviewUrl !== previewUrl) {
      revokePreviewUrl(previousPreviewUrl);
    }

    staticPreviewCache.set(src, previewUrl);

    return previewUrl;
  } finally {
    revokePreviewUrl(mediaObjectUrl);
  }
};

const flushStaticPreviewQueue = () => {
  if (typeof document === 'undefined') {
    while (staticPreviewQueue.length > 0) {
      const task = staticPreviewQueue.shift();
      task?.resolve(undefined);
    }
    return;
  }

  while (
    activeStaticPreviewTasks < STATIC_PREVIEW_CONCURRENCY &&
    staticPreviewQueue.length > 0
  ) {
    const task = staticPreviewQueue.shift();
    if (!task) return;

    activeStaticPreviewTasks += 1;

    createAnimatedMediaPreview(task.src, task.info)
      .then(task.resolve)
      .catch(() => task.resolve(undefined))
      .finally(() => {
        activeStaticPreviewTasks -= 1;
        flushStaticPreviewQueue();
      });
  }
};

export const primeAnimatedMediaPreview = (
  src?: string,
  info?: IImageInfo
): Promise<string | undefined> | undefined => {
  if (!src || !isAnimatedPreviewCandidate(info)) {
    return undefined;
  }

  const cachedPreview = staticPreviewCache.get(src);
  if (cachedPreview) {
    return Promise.resolve(cachedPreview);
  }

  const pendingPreview = pendingStaticPreviewCache.get(src);
  if (pendingPreview) {
    return pendingPreview;
  }

  const previewPromise = new Promise<string | undefined>((resolve) => {
    staticPreviewQueue.push({
      src,
      info,
      resolve,
    });
  });

  pendingStaticPreviewCache.set(src, previewPromise);
  void previewPromise.finally(() => {
    pendingStaticPreviewCache.delete(src);
  });

  setTimeout(flushStaticPreviewQueue, 0);

  return previewPromise;
};
