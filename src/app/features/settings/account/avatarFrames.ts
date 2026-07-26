import MoonlightFrame from './avatar-frames/moonlight.svg';
import StarlightFrame from './avatar-frames/starlight.svg';
import AuroraFrame from './avatar-frames/aurora.svg';
import SakuraFrame from './avatar-frames/sakura.svg';
import OceanFrame from './avatar-frames/ocean.svg';
import ForestFrame from './avatar-frames/forest.svg';
import NeonFrame from './avatar-frames/neon.svg';
import CandyFrame from './avatar-frames/candy.svg';
import CloudFrame from './avatar-frames/cloud.svg';
import CrownFrame from './avatar-frames/crown.svg';

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
  { id: 'ocean', name: '海洋', url: OceanFrame },
  { id: 'forest', name: '森林', url: ForestFrame },
  { id: 'neon', name: '霓虹', url: NeonFrame },
  { id: 'candy', name: '糖果', url: CandyFrame },
  { id: 'cloud', name: '云朵', url: CloudFrame },
  { id: 'crown', name: '皇冠', url: CrownFrame },
];

export const loadDefaultAvatarFrame = async (frame: DefaultAvatarFrame): Promise<File> => {
  const response = await fetch(frame.url);
  if (!response.ok) throw new Error('默认头像框加载失败，请重试。');

  const blob = await response.blob();
  return new File([blob], `${frame.id}.svg`, { type: 'image/svg+xml' });
};
