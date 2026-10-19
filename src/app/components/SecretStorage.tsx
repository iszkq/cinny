import { isIOSApp } from '../utils/nativePlatform';
import { normalizeIOSRecoveryKey, iosVerificationError } from '../utils/iosVerification';
import React, { FormEventHandler, useCallback } from 'react';
import { Box, Text, Button, Spinner, color } from 'folds';
import { decodeRecoveryKey, deriveRecoveryKeyFromPassphrase } from 'matrix-js-sdk/lib/crypto-api';
import { PasswordInput } from './password-input';
import {
  SecretStorageKeyContent,
  SecretStoragePassphraseContent,
} from '../../types/matrix/accountData';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useAlive } from '../hooks/useAlive';

type SecretStorageRecoveryPassphraseProps = {
  processing?: boolean;
  keyContent: SecretStorageKeyContent;
  passphraseContent: SecretStoragePassphraseContent;
  onDecodedRecoveryKey: (recoveryKey: Uint8Array) => void | Promise<unknown>;
};
export function SecretStorageRecoveryPassphrase({
  processing,
  keyContent,
  passphraseContent,
  onDecodedRecoveryKey,
}: SecretStorageRecoveryPassphraseProps) {
  const mx = useMatrixClient();
  const alive = useAlive();

  const [driveKeyState, submitPassphrase] = useAsyncCallback<
    Uint8Array,
    Error,
    Parameters<typeof deriveRecoveryKeyFromPassphrase>
  >(
    useCallback(
      async (passphrase, salt, iterations, bits) => {
        const decodedRecoveryKey = await deriveRecoveryKeyFromPassphrase(
          passphrase,
          salt,
          iterations,
          bits
        );

        const match = await mx.secretStorage.checkKey(decodedRecoveryKey, keyContent as any);

        if (!match) {
          throw new Error('恢复口令不正确。');
        }

        return decodedRecoveryKey;
      },
      [mx, keyContent]
    )
  );

  const drivingKey = driveKeyState.status === AsyncStatus.Loading;
  const loading = drivingKey || processing;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (loading) return;

    const target = evt.target as HTMLFormElement | undefined;
    const recoveryPassphraseInput = target?.recoveryPassphraseInput as HTMLInputElement | undefined;
    if (!recoveryPassphraseInput) return;
    // A recovery passphrase is deliberately opaque: unlike a recovery key,
    // leading and trailing spaces are meaningful and must not be normalised.
    const recoveryPassphrase = recoveryPassphraseInput.value;
    if (recoveryPassphrase.length === 0) return;

    const { salt, iterations, bits } = passphraseContent;
    submitPassphrase(recoveryPassphrase, salt, iterations, bits)
      .then((decodedRecoveryKey) => {
        if (!alive()) return undefined;
        recoveryPassphraseInput.value = '';
        return onDecodedRecoveryKey(decodedRecoveryKey);
      })
      .catch(() => undefined);
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="100">
      <Box gap="200" alignItems="End">
        <Box grow="Yes" direction="Column" gap="100">
          <Text size="L400">恢复口令</Text>
          <PasswordInput
            name="recoveryPassphraseInput"
            size="400"
            variant="Secondary"
            radii="300"
            autoFocus
            required
            outlined
            readOnly={loading}
          />
        </Box>
        <Box shrink="No" gap="200">
          <Button
            type="submit"
            variant="Success"
            size="400"
            radii="300"
            disabled={loading}
            before={loading && <Spinner size="200" variant="Success" fill="Solid" />}
          >
            <Text as="span" size="B400">
              验证
            </Text>
          </Button>
        </Box>
      </Box>
      {driveKeyState.status === AsyncStatus.Error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>
            {isIOSApp() ? iosVerificationError(driveKeyState.error) : driveKeyState.error.message}
          </b>
        </Text>
      )}
    </Box>
  );
}

type SecretStorageRecoveryKeyProps = {
  processing?: boolean;
  keyContent: SecretStorageKeyContent;
  onDecodedRecoveryKey: (recoveryKey: Uint8Array) => void | Promise<unknown>;
};
export function SecretStorageRecoveryKey({
  processing,
  keyContent,
  onDecodedRecoveryKey,
}: SecretStorageRecoveryKeyProps) {
  const mx = useMatrixClient();
  const alive = useAlive();

  const [driveKeyState, submitRecoveryKey] = useAsyncCallback<Uint8Array, Error, [string]>(
    useCallback(
      async (recoveryKey) => {
        let decodedRecoveryKey: Uint8Array;
        try {
          decodedRecoveryKey = decodeRecoveryKey(
            isIOSApp() ? normalizeIOSRecoveryKey(recoveryKey) : recoveryKey
          );
        } catch (error) {
          if (isIOSApp())
            throw new Error(
              '恢复密钥的格式或校验码不正确。请使用原始恢复密钥；登录密码和计算器 PIN 不能代替它。'
            );
          throw error;
        }

        const match = await mx.secretStorage.checkKey(decodedRecoveryKey, keyContent as any);

        if (!match) {
          throw new Error(
            isIOSApp()
              ? '密钥格式有效，但与当前账号的密钥配置不匹配。它可能属于旧备份或其他账号。没有重置任何密钥。'
              : '恢复密钥不正确。'
          );
        }

        return decodedRecoveryKey;
      },
      [mx, keyContent]
    )
  );

  const drivingKey = driveKeyState.status === AsyncStatus.Loading;
  const loading = drivingKey || processing;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (loading) return;

    const target = evt.target as HTMLFormElement | undefined;
    const recoveryKeyInput = target?.recoveryKeyInput as HTMLInputElement | undefined;
    if (!recoveryKeyInput) return;
    const recoveryKey = recoveryKeyInput.value.trim();
    if (!recoveryKey) return;

    submitRecoveryKey(recoveryKey)
      .then((decodedRecoveryKey) => {
        if (!alive()) return undefined;
        recoveryKeyInput.value = '';
        return onDecodedRecoveryKey(decodedRecoveryKey);
      })
      .catch(() => undefined);
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="100">
      <Box gap="200" alignItems="End">
        <Box grow="Yes" direction="Column" gap="100">
          <Text size="L400">恢复密钥</Text>
          <PasswordInput
            name="recoveryKeyInput"
            autoCapitalize={isIOSApp() ? 'none' : undefined}
            autoCorrect={isIOSApp() ? 'off' : undefined}
            spellCheck={isIOSApp() ? false : undefined}
            size="400"
            variant="Secondary"
            radii="300"
            autoFocus
            required
            outlined
            readOnly={loading}
          />
        </Box>
        <Box shrink="No" gap="200">
          <Button
            type="submit"
            variant="Success"
            size="400"
            radii="300"
            disabled={loading}
            before={loading && <Spinner size="200" variant="Success" fill="Solid" />}
          >
            <Text as="span" size="B400">
              验证
            </Text>
          </Button>
        </Box>
      </Box>
      {driveKeyState.status === AsyncStatus.Error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          <b>
            {isIOSApp() ? iosVerificationError(driveKeyState.error) : driveKeyState.error.message}
          </b>
        </Text>
      )}
    </Box>
  );
}
