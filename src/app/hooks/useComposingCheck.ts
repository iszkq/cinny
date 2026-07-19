import { useCallback, useEffect } from 'react';

let lastCompositionEnd: number | undefined;

interface TimeStamped {
  readonly timeStamp: number;
}

export function useCompositionEndTracking(): void {
  useEffect(() => {
    const recordCompositionEnd = (evt: TimeStamped) => {
      lastCompositionEnd = evt.timeStamp;
    };

    window.addEventListener('compositionend', recordCompositionEnd, { capture: true });
    return () => {
      window.removeEventListener('compositionend', recordCompositionEnd, { capture: true });
    };
  }, []);
}

interface IsComposingLike {
  readonly timeStamp: number;
  readonly keyCode: number;
  readonly nativeEvent: {
    readonly isComposing?: boolean;
  };
}

export function useComposingCheck({
  compositionEndThreshold = 500,
}: { compositionEndThreshold?: number } = {}): (evt: IsComposingLike) => boolean {
  return useCallback(
    (evt: IsComposingLike): boolean =>
      evt.nativeEvent.isComposing ||
      (evt.keyCode === 229 &&
        typeof lastCompositionEnd !== 'undefined' &&
        evt.timeStamp - lastCompositionEnd < compositionEndThreshold),
    [compositionEndThreshold]
  );
}
