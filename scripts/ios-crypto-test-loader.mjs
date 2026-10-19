import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@matrix-org/matrix-sdk-crypto-wasm') {
      const entry = context.conditions.includes('require') ? 'node.cjs' : 'node.mjs';
      return {
        url: new URL('../vendor/ios-matrix-sdk-crypto-wasm/' + entry, import.meta.url).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
