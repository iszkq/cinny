import React, { RefObject, useEffect, useRef, useState } from 'react';
import { resolveSpaceSheetExpanded } from './spaceSheetGesture';
export function useSpaceSheetDrag(open: boolean, backRef: RefObject<HTMLDivElement>) {
  const [expanded, setExpanded] = useState(false);
  const [dragTop, setDragTop] = useState<number>();
  const sheetGesture = useRef<{ id: number; y: number; top: number; delta: number }>();
  const suppressHandleClick = useRef(false);
  useEffect(() => {
    if (!open) {
      setExpanded(false);
      setDragTop(undefined);
      sheetGesture.current = undefined;
    }
  }, [open]);
  const sheetTop =
    dragTop === undefined
      ? expanded
        ? 'max(8px, var(--safe-area-top, env(safe-area-inset-top, 0px)))'
        : 'max(160px, 42vh)'
      : `clamp(max(8px, var(--safe-area-top, env(safe-area-inset-top, 0px))), ${dragTop}px, max(160px, 42vh))`;

  return {
    top: sheetTop,
    dragging: dragTop !== undefined,
    handle: (
      <button
        type="button"
        aria-label={expanded ? '收起空间面板' : '展开空间面板'}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          minHeight: 28,
          flexShrink: 0,
          border: 0,
          padding: 0,
          background: 'transparent',
          touchAction: 'none',
          cursor: 'ns-resize',
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.stopPropagation();
          suppressHandleClick.current = false;
          sheetGesture.current = {
            id: event.pointerId,
            y: event.clientY,
            top: backRef.current?.getBoundingClientRect().top ?? 0,
            delta: 0,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const gesture = sheetGesture.current;
          if (!gesture || gesture.id !== event.pointerId) return;
          gesture.delta = event.clientY - gesture.y;
          if (Math.abs(gesture.delta) > 8) suppressHandleClick.current = true;
          setDragTop(gesture.top + gesture.delta);
        }}
        onPointerUp={(event) => {
          const gesture = sheetGesture.current;
          if (!gesture || gesture.id !== event.pointerId) return;
          setExpanded((value) => resolveSpaceSheetExpanded(value, gesture.delta));
          sheetGesture.current = undefined;
          setDragTop(undefined);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          sheetGesture.current = undefined;
          setDragTop(undefined);
          suppressHandleClick.current = true;
        }}
        onClick={() => {
          if (suppressHandleClick.current) {
            suppressHandleClick.current = false;
            return;
          }
          setExpanded((value) => !value);
        }}
      >
        <span style={{ width: 36, height: 5, background: '#67707a', borderRadius: 8 }} />
      </button>
    ),
  };
}
