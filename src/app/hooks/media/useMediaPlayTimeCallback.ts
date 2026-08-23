import { useEffect } from 'react';

export type PlayTimeCallback = (duration: number, currentTime: number) => void;

export const useMediaPlayTimeCallback = (
  getTargetElement: () => HTMLMediaElement | null,
  onPlayTimeCallback: PlayTimeCallback
): void => {
  useEffect(() => {
    const targetEl = getTargetElement();
    const handleChange = () => {
      if (!targetEl) return;
      let duration = targetEl.duration;
      // WebM files can briefly expose an infinite/zero duration while the
      // container is being indexed. A finite seekable end is a safe fallback.
      if ((!Number.isFinite(duration) || duration <= 0) && targetEl.seekable.length > 0) {
        const seekableEnd = targetEl.seekable.end(targetEl.seekable.length - 1);
        if (Number.isFinite(seekableEnd) && seekableEnd > 0) duration = seekableEnd;
      }
      onPlayTimeCallback(duration, targetEl.currentTime);
    };
    targetEl?.addEventListener('timeupdate', handleChange);
    targetEl?.addEventListener('loadedmetadata', handleChange);
    targetEl?.addEventListener('durationchange', handleChange);
    targetEl?.addEventListener('loadeddata', handleChange);
    targetEl?.addEventListener('canplay', handleChange);
    targetEl?.addEventListener('ended', handleChange);
    return () => {
      targetEl?.removeEventListener('timeupdate', handleChange);
      targetEl?.removeEventListener('loadedmetadata', handleChange);
      targetEl?.removeEventListener('durationchange', handleChange);
      targetEl?.removeEventListener('loadeddata', handleChange);
      targetEl?.removeEventListener('canplay', handleChange);
      targetEl?.removeEventListener('ended', handleChange);
    };
  }, [getTargetElement, onPlayTimeCallback]);
};
