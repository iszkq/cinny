export const AIHUBMIX_STANDARD_ORIGIN = 'https://aihubmix.com';
export const AIHUBMIX_PREFERRED_ORIGIN = 'https://api.inferera.com';

export const AIHUBMIX_PREFERRED_BASE_URL = `${AIHUBMIX_PREFERRED_ORIGIN}/v1`;
export const AIHUBMIX_PREFERRED_MODELS_API_URL = `${AIHUBMIX_PREFERRED_ORIGIN}/api/v1/models`;

const OFFICIAL_AIHUBMIX_HOSTS = new Set(['aihubmix.com', 'api.aihubmix.com', 'api.inferera.com']);

const replaceOrigin = (url: URL, origin: string): string => {
  const target = new URL(origin);
  target.pathname = url.pathname;
  target.search = url.search;
  target.hash = '';
  return target.toString();
};

/**
 * Returns the official Preferred route first and the standard route as a fallback on every
 * platform. Custom OpenAI-compatible URLs are never rewritten or leaked to another provider.
 */
export const getAihubmixUrlCandidates = (input: string): string[] => {
  const trimmedInput = input.trim();
  if (!trimmedInput) return [];

  let url: URL;
  try {
    url = new URL(trimmedInput);
  } catch {
    return [trimmedInput];
  }

  if (!OFFICIAL_AIHUBMIX_HOSTS.has(url.hostname.toLowerCase())) {
    return [trimmedInput];
  }

  return Array.from(
    new Set([
      replaceOrigin(url, AIHUBMIX_PREFERRED_ORIGIN),
      replaceOrigin(url, AIHUBMIX_STANDARD_ORIGIN),
    ])
  );
};

export const getAihubmixEndpointCandidates = (baseUrl: string, path: string): string[] =>
  getAihubmixUrlCandidates(`${baseUrl.trim().replace(/\/+$/, '')}${path}`);
