import { useCallback, useEffect, useState } from 'react';

export type MediaSeekData = {
  seeking: boolean;
  seekable?: TimeRanges;
};
export type MediaSeekControl = {
  seek: (time: number) => void;
};

export const useMediaSeek = (
  getTargetElement: () => HTMLMediaElement | null
): MediaSeekData & MediaSeekControl => {
  const [seekData, setSeekData] = useState<MediaSeekData>({
    seeking: false,
    seekable: undefined,
  });

  const seek = useCallback(
    (time: number) => {
      const targetEl = getTargetElement();
      if (!targetEl || !Number.isFinite(time)) return;

      const duration = targetEl.duration;
      const boundedTime = Number.isFinite(duration)
        ? Math.max(0, Math.min(time, duration))
        : Math.max(0, time);
      if (!Number.isFinite(boundedTime)) return;
      try {
        targetEl.currentTime = boundedTime;
      } catch {
        // Media can change source while a range gesture is in progress.
      }
    },
    [getTargetElement]
  );

  useEffect(() => {
    const targetEl = getTargetElement();
    const handleChange = () => {
      if (!targetEl) return;
      setSeekData({
        seeking: targetEl.seeking,
        seekable: targetEl.seekable,
      });
    };
    targetEl?.addEventListener('loadedmetadata', handleChange);
    targetEl?.addEventListener('seeked', handleChange);
    targetEl?.addEventListener('seeking', handleChange);
    return () => {
      targetEl?.removeEventListener('loadedmetadata', handleChange);
      targetEl?.removeEventListener('seeked', handleChange);
      targetEl?.removeEventListener('seeking', handleChange);
    };
  }, [getTargetElement]);

  return {
    ...seekData,
    seek,
  };
};
