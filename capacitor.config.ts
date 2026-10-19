import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.iszkq.starfire',
  appName: '计算器',
  webDir: 'dist',
  backgroundColor: '#17191e',
  plugins: { SystemBars: {style:'DARK',insetsHandling:'css'} },
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    allowNavigation: ['124.222.193.241'],
    errorPath: 'webview-update.html',
  },
  android: {
    allowMixedContent: false,
    minWebViewVersion: 109,
  },
};

export default config;
