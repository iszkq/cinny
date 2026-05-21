import { useEffect, useState } from 'react';
import { useSpecVersions } from './useSpecVersions';

const MEDIA_AUTH_STATE_CHANGE_EVENT = 'cinny:media-auth-state-change';
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
  const { versions, unstable_features: unstableFeatures } = useSpecVersions();
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

  const authenticatedMedia =
    unstableFeatures?.['org.matrix.msc3916.stable'] === true || versions.includes('v1.11');

  return authenticatedMedia && !disabled;
};
