# iOS compatibility build

Source: https://github.com/matrix-org/matrix-sdk-crypto-wasm/tree/v18.4.0
Commit: 16a138b (v18.4.0), original Cargo.lock retained during compilation.
Crypto algorithms, Matrix SDK source and persistent database schema are unchanged.
Only the WebAssembly target features and generated JS ABI change. Android keeps
using the npm dependency without an alias.

Rebuild from a checkout of the above tag, using Rust 1.99.0 and wasm-bindgen-cli 0.2.126:

```
rustup component add rust-src
CC_wasm32_unknown_unknown=/opt/homebrew/opt/llvm/bin/clang CFLAGS_wasm32_unknown_unknown='-mno-reference-types -mno-multivalue -mno-simd128' RUSTC_BOOTSTRAP=1 RUSTFLAGS='--cfg getrandom_backend="wasm_js" -C target-feature=-reference-types,-multivalue,-simd128' cargo build --locked --release --target wasm32-unknown-unknown -Z build-std=std,panic_abort
wasm-bindgen --target bundler --out-dir pkg --weak-refs target/wasm32-unknown-unknown/release/matrix_sdk_crypto_wasm.wasm
```

Rebuilding std is necessary: flags on only the application crate cannot remove
features already present in precompiled std. Keep the generated JS glue and WASM
as one matching pair. The glue is also transformed to CommonJS for Node tests.

This is an experimental compatibility change for iOS 16.1 table-access failures,
not a confirmed diagnosis of a particular WebKit defect. Do not delete local
stores or reset user identity to test it.

The C compiler must support wasm32 and disable the same features. Apple Clang cannot target wasm32. Generate the .cjs glue with the project esbuild transform (format cjs, target node18). No wasm-opt pass is applied.
