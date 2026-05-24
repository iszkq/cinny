export const isDataUrl = (value: string | undefined | null): value is string =>
  typeof value === 'string' && value.startsWith('data:');

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file data.'));
    };

    reader.onload = () => {
      const { result } = reader;
      if (typeof result !== 'string') {
        reject(new Error('Failed to encode file data.'));
        return;
      }

      resolve(result);
    };

    reader.readAsDataURL(blob);
  });

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error('Failed to decode file data.');
  }

  return response.blob();
};

export const dataUrlToFile = async (dataUrl: string, fileName: string): Promise<File> => {
  const blob = await dataUrlToBlob(dataUrl);

  return new File([blob], fileName, {
    type: blob.type || 'image/webp',
  });
};
