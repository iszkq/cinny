export const NATIVE_BACK_EVENT = 'calculator-native-back';
export const NATIVE_ROUTE_BACK_EVENT = 'calculator-native-route-back';
export function requestNativeBack(): void {
  const visible = (element: HTMLElement) => element.getClientRects().length > 0 && !element.closest('[hidden]');
  const scopes = Array.from(document.querySelectorAll<HTMLElement>('[data-native-back-scope]')).filter(visible);
  // Document order puts nested scopes and later portals after their parent.
  const scope = scopes[scopes.length - 1];
  if (scope) { scope.dispatchEvent(new Event(NATIVE_BACK_EVENT)); return; }
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]')).filter(visible);
  const dialog = dialogs[dialogs.length - 1];
  if (dialog) {
    const close = dialog.querySelector<HTMLButtonElement>('[data-native-back-button], button[aria-label="Close"], button[aria-label="关闭"], button[aria-label="返回"]');
    if (close) close.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',code:'Escape',bubbles:true,cancelable:true}));
    return;
  }
  const event = new Event(NATIVE_ROUTE_BACK_EVENT, {cancelable:true});
  if (window.dispatchEvent(event)) window.dispatchEvent(new Event('calculator-native-root-back'));
}
export type Swipe = { startX: number; startY: number; endX: number; endY: number; elapsed: number; chat: boolean };
export function isBackSwipe(swipe: Swipe): boolean {
  const dx = swipe.endX - swipe.startX;
  const dy = Math.abs(swipe.endY - swipe.startY);
  return swipe.elapsed > 0 && swipe.elapsed <= 900 && Math.abs(dx) >= 88 && dy <= 48 &&
    Math.abs(dx) > dy * 1.8 && (dx > 0 || swipe.chat);
}
export function parentRoute(pathname: string): string | 'spaces' | 'calculator' | undefined {
  const parts = pathname.split('/').filter(Boolean);
  const section = parts[0];
  if (!section) return undefined;
  if (section === 'login') return 'calculator';
  if (section === 'inbox') return '/home/';
  if (section === 'home' || section === 'direct' || section === 'explore') {
    return parts.length > 1 ? `/${section}/` : 'spaces';
  }
  if (section === 'register' || section === 'reset-password') return '/login/';
  let decoded: string;
  try { decoded = decodeURIComponent(section); } catch { return undefined; }
  if (decoded.startsWith('!') || decoded.startsWith('#')) return parts.length > 1 ? `/${section}/` : 'spaces';
  return undefined;
}
