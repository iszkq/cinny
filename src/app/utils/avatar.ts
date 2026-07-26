import { applyPalette, GIFEncoder, GifPalette, quantize } from 'gifenc';
import { decompressFrames, parseGIF, ParsedFrame } from 'gifuct-js';
import { bytesToSize } from './common';

export const AVATAR_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const AVATAR_FRAME_MAX_FILE_SIZE = 2 * 1024 * 1024;

const STATIC_AVATAR_SIZE = 512;
const ANIMATED_AVATAR_SIZE = 256;
const MAX_GIF_FRAMES = 240;
const MAX_DECODED_GIF_PIXELS = 80_000_000;

const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const FRAME_MIME_TYPES = new Set(['image/png', 'image/webp']);

export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
export const AVATAR_FRAME_ACCEPT = 'image/png,image/webp';

export const validateAvatarFile = (file: File): string | undefined => {
  if (!AVATAR_MIME_TYPES.has(file.type.toLowerCase())) {
    return '头像格式不支持。请选择 JPG、PNG、GIF 或 WebP 图片。';
  }
  if (file.size > AVATAR_MAX_FILE_SIZE) {
    return `头像太大。最大允许 ${bytesToSize(AVATAR_MAX_FILE_SIZE)}，当前文件为 ${bytesToSize(
      file.size
    )}。`;
  }
  return undefined;
};

export const validateAvatarFrameFile = (file: File): string | undefined => {
  if (!FRAME_MIME_TYPES.has(file.type.toLowerCase())) {
    return '头像框格式不支持。请选择带透明背景的 PNG 或 WebP 图片。';
  }
  if (file.size > AVATAR_FRAME_MAX_FILE_SIZE) {
    return `头像框太大。最大允许 ${bytesToSize(
      AVATAR_FRAME_MAX_FILE_SIZE
    )}，当前文件为 ${bytesToSize(file.size)}。`;
  }
  return undefined;
};

const loadImage = (file: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片无法读取，请确认文件没有损坏。'));
    };
    image.src = url;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, type: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('头像处理失败，请换一张图片后重试。'));
    }, type);
  });

const drawCover = (
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  size: number
) => {
  const scale = Math.max(size / sourceWidth, size / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  context.drawImage(source, (size - width) / 2, (size - height) / 2, width, height);
};

const withFrameName = (file: File, extension: string): string => {
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar';
  return `${baseName}-framed.${extension}`;
};

const ensureOutputSize = (blob: Blob) => {
  if (blob.size > AVATAR_MAX_FILE_SIZE) {
    throw new Error(
      `合成后的头像为 ${bytesToSize(blob.size)}，超过 ${bytesToSize(
        AVATAR_MAX_FILE_SIZE
      )} 上限。请使用更小或帧数更少的图片。`
    );
  }
};

const isAnimatedPng = (bytes: Uint8Array): boolean => {
  for (let index = 8; index + 8 <= bytes.length; ) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + index, 4).getUint32(0);
    const type = String.fromCharCode(...bytes.slice(index + 4, index + 8));
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    index += length + 12;
  }
  return false;
};

const isAnimatedWebP = (bytes: Uint8Array): boolean => {
  if (bytes.length < 16) return false;
  const header = String.fromCharCode(...bytes.slice(0, 16));
  if (!header.startsWith('RIFF') || !header.includes('WEBP')) return false;
  for (let index = 12; index + 8 <= bytes.length; ) {
    const type = String.fromCharCode(...bytes.slice(index, index + 4));
    const length = new DataView(bytes.buffer, bytes.byteOffset + index + 4, 4).getUint32(0, true);
    if (type === 'ANIM' || type === 'ANMF') return true;
    index += 8 + length + (length % 2);
  }
  return false;
};

const assertFrameCompositionSupported = async (avatar: File) => {
  if (avatar.type === 'image/png' || avatar.type === 'image/webp') {
    const bytes = new Uint8Array(await avatar.arrayBuffer());
    const animated = avatar.type === 'image/png' ? isAnimatedPng(bytes) : isAnimatedWebP(bytes);
    if (animated) {
      throw new Error('动态 PNG/WebP 可以直接作为头像，但目前只有 GIF 支持逐帧合成头像框。');
    }
  }
};

const composeStaticAvatar = async (avatar: File, frame: File): Promise<File> => {
  await assertFrameCompositionSupported(avatar);
  const [avatarImage, frameImage] = await Promise.all([loadImage(avatar), loadImage(frame)]);
  const canvas = document.createElement('canvas');
  canvas.width = STATIC_AVATAR_SIZE;
  canvas.height = STATIC_AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理头像图片。');

  context.clearRect(0, 0, STATIC_AVATAR_SIZE, STATIC_AVATAR_SIZE);
  drawCover(
    context,
    avatarImage,
    avatarImage.naturalWidth,
    avatarImage.naturalHeight,
    STATIC_AVATAR_SIZE
  );
  context.drawImage(frameImage, 0, 0, STATIC_AVATAR_SIZE, STATIC_AVATAR_SIZE);

  const blob = await canvasToBlob(canvas, 'image/png');
  ensureOutputSize(blob);
  return new File([blob], withFrameName(avatar, 'png'), { type: 'image/png' });
};

