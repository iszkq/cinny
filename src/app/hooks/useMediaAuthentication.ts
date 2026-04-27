import { useSpecVersions } from './useSpecVersions';

const AUTH_MEDIA_STORAGE_KEY = 'cinny_use_authenticated_media';

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
  const userEnabledAuthenticatedMedia =
    typeof window !== 'undefined' &&
    window.localStorage.getItem(AUTH_MEDIA_STORAGE_KEY) === 'true';

  // Disable authenticated media by default.
  // In this fork, hard refresh (Ctrl + F5) can bypass the service-worker-assisted
  // auth flow for <img> requests, which causes avatars, room images, stickers,
  // and uploaded media to disappear together.
  if (!userEnabledAuthenticatedMedia) {
    return false;
  }

  // Media authentication is introduced in spec version 1.11.
  const authenticatedMedia =
    unstableFeatures?.['org.matrix.msc3916.stable'] || versions.includes('v1.11');

  return authenticatedMedia && canUseAuthenticatedMedia();
};
