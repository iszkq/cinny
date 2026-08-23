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
      onPlayTimeCallback(targetEl.duration, targetEl.currentTime);
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
