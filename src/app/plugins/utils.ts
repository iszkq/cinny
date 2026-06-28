import { SearchItemStrGetter } from '../hooks/useAsyncSearch';
import { PackImageReader } from './custom-emoji';
import { IEmoji } from './emoji';

export const getEmoticonSearchStr: SearchItemStrGetter<PackImageReader | IEmoji> = (item) => {
  const shortcode = `:${item.shortcode}:`;
  if (item instanceof PackImageReader) {
    const content = item.content as { 'in.cinny.remote_sticker_keywords'?: string[] };
    const remoteKeywords = content['in.cinny.remote_sticker_keywords'];
    const names = [shortcode];
    if (item.body) {
      names.push(item.body);
    }
    if (Array.isArray(remoteKeywords)) {
      return names.concat(remoteKeywords);
    }
    return names;
  }

  const names = [shortcode, item.label];
  if (Array.isArray(item.shortcodes)) {
    return names.concat(item.shortcodes);
  }
  return names;
};
