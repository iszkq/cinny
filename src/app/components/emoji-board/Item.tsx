import React from 'react';
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
import { isDesktopUpdaterSupported } from '../../utils/desktopUpdater';

export const getEmojiItemInfo = (element: Element): EmojiItemInfo | undefined => {
  const label = element.getAttribute('title');
  const type = element.getAttribute('data-emoji-type') as EmojiType | undefined;
  const data = element.getAttribute('data-emoji-data');
  const shortcode = element.getAttribute('data-emoji-shortcode');
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
  const { primaryUrl, fallbackUrl } = getEmojiBoardMediaUrls({
    mx,
    mxc: image.url,
    useAuthentication,
    info: image.info,
    width: 64,
    height: 64,
  });
  const { displayUrl, hasFailed, isLoaded, requestKey, handleLoad, handleError } =
    useStableMediaUrl(primaryUrl, fallbackUrl, {
      mimeType: image.info?.mimetype,
      fallbackMimeType: image.info?.mimetype,
    });

  return (
    <Box
      as="button"
      type="button"
      alignItems="Center"
      justifyContent="Center"
      className={css.EmojiItem}
      title={image.body || image.shortcode}
      aria-label={`${image.body || image.shortcode} emoji`}
      data-emoji-type={EmojiType.CustomEmoji}
      data-emoji-data={image.url}
      data-emoji-shortcode={image.shortcode}
      data-emoji-info={image.info ? JSON.stringify(image.info) : undefined}
    >
      {displayUrl && !hasFailed ? (
        desktopSupported ? (
          <Box className={css.MediaFrame}>
            <img
              key={requestKey}
              loading="eager"
              decoding="async"
              className={classNames(css.CustomEmojiImg, !isLoaded && css.MediaImgPending)}
              alt=""
              src={displayUrl}
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
            loading="eager"
            decoding="async"
            className={css.CustomEmojiImg}
            alt=""
            src={displayUrl}
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
  const { primaryUrl, fallbackUrl } = getEmojiBoardMediaUrls({
    mx,
    mxc: image.url,
    useAuthentication,
    info: image.info,
    width: 256,
    height: 256,
  });
  const { displayUrl, hasFailed, isLoaded, requestKey, handleLoad, handleError } =
    useStableMediaUrl(primaryUrl, fallbackUrl, {
      mimeType: image.info?.mimetype,
      fallbackMimeType: image.info?.mimetype,
    });

  return (
    <Box
      as="button"
      type="button"
      alignItems="Center"
      justifyContent="Center"
      className={css.StickerItem}
      title={image.body || image.shortcode}
      aria-label={`${image.body || image.shortcode} emoji`}
      data-emoji-type={EmojiType.Sticker}
      data-emoji-data={image.url}
      data-emoji-shortcode={image.shortcode}
      data-emoji-info={image.info ? JSON.stringify(image.info) : undefined}
    >
      {displayUrl && !hasFailed ? (
        desktopSupported ? (
          <Box className={css.MediaFrame}>
            <img
              key={requestKey}
              loading="eager"
              decoding="async"
              className={classNames(css.StickerImg, !isLoaded && css.MediaImgPending)}
              alt=""
              src={displayUrl}
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
            loading="eager"
            decoding="async"
            className={css.StickerImg}
            alt=""
            src={displayUrl}
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
