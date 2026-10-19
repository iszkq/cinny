import { RefObject, useEffect } from 'react';
import { NATIVE_BACK_EVENT } from '../utils/nativeBack';
export function useNativeBack(ref: RefObject<HTMLElement>, onBack: () => void, enabled = true) {
  useEffect(() => {
    const scope = ref.current;
    if (!scope || !enabled) return undefined;
    scope.setAttribute('data-native-back-scope', 'true');
    scope.addEventListener(NATIVE_BACK_EVENT, onBack);
    return () => {
      scope.removeAttribute('data-native-back-scope');
      scope.removeEventListener(NATIVE_BACK_EVENT, onBack);
    };
  }, [ref, onBack, enabled]);
}
