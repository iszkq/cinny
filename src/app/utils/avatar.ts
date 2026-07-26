import { applyPalette, GIFEncoder, GifPalette, quantize } from 'gifenc';
import { decompressFrames, parseGIF, ParsedFrame } from 'gifuct-js';
import { bytesToSize } from './common';

export const AVATAR_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const AVATAR_FRAME_MAX_FILE_SIZE = 2 * 1024 * 1024;
export const AVATAR_FRAME_MIN_DIMENSION = 128;
export const AVATAR_FRAME_MAX_DIMENSION = 2048;
export const AVATAR_FRAME_RECOMMENDED_DIMENSION = 512;

const STATIC_AVATAR_SIZE = 512;
const ANIMATED_AVATAR_SIZE = 256;
const AVATAR_CONTENT_RATIO = 0.74;
const LEGACY_AVATAR_RECOVERY_RATIO = 0.75;
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
      reject(new Error(`图片（${file.type || '未知格式'}）无法读取，请确认文件没有损坏。`));
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
  targetX: number,
  targetY: number,
  targetSize: number
) => {
  const scale = Math.max(targetSize / sourceWidth, targetSize / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  context.drawImage(
    source,
    targetX + (targetSize - width) / 2,
    targetY + (targetSize - height) / 2,
    width,
    height
  );
};

const drawAvatarInsideFrame = (
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  size: number
) => {
  const avatarSize = size * AVATAR_CONTENT_RATIO;
  const avatarOffset = (size - avatarSize) / 2;

  context.save();
  context.beginPath();
  context.arc(size / 2, size / 2, avatarSize / 2, 0, Math.PI * 2);
  context.clip();
  drawCover(context, source, sourceWidth, sourceHeight, avatarOffset, avatarOffset, avatarSize);
  context.restore();
};

const withFrameName = (file: File, extension: string): string => {
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar';
  return `${baseName}-framed.${extension}`;
};

const withoutFrameName = (file: File, extension: string): string => {
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar';
  return `${baseName}-unframed.${extension}`;
};

const drawRecoveredLegacyAvatar = (
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  outputSize: number
) => {
  const cropSize = Math.min(sourceWidth, sourceHeight) * LEGACY_AVATAR_RECOVERY_RATIO;
  const sourceX = (sourceWidth - cropSize) / 2;
  const sourceY = (sourceHeight - cropSize) / 2;
  context.drawImage(source, sourceX, sourceY, cropSize, cropSize, 0, 0, outputSize, outputSize);
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

export const validateAvatarFrameImage = async (file: File): Promise<string | undefined> => {
  const fileError = validateAvatarFrameFile(file);
  if (fileError) return fileError;

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (
    (file.type === 'image/png' && isAnimatedPng(bytes)) ||
    (file.type === 'image/webp' && isAnimatedWebP(bytes))
  ) {
    return '头像框暂不支持动画。请上传静态 PNG 或静态 WebP 图片。';
  }

  const image = await loadImage(file);
  const { naturalWidth: width, naturalHeight: height } = image;
  if (width !== height) {
    return `头像框必须是正方形。当前尺寸为 ${width} × ${height}。`;
  }
  if (width < AVATAR_FRAME_MIN_DIMENSION || width > AVATAR_FRAME_MAX_DIMENSION) {
    return `头像框边长须为 ${AVATAR_FRAME_MIN_DIMENSION}–${AVATAR_FRAME_MAX_DIMENSION} 像素，建议使用 ${AVATAR_FRAME_RECOMMENDED_DIMENSION} × ${AVATAR_FRAME_RECOMMENDED_DIMENSION}。`;
  }

  const sampleSize = 32;
  const canvas = document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '当前浏览器无法检查头像框图片，请换一个浏览器后重试。';

  context.drawImage(image, 0, 0, sampleSize, sampleSize);
  const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
  let centerPixels = 0;
  let transparentCenterPixels = 0;
  const center = sampleSize / 2;
  const centerRadius = (sampleSize * AVATAR_CONTENT_RATIO) / 2;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      if (Math.hypot(x + 0.5 - center, y + 0.5 - center) <= centerRadius) {
        centerPixels += 1;
        if (pixels[(y * sampleSize + x) * 4 + 3] < 32) transparentCenterPixels += 1;
      }
    }
  }

  if (transparentCenterPixels / centerPixels < 0.95) {
    return '头像框中央必须保持透明，装饰请放在外圈，避免遮住头像。';
  }

  return undefined;
};

