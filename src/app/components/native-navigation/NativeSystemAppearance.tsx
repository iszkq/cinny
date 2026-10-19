import { useEffect } from 'react';
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
const NativeAppearance = registerPlugin<{setTheme(options:{dark:boolean;background:string}):Promise<void>}>('NativeAppearance');
export function NativeSystemAppearance() {
  useEffect(() => {
    document.documentElement.dataset.nativeChatUi = 'true';
    let last: string | undefined;
    let queue = Promise.resolve();
    const update = () => {
      const locked = document.documentElement.dataset.calculatorLocked !== 'false';
      const dark = locked || (document.body.dataset.appTheme ? document.body.dataset.appTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
      const key = `${locked}-${dark}`;
      if (last === key) return;
      last = key;
      const background = locked ? '#17191e' : dark ? '#15191c' : '#ffffff';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      document.body.style.backgroundColor = background;
      if (!Capacitor.isNativePlatform()) return;
      queue = queue.then(async () => {
        await SystemBars.setStyle({style:dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light}).catch(() => undefined);
        if (Capacitor.getPlatform() === 'android') await NativeAppearance.setTheme({dark,background}).catch(() => undefined);
      });
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, {attributes:true,attributeFilter:['class','data-app-theme']});
    observer.observe(document.documentElement, {attributes:true,attributeFilter:['data-calculator-locked']});
    update();
    return () => observer.disconnect();
  }, []);
  return null;
}
