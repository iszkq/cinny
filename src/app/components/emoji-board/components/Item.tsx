import React from 'react';
import { Box } from 'folds';
import { MatrixClient } from 'matrix-js-sdk';
import { IImageInfo } from '../../../../types/matrix/common';
import { EmojiItemInfo, EmojiType } from '../types';
import * as css from './styles.css';
import { PackImageReader } from '../../../plugins/custom-emoji';
import { IEmoji } from '../../../plugins/emoji';
import { mxcUrlToHttp } from '../../../utils/matrix';
import { useCachedMediaUrl } from '../../../hooks/useCachedMediaUrl';

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
  const mediaUrl = mxcUrlToHttp(mx, image.url, useAuthentication) ?? '';
  const cachedMediaUrl = useCachedMediaUrl(mediaUrl);
  const displayUrl = cachedMediaUrl ?? mediaUrl;

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
    >
      <img
        loading="eager"
        decoding="async"
        className={css.CustomEmojiImg}
        alt=""
        src={displayUrl}
      />
    </Box>
  );
}

type StickerItemProps = {
  mx: MatrixClient;
  useAuthentication?: boolean;
  image: PackImageReader;
};

export function StickerItem({ mx, useAuthentication, image }: StickerItemProps) {
  const mediaUrl = mxcUrlToHttp(mx, image.url, useAuthentication) ?? '';
  const cachedMediaUrl = useCachedMediaUrl(mediaUrl);
  const displayUrl = cachedMediaUrl ?? mediaUrl;

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
      <img
        loading="eager"
        decoding="async"
        className={css.StickerImg}
        alt=""
        src={displayUrl}
      />
    </Box>
  );
}
