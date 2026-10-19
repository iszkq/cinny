import React, { useEffect } from 'react';
import { isBackSwipe, requestNativeBack } from '../../utils/nativeBack';
import { ANDROID_BACK_BUTTON_EVENT } from '../../utils/nativePlatform';
import './navigation.css';
export function NativeNavigation({ onRootBack }: { onRootBack: () => void }) {
  useEffect(() => {
    // Login/loading/error screens have no router handler yet.
    const fallback = (event: Event) => {
      if (!event.defaultPrevented) onRootBack();
    };
    const back = (event: Event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestNativeBack();
    };
    const protectButton = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.native-back-button')) event.stopImmediatePropagation();
    };
    document.addEventListener('mousedown', protectButton, true);
    document.addEventListener('touchstart', protectButton, true);
    window.addEventListener('calculator-native-root-back', fallback);
    window.addEventListener(ANDROID_BACK_BUTTON_EVENT, back);
    let start: { x: number; y: number; time: number; chat: boolean } | undefined;
    const touchStart = (event: TouchEvent) => {
      start = undefined;
      const target = event.target;
      if (event.touches.length !== 1 || !(target instanceof Element) ||
          target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"], [data-no-back-swipe]')) return;
      for (let node = target; node && node !== document.body; node = node.parentElement!) {
        const overflow = getComputedStyle(node).overflowX;
        if ((overflow === 'auto' || overflow === 'scroll') && node.scrollWidth > node.clientWidth + 8) return;
      }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, time: Date.now(), chat: !!target.closest('[data-chat-view]') };
    };
    const touchEnd = (event: TouchEvent) => {
      const previous = start;
      start = undefined;
      if (!previous || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      if (!isBackSwipe({startX:previous.x,startY:previous.y,endX:touch.clientX,endY:touch.clientY,elapsed:Date.now()-previous.time,chat:previous.chat})) return;
      event.preventDefault();
      event.stopPropagation();
      requestNativeBack();
    };
    const cancel = () => { start = undefined; };
    document.addEventListener('touchstart', touchStart, {passive:true,capture:true});
    document.addEventListener('touchend', touchEnd, {passive:false,capture:true});
    document.addEventListener('touchcancel', cancel, true);
    return () => {
      document.removeEventListener('mousedown', protectButton, true);
      document.removeEventListener('touchstart', protectButton, true);
      window.removeEventListener('calculator-native-root-back', fallback);
      window.removeEventListener(ANDROID_BACK_BUTTON_EVENT, back);
      document.removeEventListener('touchstart', touchStart, true);
      document.removeEventListener('touchend', touchEnd, true);
      document.removeEventListener('touchcancel', cancel, true);
    };
  }, [onRootBack]);
  return <button className="native-back-button" type="button" aria-label="返回" onClick={requestNativeBack}>‹ 返回</button>;
}
