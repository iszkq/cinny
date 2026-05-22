import { useCachedMediaUrl } from './useCachedMediaUrl';
import { shouldUseObjectUrlForMediaDisplay } from '../utils/matrix';

export const useDisplayMediaUrl = (src: string | undefined): string | undefined => {
  const cachedMediaUrl = useCachedMediaUrl(src);

  if (cachedMediaUrl) {
    return cachedMediaUrl;
  }

  return shouldUseObjectUrlForMediaDisplay(src) ? undefined : src;
};
