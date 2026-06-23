let bibleFeaturePromise: Promise<typeof import('../features/bible')> | undefined;

export const loadBibleFeature = async () => {
  if (!bibleFeaturePromise) {
    bibleFeaturePromise = import('../features/bible').catch((error) => {
      bibleFeaturePromise = undefined;
      throw error;
    });
  }

  return bibleFeaturePromise;
};

export const warmBibleResources = async (): Promise<void> => {
  const bibleFeature = await loadBibleFeature();
  await bibleFeature.loadBibleData();
};
