type OfficeCryptoRuntime = {
  decrypt: (input: Uint8Array, options: { password: string }) => Promise<Uint8Array | ArrayBuffer>;
  isEncrypted: (input: Uint8Array) => boolean;
};

let runtimePromise: Promise<OfficeCryptoRuntime> | undefined;

const loadRuntime = (): Promise<OfficeCryptoRuntime> => {
  if (!runtimePromise) {
    runtimePromise = import('officecrypto-tool')
      .then((module) => {
        const candidate = 'default' in module ? module.default : module;
        return candidate as unknown as OfficeCryptoRuntime;
      })
      .catch((error) => {
        runtimePromise = undefined;
        throw error;
      });
  }
  return runtimePromise;
};

const toArrayBuffer = (value: Uint8Array | ArrayBuffer): ArrayBuffer => {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
};

export const isOfficeDocumentEncrypted = async (data: ArrayBuffer): Promise<boolean> => {
  try {
    const runtime = await loadRuntime();
    return runtime.isEncrypted(new Uint8Array(data.slice(0)));
  } catch {
    return false;
  }
};

export const decryptOfficeDocument = async (
  data: ArrayBuffer,
  password: string
): Promise<ArrayBuffer> => {
  const trimmedPassword = password.trim();
  if (!trimmedPassword) throw new Error('Password is required');

  const runtime = await loadRuntime();
  const decrypted = await runtime.decrypt(new Uint8Array(data.slice(0)), {
    password: trimmedPassword,
  });
  return toArrayBuffer(decrypted);
};
