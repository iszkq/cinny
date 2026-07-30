import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Icon, Icons } from 'folds';
import { MatrixClient } from 'matrix-js-sdk';
import classNames from 'classnames';
import { IImageInfo } from '../../../types/matrix/common';
import { EmojiItemInfo, EmojiType } from './types';
import * as css from './styles.css';
import { PackImageReader } from '../../plugins/custom-emoji';
import { IEmoji } from '../../plugins/emoji';
import { useStableMediaUrl } from './useStableMediaUrl';
import { getEmojiBoardMediaUrls } from './media';
import { getRemoteStickerPreviewUrl } from './useRemoteStickerIndex';
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';
import { isHttpUrl } from '../../utils/matrix';
import { isAndroidApp } from '../../utils/nativePlatform';

type AndroidMediaVisibilityListener = () => void;

const androidMediaVisibilityListeners = new WeakMap<Element, AndroidMediaVisibilityListener>();
let androidMediaVisibilityObserver: IntersectionObserver | undefined;

const getAndroidMediaVisibilityObserver = (): IntersectionObserver | undefined => {
  if (androidMediaVisibilityObserver || typeof IntersectionObserver === 'undefined') {
    return androidMediaVisibilityObserver;
  }

  androidMediaVisibilityObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        androidMediaVisibilityListeners.get(entry.target)?.();
        androidMediaVisibilityListeners.delete(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '160px 0px' }
  );

  return androidMediaVisibilityObserver;
};

const useAndroidMediaVisibility = () => {
  const androidApp = isAndroidApp();
  const [nearViewport, setNearViewport] = useState(!androidApp);
  const elementRef = useRef<HTMLElement>();

  const observe = useCallback(
    (element: HTMLElement | null) => {
      const previousElement = elementRef.current;
      if (!androidApp) {
        elementRef.current = element ?? undefined;
        setNearViewport(true);
        return;
      }

      const observer = getAndroidMediaVisibilityObserver();
      if (previousElement && observer) {
        observer.unobserve(previousElement);
        androidMediaVisibilityListeners.delete(previousElement);
      }

      elementRef.current = element ?? undefined;
      if (!element) return;

      androidMediaVisibilityListeners.set(element, () => setNearViewport(true));
      observer?.observe(element);
      if (!observer) setNearViewport(true);
    },
    [androidApp]
  );

  useEffect(
    () => () => {
      if (!androidApp) return;

      const element = elementRef.current;
      const observer = getAndroidMediaVisibilityObserver();
      if (element && observer) observer.unobserve(element);
      if (element) androidMediaVisibilityListeners.delete(element);
    },
    [androidApp]
  );

  return { androidApp, nearViewport, observe };
};

export const getEmojiItemInfo = (element: Element): EmojiItemInfo | undefined => {
  const label = element.getAttribute('title');
  const type = element.getAttribute('data-emoji-type') as EmojiType | undefined;
  const data = element.getAttribute('data-emoji-data');
  const shortcode = element.getAttribute('data-emoji-shortcode');
  const previewUrl = element.getAttribute('data-emoji-preview-url') ?? undefined;
  const infoStr = element.getAttribute('data-emoji-info');

  let info: IImageInfo | undefined;
  if (infoStr) {
    try {
      const parsedInfo = JSON.parse(infoStr);
      if (parsedInfo && typeof parsedInfo === 'object') {
        info = parsedInfo as IImageInfo;
      }
    } catch {
      info = undefined;
    }
  }

  if (type && data && shortcode && label)
    return {
      type,
      data,
      shortcode,
      label,
      previewUrl,
      info,
    };
  return undefined;
};

type EmojiItemProps = {
  emoji: IEmoji;
};
export function EmojiItem({ emoji }: EmojiItemProps) {
  return (
    <Box
      as="button"
      type="button"
      alignItems="Center"
      justifyContent="Center"
      className={css.EmojiItem}
      title={emoji.label}
      aria-label={`${emoji.label} emoji`}
      data-emoji-type={EmojiType.Emoji}
      data-emoji-data={emoji.unicode}
      data-emoji-shortcode={emoji.shortcode}
    >
      {emoji.unicode}
    </Box>
  );
}

