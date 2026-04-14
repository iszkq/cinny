import { MouseEventHandler, RefObject, useCallback, useEffect, useRef, useState } from 'react';

type DragState = {
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
};

export const useDragScroll = <T extends HTMLElement>(
  ref: RefObject<T>,
  active: boolean,
  resetKey?: string
) => {
  const dragStateRef = useRef<DragState | undefined>(undefined);
  const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'initial'>(
    active ? 'grab' : 'initial'
  );

  const handleMouseMove = useCallback(
    (evt: MouseEvent) => {
      const dragState = dragStateRef.current;
      const target = ref.current;
      if (!dragState || !target) return;

      evt.preventDefault();
      target.scrollLeft = dragState.scrollLeft - (evt.clientX - dragState.startX);
      target.scrollTop = dragState.scrollTop - (evt.clientY - dragState.startY);
    },
    [ref]
  );

  const clearDragging = useCallback(() => {
    dragStateRef.current = undefined;
    setCursor(active ? 'grab' : 'initial');
    document.removeEventListener('mousemove', handleMouseMove);
  }, [active, handleMouseMove]);

  const handleMouseUp = useCallback(() => {
    clearDragging();
  }, [clearDragging]);

  const onMouseDown = useCallback<MouseEventHandler<T>>(
    (evt) => {
      if (!active || evt.button !== 0) return;

      const target = ref.current;
      if (!target) return;

      evt.preventDefault();
      dragStateRef.current = {
        startX: evt.clientX,
        startY: evt.clientY,
        scrollLeft: target.scrollLeft,
        scrollTop: target.scrollTop,
      };
      setCursor('grabbing');

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp, { once: true });
    },
    [active, handleMouseMove, handleMouseUp, ref]
  );

  useEffect(() => {
    if (!active) {
      clearDragging();
    } else {
      setCursor('grab');
    }
  }, [active, clearDragging]);

  useEffect(() => {
    clearDragging();
  }, [clearDragging, resetKey]);

  useEffect(
    () => () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    },
    [handleMouseMove, handleMouseUp]
  );

  return {
    cursor,
    onMouseDown,
  };
};
