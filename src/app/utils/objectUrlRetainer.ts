const retainedObjectUrls = new Map<string, number>();
const pendingRevocations = new Set<string>();

const isBlobUrl = (url?: string): url is string => typeof url === 'string' && url.startsWith('blob:');

export const retainObjectUrl = (url?: string) => {
  if (!isBlobUrl(url)) {
    return;
  }

  retainedObjectUrls.set(url, (retainedObjectUrls.get(url) ?? 0) + 1);
  pendingRevocations.delete(url);
};

export const releaseObjectUrl = (url?: string) => {
  if (!isBlobUrl(url)) {
    return;
  }

  const retainCount = retainedObjectUrls.get(url);
  if (!retainCount) {
    return;
  }

  if (retainCount > 1) {
    retainedObjectUrls.set(url, retainCount - 1);
    return;
  }

  retainedObjectUrls.delete(url);

  if (pendingRevocations.delete(url)) {
    URL.revokeObjectURL(url);
  }
};

export const revokeObjectUrlWhenPossible = (url?: string) => {
  if (!isBlobUrl(url)) {
    return;
  }

  if (retainedObjectUrls.has(url)) {
    pendingRevocations.add(url);
    return;
  }

  URL.revokeObjectURL(url);
};
