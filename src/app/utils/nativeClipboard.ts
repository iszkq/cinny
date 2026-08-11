import { registerPlugin } from '@capacitor/core';

export type NativeClipboardPlugin = {
  writeText(options: { text: string }): Promise<{ verified?: boolean }>;
};

export const NativeClipboard = registerPlugin<NativeClipboardPlugin>('NativeClipboard');
