import React, { MouseEventHandler, ReactNode, useCallback, useState } from 'react';
import {
  Box,
  Text,
  Chip,
  Icon,
  Icons,
  RectCords,
  PopOut,
  Menu,
  config,
  MenuItem,
  color,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '../utils/keyboard';
import { SettingTile } from './setting-tile';
import { SecretStorageKeyContent } from '../../types/matrix/accountData';
import { SecretStorageRecoveryKey, SecretStorageRecoveryPassphrase } from './SecretStorage';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { storePrivateKey } from '../../client/secretStorageKeys';
import { persistAndroidCryptoState } from '../../client/initMatrix';

export enum ManualVerificationMethod {
  RecoveryPassphrase = 'passphrase',
  RecoveryKey = 'key',
}
type ManualVerificationMethodSwitcherProps = {
  value: ManualVerificationMethod;
  onChange: (value: ManualVerificationMethod) => void;
};
export function ManualVerificationMethodSwitcher({
  value,
  onChange,
}: ManualVerificationMethodSwitcherProps) {
  const [menuCords, setMenuCords] = useState<RectCords>();

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (method: ManualVerificationMethod) => {
    setMenuCords(undefined);
    onChange(method);
  };

  return (
    <>
      <Chip
        type="button"
        variant="Secondary"
        fill="Soft"
        radii="Pill"
        before={<Icon size="100" src={Icons.ChevronBottom} />}
        onClick={handleMenu}
      >
        <Text as="span" size="B300">
          {value === ManualVerificationMethod.RecoveryPassphrase && '恢复口令'}
          {value === ManualVerificationMethod.RecoveryKey && '恢复密钥'}
        </Text>
      </Chip>
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Bottom"
        align="End"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setMenuCords(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
              isKeyBackward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                <MenuItem
                  size="300"
                  variant="Surface"
                  aria-selected={value === ManualVerificationMethod.RecoveryPassphrase}
                  radii="300"
                  onClick={() => handleSelect(ManualVerificationMethod.RecoveryPassphrase)}
                >
                  <Box grow="Yes">
                    <Text size="T300">恢复口令</Text>
                  </Box>
                </MenuItem>
                <MenuItem
                  size="300"
                  variant="Surface"
                  aria-selected={value === ManualVerificationMethod.RecoveryKey}
                  radii="300"
                  onClick={() => handleSelect(ManualVerificationMethod.RecoveryKey)}
                >
                  <Box grow="Yes">
                    <Text size="T300">恢复密钥</Text>
                  </Box>
                </MenuItem>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </>
  );
}

type ManualVerificationTileProps = {
  secretStorageKeyId: string;
  secretStorageKeyContent: SecretStorageKeyContent;
  options?: ReactNode;
};
export function ManualVerificationTile({
  secretStorageKeyId,
  secretStorageKeyContent,
  options,
}: ManualVerificationTileProps) {
  const mx = useMatrixClient();

  const hasPassphrase = !!secretStorageKeyContent.passphrase;
  const [method, setMethod] = useState(
    hasPassphrase
      ? ManualVerificationMethod.RecoveryPassphrase
      : ManualVerificationMethod.RecoveryKey
  );

  const verifyAndRestoreBackup = useCallback(
    async (recoveryKey: Uint8Array) => {
      const crypto = mx.getCrypto();
      if (!crypto) {
        throw new Error('加密模块不可用。');
      }

      storePrivateKey(secretStorageKeyId, recoveryKey);

      await crypto.bootstrapCrossSigning({});
      await crypto.bootstrapSecretStorage({});

      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      await persistAndroidCryptoState(mx, true);
    },
    [mx, secretStorageKeyId]
  );

  const [verifyState, handleDecodedRecoveryKey] = useAsyncCallback<void, Error, [Uint8Array]>(
    verifyAndRestoreBackup
  );
  const verifying = verifyState.status === AsyncStatus.Loading;

  return (
    <Box direction="Column" gap="200">
      <SettingTile
        title="手动验证"
        description={hasPassphrase ? '请选择验证方式。' : '请输入恢复密钥。'}
        after={
          <Box alignItems="Center" gap="200">
            {hasPassphrase && (
              <ManualVerificationMethodSwitcher value={method} onChange={setMethod} />
            )}
            {options}
          </Box>
        }
      />
      {verifyState.status === AsyncStatus.Success ? (
        <Text size="T200" style={{ color: color.Success.Main }}>
          <b>设备验证成功！</b>
        </Text>
      ) : (
        <Box direction="Column" gap="100">
          {method === ManualVerificationMethod.RecoveryKey && (
            <SecretStorageRecoveryKey
              processing={verifying}
              keyContent={secretStorageKeyContent}
              onDecodedRecoveryKey={handleDecodedRecoveryKey}
            />
          )}
          {method === ManualVerificationMethod.RecoveryPassphrase &&
            secretStorageKeyContent.passphrase && (
              <SecretStorageRecoveryPassphrase
                processing={verifying}
                keyContent={secretStorageKeyContent}
                passphraseContent={secretStorageKeyContent.passphrase}
                onDecodedRecoveryKey={handleDecodedRecoveryKey}
              />
            )}
          {verifyState.status === AsyncStatus.Error && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              <b>{verifyState.error.message}</b>
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