const composeStaticAvatar = async (avatar: File, frame: File): Promise<File> => {
  const [avatarImage, frameImage] = await Promise.all([loadImage(avatar), loadImage(frame)]);
  const canvas = document.createElement('canvas');
  canvas.width = STATIC_AVATAR_SIZE;
  canvas.height = STATIC_AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理头像图片。');

  context.clearRect(0, 0, STATIC_AVATAR_SIZE, STATIC_AVATAR_SIZE);
  drawAvatarInsideFrame(
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

const writeGifFrame = (
  encoder: ReturnType<typeof GIFEncoder>,
  context: CanvasRenderingContext2D,
  delay: number
) => {
  const rgba = context.getImageData(0, 0, ANIMATED_AVATAR_SIZE, ANIMATED_AVATAR_SIZE).data;
  const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
  const index = applyPalette(rgba, palette, 'rgba4444');
  const transparentIndex = getTransparentIndex(palette);
  encoder.writeFrame(index, ANIMATED_AVATAR_SIZE, ANIMATED_AVATAR_SIZE, {
    palette,
    delay: Math.max(20, delay),
    repeat: 0,
    dispose: 1,
    transparent: transparentIndex >= 0,
    transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
  });
};

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
    drawAvatarInsideFrame(
      outputContext,
      sourceCanvas,
      sourceWidth,
      sourceHeight,
      ANIMATED_AVATAR_SIZE
    );
    outputContext.drawImage(frameImage, 0, 0, ANIMATED_AVATAR_SIZE, ANIMATED_AVATAR_SIZE);
    writeGifFrame(encoder, outputContext, gifFrame.delay);

    previousFrame = gifFrame;
  });

  encoder.finish();
  const blob = new Blob([encoder.bytes()], { type: 'image/gif' });
  ensureOutputSize(blob);
  return new File([blob], withFrameName(avatar, 'gif'), { type: 'image/gif' });
};

const extractGifAvatarFromLegacyFrame = async (avatar: File): Promise<File> => {
  const avatarBuffer = await avatar.arrayBuffer();
  const parsedGif = parseGIF(avatarBuffer);
  const frames = decompressFrames(parsedGif, true);
  const { width: sourceWidth, height: sourceHeight } = parsedGif.lsd;

  if (!frames.length) throw new Error('GIF 中没有可用的画面。');
  if (frames.length > MAX_GIF_FRAMES) {
    throw new Error(`GIF 帧数过多。最多支持 ${MAX_GIF_FRAMES} 帧，当前为 ${frames.length} 帧。`);
  }
  if (sourceWidth * sourceHeight * frames.length > MAX_DECODED_GIF_PIXELS) {
    throw new Error('GIF 解码后过大，无法自动分离旧头像框。');
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
    throw new Error('当前浏览器无法分离动态头像框。');
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
    drawRecoveredLegacyAvatar(
      outputContext,
      sourceCanvas,
      sourceWidth,
      sourceHeight,
      ANIMATED_AVATAR_SIZE
    );
    writeGifFrame(encoder, outputContext, gifFrame.delay);
    previousFrame = gifFrame;
  });

  encoder.finish();
  const blob = new Blob([encoder.bytes()], { type: 'image/gif' });
  ensureOutputSize(blob);
  return new File([blob], withoutFrameName(avatar, 'gif'), { type: 'image/gif' });
};

export const extractAvatarFromLegacyFrame = async (avatar: File): Promise<File> => {
  const avatarError = validateAvatarFile(avatar);
  if (avatarError) throw new Error(avatarError);
  if (avatar.type.toLowerCase() === 'image/gif') {
    return extractGifAvatarFromLegacyFrame(avatar);
  }

  const image = await loadImage(avatar);
  const canvas = document.createElement('canvas');
  canvas.width = STATIC_AVATAR_SIZE;
  canvas.height = STATIC_AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法分离旧头像框。');

  context.clearRect(0, 0, STATIC_AVATAR_SIZE, STATIC_AVATAR_SIZE);
  drawRecoveredLegacyAvatar(
    context,
    image,
    image.naturalWidth,
    image.naturalHeight,
    STATIC_AVATAR_SIZE
  );
  const blob = await canvasToBlob(canvas, 'image/png');
  ensureOutputSize(blob);
  return new File([blob], withoutFrameName(avatar, 'png'), { type: 'image/png' });
};

type DecodedAvatarFrame = CanvasImageSource & {
  displayWidth: number;
  displayHeight: number;
  duration: number | null;
  close: () => void;
};

