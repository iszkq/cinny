import MoonlightFrame from './avatar-frames/moonlight.svg';
import StarlightFrame from './avatar-frames/starlight.svg';
import AuroraFrame from './avatar-frames/aurora.svg';
import SakuraFrame from './avatar-frames/sakura.svg';

export type DefaultAvatarFrame = {
  id: string;
  name: string;
  url: string;
};

export const DEFAULT_AVATAR_FRAMES: DefaultAvatarFrame[] = [
  { id: 'moonlight', name: '月辉', url: MoonlightFrame },
  { id: 'starlight', name: '星火', url: StarlightFrame },
  { id: 'aurora', name: '极光', url: AuroraFrame },
  { id: 'sakura', name: '樱花', url: SakuraFrame },
];

export const loadDefaultAvatarFrame = async (frame: DefaultAvatarFrame): Promise<File> => {
  const response = await fetch(frame.url);
  if (!response.ok) throw new Error('默认头像框加载失败，请重试。');

  const blob = await response.blob();
  return new File([blob], `${frame.id}.svg`, { type: 'image/svg+xml' });
};
