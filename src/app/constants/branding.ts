import { deviceNameForPlatform } from '../utils/deviceName';
import AppLogo from '../../../public/res/logo.png';

import CalculatorLogo from '../../../public/res/calculator.svg';

const calculatorEdition =
  import.meta.env.VITE_IOS_APP === 'true' || import.meta.env.VITE_ANDROID_APP === 'true';
export const APP_DISPLAY_NAME = calculatorEdition ? '计算器' : '星火';
export const APP_TAGLINE = calculatorEdition ? '' : '星星之火，可以燎原';
export const APP_WEB_DEVICE_NAME = deviceNameForPlatform({
  android: import.meta.env.VITE_ANDROID_APP === 'true',
  ios: import.meta.env.VITE_IOS_APP === 'true',
  desktop: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  touchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
});
export const APP_VERSION = __APP_VERSION__;
export const APP_LOGO_URL = calculatorEdition ? CalculatorLogo : AppLogo;
