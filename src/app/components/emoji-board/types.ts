import { IImageInfo } from '../../../types/matrix/common';

export enum EmojiBoardTab {
  Emoji = 'Emoji',
  Sticker = 'Sticker',
  Cloud = 'Cloud',
}

export enum EmojiType {
  Emoji = 'emoji',
  CustomEmoji = 'customEmoji',
  Sticker = 'sticker',
}

export type EmojiItemInfo = {
  type: EmojiType;
  data: string;
  shortcode: string;
  label: string;
  previewUrl?: string;
  info?: IImageInfo;
};
