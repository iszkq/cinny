import { useSpecVersions } from './useSpecVersions';

const canUseAuthenticatedMedia = (): boolean => {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return false;
  }

  if (!('serviceWorker' in navigator)) {
    return false;
  }

  // Authenticated media relies on the service worker injecting the session token.
  // If the current page is not yet controlled, media requests can fail wholesale.
  return Boolean(navigator.serviceWorker.controller);
};

export const useMediaAuthentication = (): boolean => {
  const { versions, unstable_features: unstableFeatures } = useSpecVersions();

  // Media authentication is introduced in spec version 1.11.
  const authenticatedMedia =
    unstableFeatures?.['org.matrix.msc3916.stable'] || versions.includes('v1.11');

  return authenticatedMedia && canUseAuthenticatedMedia();
};
