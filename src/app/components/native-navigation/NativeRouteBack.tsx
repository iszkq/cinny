import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NATIVE_ROUTE_BACK_EVENT, parentRoute } from '../../utils/nativeBack';
import { getFallbackSession } from '../../state/sessions';
import { getHomePath, getLoginPath } from '../../pages/pathUtils';
export function NativeRouteBack() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const back = (event: Event) => {
      event.preventDefault();
      const parent = parentRoute(location.pathname);
      if (parent === 'calculator') { window.dispatchEvent(new Event('calculator-native-root-back')); return; }
      if (parent === 'spaces') { window.dispatchEvent(new Event('calculator-open-spaces')); return; }
      if (parent) { navigate(parent); return; }
      const index = window.history.state?.idx;
      if (typeof index === 'number' && index > 0) { navigate(-1); return; }
      const root = getFallbackSession() ? getHomePath() : getLoginPath();
      if (location.pathname !== root) navigate(root, {replace:true});
      else window.dispatchEvent(new Event('calculator-native-root-back'));
    };
    window.addEventListener(NATIVE_ROUTE_BACK_EVENT, back);
    return () => window.removeEventListener(NATIVE_ROUTE_BACK_EVENT, back);
  }, [location, navigate]);
  return null;
}
