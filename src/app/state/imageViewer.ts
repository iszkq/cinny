import { ReactNode } from 'react';
import { atom } from 'jotai';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { IImageInfo, IThumbnailContent } from '../../types/matrix/common';
import type { ImageViewerProps } from '../components/image-viewer';
import type { AihubmixImageOcrConfig } from '../utils/ai';

export type ViewerImageItem = {
  id: string;
  body: string;
  mimeType?: string;
  url: string;
  info?: IImageInfo & IThumbnailContent;
  encInfo?: EncryptedAttachmentInfo;
};

export type ImageViewerSession = {
  activeItemId: string;
  items: ViewerImageItem[];
  initialSrc?: string;
  resolveSource: (item: ViewerImageItem) => Promise<string>;
  imageOcrConfig?: AihubmixImageOcrConfig;
  renderViewer: (props: ImageViewerProps) => ReactNode;
};

export const imageViewerSessionAtom = atom<ImageViewerSession | undefined>(undefined);
