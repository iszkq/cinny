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
import HolySpiritLoveFrame from './avatar-frames/holy-spirit-love.png';
import HolySpiritJoyFrame from './avatar-frames/holy-spirit-joy.png';
import HolySpiritPeaceFrame from './avatar-frames/holy-spirit-peace.png';
import HolySpiritPatienceFrame from './avatar-frames/holy-spirit-patience.png';
import HolySpiritKindnessFrame from './avatar-frames/holy-spirit-kindness.png';
import HolySpiritGoodnessFrame from './avatar-frames/holy-spirit-goodness.png';
import HolySpiritFaithfulnessFrame from './avatar-frames/holy-spirit-faithfulness.png';
import HolySpiritGentlenessFrame from './avatar-frames/holy-spirit-gentleness.png';
import HolySpiritSelfControlFrame from './avatar-frames/holy-spirit-self-control.png';

export type DefaultAvatarFrame = {
  id: string;
  name: string;
  url: string;
  avatarContentRatio?: number;
};

export const DEFAULT_AVATAR_FRAMES: DefaultAvatarFrame[] = [
  {
    id: 'holy-spirit-love',
    name: '仁爱',
    url: HolySpiritLoveFrame,
    avatarContentRatio: 0.82,
  },
  {
    id: 'holy-spirit-joy',
    name: '喜乐',
    url: HolySpiritJoyFrame,
    avatarContentRatio: 0.82,
  },
  {
    id: 'holy-spirit-peace',
    name: '和平',
    url: HolySpiritPeaceFrame,
    avatarContentRatio: 0.82,
  },
  {
    id: 'holy-spirit-patience',
    name: '忍耐',
    url: HolySpiritPatienceFrame,
    avatarContentRatio: 0.82,
  },
  {
    id: 'holy-spirit-kindness',
    name: '恩慈',
    url: HolySpiritKindnessFrame,
    avatarContentRatio: 0.82,
  },
  {
    id: 'holy-spirit-goodness',
    name: '良善',
    url: HolySpiritGoodnessFrame,
    avatarContentRatio: 0.82,
  },
  {
    id: 'holy-spirit-faithfulness',
    name: '信实',
    url: HolySpiritFaithfulnessFrame,
    avatarContentRatio: 0.82,
  },
  {
    id: 'holy-spirit-gentleness',
    name: '温柔',
    url: HolySpiritGentlenessFrame,
    avatarContentRatio: 0.82,
  },
  {
    id: 'holy-spirit-self-control',
    name: '节制',
    url: HolySpiritSelfControlFrame,
    avatarContentRatio: 0.82,
  },
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
  let extension = 'svg';
  if (blob.type === 'image/png') extension = 'png';
  if (blob.type === 'image/webp') extension = 'webp';
  return new File([blob], `${frame.id}.${extension}`, { type: blob.type || 'image/svg+xml' });
};
