import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { wasm } from '@rollup/plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import inject from '@rollup/plugin-inject';
import topLevelAwait from 'vite-plugin-top-level-await';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import buildConfig from './build.config';
import { calculatorEntry } from './scripts/ios-calculator-entry.mjs';

const iosAppBuild = process.env.VITE_IOS_APP === 'true';
const androidAppBuild = process.env.VITE_ANDROID_APP === 'true';
const deploymentRevision =
  process.env.VITE_DEPLOYMENT_ID ??
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.COMMIT_REF ??
  Date.now().toString(36);
const deploymentId = deploymentRevision.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'local';
const androidBibleDisabledModule = path
  .resolve('src/app/utils/androidBibleDisabled.ts')
  .replace(/\\/g, '/');

const copyFiles = {
  targets: [
    {src:'public/webview-update.html',dest:''},
    {
      src: 'node_modules/@element-hq/element-call-embedded/dist/*',
      dest: 'public/element-call',
    },
    {
      src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      dest: '',
      rename: 'pdf.worker.min.js',
    },
    {
      src: 'netlify.toml',
      dest: '',
    },
    {
      src: 'config.json',
      dest: '',
    },
    {
      src: 'public/_headers',
      dest: '',
    },
    {
      src: 'public/_redirects',
      dest: '',
    },
    {
      src: 'public/_worker.js',
      dest: '',
    },
    {
      src: 'public/asset-404.html',
      dest: '',
    },
    {
      src: 'public/favicon.ico',
      dest: '',
    },
    {
      src: 'public/manifest.json',
      dest: '',
    },
    {
      src: 'public/res/apple',
      dest: 'public/res',
    },
    {
      src: 'public/res/logo.png',
      dest: 'public/res',
    },
    {
      src: 'public/res/android',
      dest: 'public/',
    },
    {
      src: 'public/locales',
      dest: 'public/',
    },
  ],
};

function serverMatrixSdkCryptoWasm(wasmFilePath) {
  return {
    name: 'vite-plugin-serve-matrix-sdk-crypto-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === wasmFilePath) {
          const resolvedPath = path.join(
            path.resolve(),
            iosAppBuild
              ? '/vendor/ios-matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm'
              : '/node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm'
          );

          if (fs.existsSync(resolvedPath)) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'no-cache');

            const fileStream = fs.createReadStream(resolvedPath);
            fileStream.pipe(res);
          } else {
            res.writeHead(404);
            res.end('File not found');
          }
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  appType: 'spa',
  publicDir: false,
  base: buildConfig.base,
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
    ),
  },
  server: {
    port: 8080,
    host: true,
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
  },
  resolve: {
    alias: [
      ...(iosAppBuild ? [{
        find: /^@matrix-org\/matrix-sdk-crypto-wasm$/,
        replacement: path.resolve('vendor/ios-matrix-sdk-crypto-wasm/index.mjs'),
      }] : []),
      { find: 'crypto', replacement: 'crypto-browserify' },
      { find: 'stream', replacement: 'stream-browserify' },
      { find: 'timers', replacement: 'timers-browserify' },
      ...(androidAppBuild
        ? [
            {
              find: './app/components/bible/NativeBibleWindow',
              replacement: androidBibleDisabledModule,
            },
            {
              find: './sidebar/BibleTab',
              replacement: androidBibleDisabledModule,
            },
          ]
        : []),
    ],
  },
  plugins: [
    {
      name: 'ios16-compatibility',
      transformIndexHtml: (html) => (iosAppBuild || androidAppBuild) ? calculatorEntry(html,{android:androidAppBuild}) : html,
      transform(code, id) {
        // The SDK only tests whether this expression matches; consuming the
        // boundary preserves its capture group and avoids Safari 16 lookbehind.
        if (id.replaceAll('\\', '/').endsWith('/matrix-js-sdk/lib/pushprocessor.js')) {
          return code.replaceAll('(?<=^|', '(?:^|');
        }
        return null;
      },
    },
    serverMatrixSdkCryptoWasm('/node_modules/.vite/deps/pkg/matrix_sdk_crypto_wasm_bg.wasm'),
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: '__tla',
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i) => `__tla_${i}`,
    }),
    viteStaticCopy(copyFiles),
    vanillaExtractPlugin(),
    wasm(),
    react(),
    VitePWA({
      srcDir: 'src',
      filename: 'sw.ts',
      strategies: 'injectManifest',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
      plugins: [
        // Enable esbuild polyfill plugins
        NodeGlobalsPolyfillPlugin({
          process: true,
          buffer: true,
        }),
      ],
    },
  },
  build: {
    target: iosAppBuild ? 'safari16' : androidAppBuild ? 'chrome109' : undefined,
    outDir: 'dist',
    sourcemap: false,
    manifest: true,
    copyPublicDir: false,
    rollupOptions: {
      plugins: [inject({ Buffer: ['buffer', 'Buffer'], process: ['process', 'default'] })],
      output: {
        // Content-only hashes can reuse a URL that an edge cache previously poisoned with the
        // SPA HTML fallback. A deployment suffix guarantees that every release gets a fresh JS
        // namespace while retaining content hashes inside that release.
        entryFileNames: `assets/[name]-[hash]-${deploymentId}.js`,
        chunkFileNames: `assets/[name]-[hash]-${deploymentId}.js`,
      },
    },
  },
});
