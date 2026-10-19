import { useEffect, useRef, PointerEventHandler, MouseEventHandler } from 'react';

type Gesture = {
  id: number;
  x: number;
  y: number;
  timer?: ReturnType<typeof setTimeout>;
  cleanup: () => void;
};
export function useMessageLongPress(
  onHold: (point: { x: number; y: number }) => void,
  disabled = false
) {
  const callback = useRef(onHold);
  callback.current = onHold;
  const active = useRef<Gesture>();
  const touchAt = useRef(0);
  const suppressClick = useRef(false);
  const cancel = () => {
    const gesture = active.current;
    active.current = undefined;
    if (gesture) {
      clearTimeout(gesture.timer);
      gesture.cleanup();
    }
  };
  useEffect(() => () => cancel(), []);
  const onPointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    cancel();
    suppressClick.current = false;
    if (!event.currentTarget.contains(event.target as Node)) return;
    touchAt.current = event.pointerType === 'mouse' ? 0 : Date.now();
    if (
      disabled ||
      event.pointerType === 'mouse' ||
      event.isPrimary === false ||
      (event.target as HTMLElement).closest(
        'button,a,input,textarea,select,[contenteditable="true"],[role="menuitem"],[role="dialog"]'
      )
    )
      return;
    const move = (evt: PointerEvent) => {
      const gesture = active.current;
      if (
        gesture &&
        (evt.pointerId !== gesture.id ||
          Math.hypot(evt.clientX - gesture.x, evt.clientY - gesture.y) > 12)
      )
        cancel();
    };
    const end = () => cancel();
    const next = () => {
      suppressClick.current = false;
      cancel();
    };
    const gesture: Gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      cleanup: () => {
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('pointerup', end, true);
        document.removeEventListener('pointercancel', end, true);
        document.removeEventListener('pointerdown', next, true);
        document.removeEventListener('scroll', end, true);
        window.removeEventListener('blur', end);
      },
    };
    active.current = gesture;
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    document.addEventListener('pointerdown', next, true);
    document.addEventListener('scroll', end, true);
    window.addEventListener('blur', end);
    gesture.timer = setTimeout(() => {
      if (active.current !== gesture) return;
      suppressClick.current = true;
      callback.current({ x: gesture.x, y: gesture.y });
    }, 450);
  };
  const onClickCapture: MouseEventHandler<HTMLDivElement> = (event) => {
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (
      suppressClick.current &&
      !(event.target as HTMLElement).closest('button,a,[role="menuitem"]')
    ) {
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return {
    onPointerDown,
    onClickCapture,
    cancel,
    isTouchContext: () => touchAt.current > 0 && Date.now() - touchAt.current < 1500,
  };
}
