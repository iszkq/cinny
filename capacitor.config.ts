import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.iszkq.starfire',
  appName: '星火',
  webDir: 'dist',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    allowNavigation: ['124.222.193.241'],
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
