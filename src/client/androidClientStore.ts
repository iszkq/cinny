import { registerPlugin } from '@capacitor/core';
import type { ISavedSync } from 'matrix-js-sdk/lib/store';

type AndroidClientSnapshot = {
  savedSync: ISavedSync;
  savedAt: number;
};

type AndroidClientStorePlugin = {
  load(options: { accountKey: string }): Promise<{ snapshot?: AndroidClientSnapshot }>;
  save(options: { accountKey: string; snapshot: AndroidClientSnapshot }): Promise<void>;
  remove(options: { accountKey: string }): Promise<void>;
};

const AndroidClientStore = registerPlugin<AndroidClientStorePlugin>('AndroidClientStore');

export const getAndroidClientStoreAccountKey = (
  baseUrl: string,
  userId: string,
  deviceId: string
): string => `${baseUrl}|${userId}|${deviceId}`;

export const loadAndroidClientSnapshot = async (
  accountKey: string
): Promise<AndroidClientSnapshot | undefined> => {
  try {
    const { snapshot } = await AndroidClientStore.load({ accountKey });
    if (
      !snapshot?.savedSync?.nextBatch ||
      !snapshot.savedSync.roomsData ||
      typeof snapshot.savedAt !== 'number'
    ) {
      return undefined;
    }
    return snapshot;
  } catch {
    return undefined;
  }
};

export const saveAndroidClientSnapshot = async (
  accountKey: string,
  savedSync: ISavedSync
): Promise<void> => {
  if (!savedSync.nextBatch || !savedSync.roomsData) return;
  await AndroidClientStore.save({
    accountKey,
    snapshot: { savedSync, savedAt: Date.now() },
  });
};

export const removeAndroidClientSnapshot = (accountKey: string): Promise<void> =>
  AndroidClientStore.remove({ accountKey });
