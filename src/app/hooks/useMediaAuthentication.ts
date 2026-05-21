import { useEffect, useState } from 'react';
import { useSpecVersions } from './useSpecVersions';

const MEDIA_AUTH_STATE_CHANGE_EVENT = 'cinny:media-auth-state-change';
const FORCE_LEGACY_MEDIA_ENDPOINTS = true;
let authenticatedMediaDisabledForSession = false;

const dispatchMediaAuthStateChange = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MEDIA_AUTH_STATE_CHANGE_EVENT));
};

export const disableAuthenticatedMediaForSession = (): void => {
  if (authenticatedMediaDisabledForSession) return;
  authenticatedMediaDisabledForSession = true;
  dispatchMediaAuthStateChange();
};

export const useMediaAuthentication = (): boolean => {
  const { unstable_features: unstableFeatures } = useSpecVersions();
  const [disabled, setDisabled] = useState(authenticatedMediaDisabledForSession);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleChange = () => {
      setDisabled(authenticatedMediaDisabledForSession);
    };

    window.addEventListener(MEDIA_AUTH_STATE_CHANGE_EVENT, handleChange);
    return () => {
      window.removeEventListener(MEDIA_AUTH_STATE_CHANGE_EVENT, handleChange);
    };
  }, []);

  if (FORCE_LEGACY_MEDIA_ENDPOINTS) {
    return false;
  }

  // Be conservative here. Some deployments report newer spec versions but still
  // behave unreliably on authenticated media endpoints, which breaks attachment
  // downloads and image loading hard enough to disrupt sync UX.
  return unstableFeatures?.['org.matrix.msc3916.stable'] === true && !disabled;
};
