import { UAParser } from 'ua-parser-js';

export const ua = () => UAParser(window.navigator.userAgent);

export const isMacOS = () => ua().os.name === 'Mac OS';

export const mobileOrTablet = (): boolean => {
  const userAgent = ua();
  const { os, device } = userAgent;
  if (device.type === 'mobile' || device.type === 'tablet') return true;
  if (os.name === 'Android' || os.name === 'iOS') return true;
  // iPadOS can use a desktop-class Safari user agent and report itself as macOS.
  if (os.name === 'Mac OS' && window.navigator.maxTouchPoints > 1) return true;
  return false;
};