type CustomEmojiItemProps = {
  mx: MatrixClient;
  useAuthentication?: boolean;
  image: PackImageReader;
};
export function CustomEmojiItem({ mx, useAuthentication, image }: CustomEmojiItemProps) {
  const desktopSupported = isDesktopUpdaterSupported();
  const { androidApp, nearViewport, observe } = useAndroidMediaVisibility();
  const imageLoading = desktopSupported || androidApp ? 'eager' : 'lazy';
  const previewUrl = getRemoteStickerPreviewUrl(image);
  const noReferrer = isHttpUrl(previewUrl ?? image.url);
  const { primaryUrl, fallbackUrl } = getEmojiBoardMediaUrls({
    mx,
    mxc: previewUrl ?? image.url,
    useAuthentication,
    info: image.info,
    width: 64,
    height: 64,
  });
  const { displayUrl, hasFailed, isLoaded, requestKey, handleLoad, handleError } =
    useStableMediaUrl(
      nearViewport ? primaryUrl : undefined,
      nearViewport ? fallbackUrl : undefined,
      {
        mimeType: image.info?.mimetype,
        fallbackMimeType: image.info?.mimetype,
      }
    );

  return (
    <Box
      as="button"
      ref={observe}
      data-android-media={androidApp || undefined}
      type="button"
      alignItems="Center"
      justifyContent="Center"
      className={css.EmojiItem}
      title={image.body || image.shortcode}
      aria-label={`${image.body || image.shortcode} emoji`}
      data-emoji-type={EmojiType.CustomEmoji}
      data-emoji-data={image.url}
      data-emoji-shortcode={image.body || image.shortcode}
      data-emoji-preview-url={previewUrl}
      data-emoji-info={image.info ? JSON.stringify(image.info) : undefined}
    >
      {displayUrl && !hasFailed ? (
        desktopSupported ? (
          <Box className={css.MediaFrame}>
            <img
              key={requestKey}
              loading={imageLoading}
              decoding="async"
              className={classNames(css.CustomEmojiImg, !isLoaded && css.MediaImgPending)}
              alt=""
              src={displayUrl}
              referrerPolicy={noReferrer ? 'no-referrer' : undefined}
              draggable={false}
              onLoad={handleLoad}
              onError={handleError}
            />
            <Box
              className={classNames(css.CustomEmojiFallback, isLoaded && css.MediaFallbackHidden)}
            >
              <Icon src={Icons.Photo} />
            </Box>
          </Box>
        ) : (
          <img
            key={requestKey}
            loading={imageLoading}
            decoding="async"
            className={classNames(css.CustomEmojiImg, androidApp && css.AndroidMediaImg)}
            alt=""
            src={displayUrl}
            referrerPolicy={noReferrer ? 'no-referrer' : undefined}
            onLoad={handleLoad}
            onError={handleError}
          />
        )
      ) : (
        <Box className={css.CustomEmojiFallback}>
          <Icon src={Icons.Photo} />
        </Box>
      )}
    </Box>
  );
}

type StickerItemProps = {
  mx: MatrixClient;
  useAuthentication?: boolean;
  image: PackImageReader;
};

export function StickerItem({ mx, useAuthentication, image }: StickerItemProps) {
  const desktopSupported = isDesktopUpdaterSupported();
  const { androidApp, nearViewport, observe } = useAndroidMediaVisibility();
  const imageLoading = desktopSupported || androidApp ? 'eager' : 'lazy';
  const previewUrl = getRemoteStickerPreviewUrl(image);
  const noReferrer = isHttpUrl(previewUrl ?? image.url);
  const { primaryUrl, fallbackUrl } = getEmojiBoardMediaUrls({
    mx,
    mxc: previewUrl ?? image.url,
    useAuthentication,
    info: image.info,
    width: 256,
    height: 256,
    // Animated formats still select the original automatically. Static Android tiles use the
    // homeserver thumbnail to avoid decoding full-resolution files while scrolling.
    preferOriginal: !androidApp,
  });
  const { displayUrl, hasFailed, isLoaded, requestKey, handleLoad, handleError } =
    useStableMediaUrl(
      nearViewport ? primaryUrl : undefined,
      nearViewport ? fallbackUrl : undefined,
      {
        mimeType: image.info?.mimetype,
        fallbackMimeType: image.info?.mimetype,
      }
    );

  return (
    <Box
      as="button"
      ref={observe}
      data-android-media={androidApp || undefined}
      type="button"
      alignItems="Center"
      justifyContent="Center"
      className={css.StickerItem}
      title={image.body || image.shortcode}
      aria-label={`${image.body || image.shortcode} emoji`}
      data-emoji-type={EmojiType.Sticker}
      data-emoji-data={image.url}
      data-emoji-shortcode={image.body || image.shortcode}
      data-emoji-preview-url={previewUrl}
      data-emoji-info={image.info ? JSON.stringify(image.info) : undefined}
    >
      {displayUrl && !hasFailed ? (
        desktopSupported ? (
          <Box className={css.MediaFrame}>
            <img
              key={requestKey}
              loading={imageLoading}
              decoding="async"
              className={classNames(css.StickerImg, !isLoaded && css.MediaImgPending)}
              alt=""
              src={displayUrl}
              referrerPolicy={noReferrer ? 'no-referrer' : undefined}
              draggable={false}
              onLoad={handleLoad}
              onError={handleError}
            />
            <Box className={classNames(css.StickerFallback, isLoaded && css.MediaFallbackHidden)}>
              <Icon src={Icons.Photo} />
            </Box>
          </Box>
        ) : (
          <img
            key={requestKey}
            loading={imageLoading}
            decoding="async"
            className={classNames(css.StickerImg, androidApp && css.AndroidMediaImg)}
            alt=""
            src={displayUrl}
            referrerPolicy={noReferrer ? 'no-referrer' : undefined}
            onLoad={handleLoad}
            onError={handleError}
          />
        )
      ) : (
        <Box className={css.StickerFallback}>
          <Icon src={Icons.Photo} />
        </Box>
      )}
    </Box>
  );
}
