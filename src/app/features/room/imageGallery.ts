import { IContent, MsgType } from 'matrix-js-sdk';

export const IMAGE_GALLERY_PROPERTY = 'io.github.iszkq.starfire.gallery';

export type ImageGalleryInfo = {
  id: string;
  index: number;
  count: number;
};

export const getImageGalleryInfo = (content: IContent): ImageGalleryInfo | undefined => {
  if (content.msgtype !== MsgType.Image) return undefined;

  const gallery = content[IMAGE_GALLERY_PROPERTY];
  if (!gallery || typeof gallery !== 'object') return undefined;

  const { id, index, count } = gallery as Partial<ImageGalleryInfo>;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof index !== 'number' ||
    !Number.isInteger(index) ||
    index < 0 ||
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 2 ||
    index >= count
  ) {
    return undefined;
  }

  return { id, index, count };
};

export const setImageGalleryInfo = (content: IContent, info: ImageGalleryInfo): IContent => ({
  ...content,
  [IMAGE_GALLERY_PROPERTY]: info,
});
