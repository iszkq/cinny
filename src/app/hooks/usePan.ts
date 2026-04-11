import { MouseEventHandler, useCallback, useEffect, useState } from 'react';

export type Pan = {
  translateX: number;
  translateY: number;
};

const INITIAL_PAN = {
  translateX: 0,
  translateY: 0,
};

export const usePan = (active: boolean, resetKey?: string) => {
  const [pan, setPan] = useState<Pan>(INITIAL_PAN);
  const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'initial'>(
    active ? 'grab' : 'initial'
  );

  const handleMouseMove = useCallback((evt: MouseEvent) => {
    evt.preventDefault();
    evt.stopPropagation();

    setPan((p) => {
      const { translateX, translateY } = p;
      const mX = translateX + evt.movementX;
      const mY = translateY + evt.movementY;

      return { translateX: mX, translateY: mY };
    });
  }, []);

  const handleMouseUp = useCallback(
    (evt: MouseEvent) => {
      evt.preventDefault();
      setCursor(active ? 'grab' : 'initial');

      document.removeEventListener('mousemove', handleMouseMove);
    },
    [active, handleMouseMove]
  );

  const handleMouseDown = useCallback<MouseEventHandler<HTMLElement>>(
    (evt) => {
      if (!active) return;
      evt.preventDefault();
      setCursor('grabbing');

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp, { once: true });
    },
    [active, handleMouseMove, handleMouseUp]
  );

  useEffect(() => {
    setCursor(active ? 'grab' : 'initial');
    if (!active) {
      setPan(INITIAL_PAN);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [active, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    setPan(INITIAL_PAN);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    if (active) {
      setCursor('grab');
    }
  }, [active, handleMouseMove, handleMouseUp, resetKey]);

  useEffect(
    () => () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    },
    [handleMouseMove, handleMouseUp]
  );

  return {
    pan,
    cursor,
    onMouseDown: handleMouseDown,
  };
};