type AvatarImageDecoder = {
  tracks: {
    ready: Promise<void>;
    selectedTrack: {
      frameCount: number;
    } | null;
  };
  decode: (options: { frameIndex: number }) => Promise<{ image: DecodedAvatarFrame }>;
  close: () => void;
};

type AvatarImageDecoderConstructor = {
  new (init: { data: BufferSource; type: string; preferAnimation: boolean }): AvatarImageDecoder;
  isTypeSupported?: (type: string) => Promise<boolean>;
};

const composeDecodedAnimatedAvatar = async (avatar: File, frame: File): Promise<File> => {
  const ImageDecoderConstructor = (
    window as typeof window & { ImageDecoder?: AvatarImageDecoderConstructor }
  ).ImageDecoder;
  if (!ImageDecoderConstructor) {
    throw new Error(
      '当前浏览器无法为动态 WebP/APNG 合成头像框，请使用最新版 Chrome、Edge 或桌面客户端。'
    );
  }
  if (
    ImageDecoderConstructor.isTypeSupported &&
    !(await ImageDecoderConstructor.isTypeSupported(avatar.type))
  ) {
    throw new Error('当前浏览器无法解码这种动态图片，请换用 GIF 或在桌面客户端中重试。');
  }

  const [avatarBuffer, frameImage] = await Promise.all([avatar.arrayBuffer(), loadImage(frame)]);
  const decoder = new ImageDecoderConstructor({
    data: avatarBuffer,
    type: avatar.type,
    preferAnimation: true,
  });

  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track || track.frameCount < 1) throw new Error('动态图片中没有可用的画面。');
    if (track.frameCount > MAX_GIF_FRAMES) {
      throw new Error(
        `动态图片帧数过多。最多支持 ${MAX_GIF_FRAMES} 帧，当前为 ${track.frameCount} 帧。`
      );
    }

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = ANIMATED_AVATAR_SIZE;
    outputCanvas.height = ANIMATED_AVATAR_SIZE;
    const outputContext = outputCanvas.getContext('2d');
    if (!outputContext) throw new Error('当前浏览器无法处理动态头像。');

    const encoder = GIFEncoder();
    let sourceWidth = 0;
    let sourceHeight = 0;

    for (let frameIndex = 0; frameIndex < track.frameCount; frameIndex += 1) {
      // ImageDecoder exposes each composed animation frame as a VideoFrame-like canvas source.
      // eslint-disable-next-line no-await-in-loop
      const { image } = await decoder.decode({ frameIndex });
      try {
        if (frameIndex === 0) {
          sourceWidth = image.displayWidth;
          sourceHeight = image.displayHeight;
          if (sourceWidth * sourceHeight * track.frameCount > MAX_DECODED_GIF_PIXELS) {
            throw new Error('动态图片解码后过大，请降低分辨率或帧数后重试。');
          }
        }

        outputContext.clearRect(0, 0, ANIMATED_AVATAR_SIZE, ANIMATED_AVATAR_SIZE);
        drawAvatarInsideFrame(
          outputContext,
          image,
          sourceWidth,
          sourceHeight,
          ANIMATED_AVATAR_SIZE
        );
        outputContext.drawImage(frameImage, 0, 0, ANIMATED_AVATAR_SIZE, ANIMATED_AVATAR_SIZE);
        writeGifFrame(encoder, outputContext, Math.round((image.duration ?? 100_000) / 1000));
      } finally {
        image.close();
      }
    }

    encoder.finish();
    const blob = new Blob([encoder.bytes()], { type: 'image/gif' });
    ensureOutputSize(blob);
    return new File([blob], withFrameName(avatar, 'gif'), { type: 'image/gif' });
  } finally {
    decoder.close();
  }
};

export const composeAvatarWithFrame = async (
  avatar: File,
  frame: File,
  trustedFrame = false
): Promise<File> => {
  const avatarError = validateAvatarFile(avatar);
  if (avatarError) throw new Error(avatarError);
  if (!trustedFrame) {
    const frameError = validateAvatarFrameFile(frame);
    if (frameError) throw new Error(frameError);
  }

  const avatarType = avatar.type.toLowerCase();
  if (avatarType === 'image/gif') return composeGifAvatar(avatar, frame);
  if (avatarType === 'image/png' || avatarType === 'image/webp') {
    const bytes = new Uint8Array(await avatar.arrayBuffer());
    const animated = avatarType === 'image/png' ? isAnimatedPng(bytes) : isAnimatedWebP(bytes);
    if (animated) return composeDecodedAnimatedAvatar(avatar, frame);
  }
  return composeStaticAvatar(avatar, frame);
};
