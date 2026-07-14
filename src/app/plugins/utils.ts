import { SearchItemStrGetter } from '../hooks/useAsyncSearch';
import { PackImageReader } from './custom-emoji';
import { IEmoji } from './emoji';

export const getEmoticonSearchStr: SearchItemStrGetter<PackImageReader | IEmoji> = (item) => {
  const shortcode = `:${item.shortcode}:`;
  if (item instanceof PackImageReader) {
    const content = item.content as {
      'in.cinny.remote_sticker_keywords'?: string[];
      'in.cinny.alapi_doutu_keywords'?: string[];
    };
    const remoteKeywords = content['in.cinny.remote_sticker_keywords'];
    const alapiKeywords = content['in.cinny.alapi_doutu_keywords'];
    const names = [shortcode];
    if (item.body) {
      names.push(item.body);
    }
    if (Array.isArray(remoteKeywords)) {
      names.push(...remoteKeywords);
    }
    if (Array.isArray(alapiKeywords)) names.push(...alapiKeywords);
    return names;
  }

  const names = [shortcode, item.label];
  if (Array.isArray(item.shortcodes)) {
    return names.concat(item.shortcodes);
  }
  return names;
};