const getTransparentIndex = (palette: GifPalette): number =>
  palette.findIndex((color) => color.length > 3 && color[3] === 0);

const applyPreviousDisposal = (
  context: CanvasRenderingContext2D,
  previousFrame: ParsedFrame | undefined,
  restoreData: ImageData | undefined
) => {
  if (!previousFrame) return;
  if (previousFrame.disposalType === 2) {
    const { left, top, width, height } = previousFrame.dims;
    context.clearRect(left, top, width, height);
  } else if (previousFrame.disposalType === 3 && restoreData) {
    context.putImageData(restoreData, 0, 0);
  }
};

const composeGifAvatar = async (avatar: File, frame: File): Promise<File> => {
  const [avatarBuffer, frameImage] = await Promise.all([avatar.arrayBuffer(), loadImage(frame)]);
  const parsedGif = parseGIF(avatarBuffer);
  const frames = decompressFrames(parsedGif, true);
  const { width: sourceWidth, height: sourceHeight } = parsedGif.lsd;

  if (!frames.length) throw new Error('GIF 中没有可用的画面。');
  if (frames.length > MAX_GIF_FRAMES) {
    throw new Error(`GIF 帧数过多。最多支持 ${MAX_GIF_FRAMES} 帧，当前为 ${frames.length} 帧。`);
  }
  if (sourceWidth * sourceHeight * frames.length > MAX_DECODED_GIF_PIXELS) {
    throw new Error('GIF 解码后过大，请降低分辨率或帧数后重试。');
  }

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext('2d');
  const patchCanvas = document.createElement('canvas');
  const patchContext = patchCanvas.getContext('2d');
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = ANIMATED_AVATAR_SIZE;
  outputCanvas.height = ANIMATED_AVATAR_SIZE;
  const outputContext = outputCanvas.getContext('2d');
  if (!sourceContext || !patchContext || !outputContext) {
    throw new Error('当前浏览器无法处理动态头像。');
  }

  const encoder = GIFEncoder();
  let previousFrame: ParsedFrame | undefined;
  let restoreData: ImageData | undefined;

  frames.forEach((gifFrame) => {
    applyPreviousDisposal(sourceContext, previousFrame, restoreData);
    restoreData =
      gifFrame.disposalType === 3
        ? sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)
        : undefined;

    const { left, top, width, height } = gifFrame.dims;
    patchCanvas.width = width;
    patchCanvas.height = height;
    patchContext.putImageData(new ImageData(gifFrame.patch, width, height), 0, 0);
    sourceContext.drawImage(patchCanvas, left, top);

    outputContext.clearRect(0, 0, ANIMATED_AVATAR_SIZE, ANIMATED_AVATAR_SIZE);
    drawCover(outputContext, sourceCanvas, sourceWidth, sourceHeight, ANIMATED_AVATAR_SIZE);
    outputContext.drawImage(frameImage, 0, 0, ANIMATED_AVATAR_SIZE, ANIMATED_AVATAR_SIZE);

    const rgba = outputContext.getImageData(0, 0, ANIMATED_AVATAR_SIZE, ANIMATED_AVATAR_SIZE).data;
    const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
    const index = applyPalette(rgba, palette, 'rgba4444');
    const transparentIndex = getTransparentIndex(palette);
    encoder.writeFrame(index, ANIMATED_AVATAR_SIZE, ANIMATED_AVATAR_SIZE, {
      palette,
      delay: Math.max(20, gifFrame.delay),
      repeat: 0,
      dispose: 1,
      transparent: transparentIndex >= 0,
      transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
    });

    previousFrame = gifFrame;
  });

  encoder.finish();
  const blob = new Blob([encoder.bytes()], { type: 'image/gif' });
  ensureOutputSize(blob);
  return new File([blob], withFrameName(avatar, 'gif'), { type: 'image/gif' });
};

export const composeAvatarWithFrame = async (avatar: File, frame: File): Promise<File> => {
  const avatarError = validateAvatarFile(avatar);
  if (avatarError) throw new Error(avatarError);
  const frameError = validateAvatarFrameFile(frame);
  if (frameError) throw new Error(frameError);

  return avatar.type.toLowerCase() === 'image/gif'
    ? composeGifAvatar(avatar, frame)
    : composeStaticAvatar(avatar, frame);
};
