import { useSpecVersions } from './useSpecVersions';

export const useMediaAuthentication = (): boolean => {
  const { unstable_features: unstableFeatures } = useSpecVersions();

  // Be conservative here. Some deployments report newer spec versions but still
  // behave unreliably on authenticated media endpoints, which breaks attachment
  // downloads and image loading hard enough to disrupt sync UX.
  return unstableFeatures?.['org.matrix.msc3916.stable'] === true;
};
