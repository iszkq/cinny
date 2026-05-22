import React, { FormEventHandler, useCallback, useEffect, useState } from 'react';
import { Box, Button, color, Icon, Icons, Spinner, Text, toRem } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';
import { PasswordInput } from '../../../components/password-input';
import { ConfirmPasswordMatch } from '../../../components/ConfirmPasswordMatch';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { decryptMegolmKeyFile, encryptMegolmKeyFile } from '../../../../util/cryptE2ERoomKeys';
import { useAlive } from '../../../hooks/useAlive';
import { useFilePicker } from '../../../hooks/useFilePicker';
import { saveDownloadedFile } from '../../../utils/saveDownloadedFile';

function ExportKeys() {
  const mx = useMatrixClient();
  const alive = useAlive();

  const [exportState, exportKeys] = useAsyncCallback<void, Error, [string]>(
    useCallback(
      async (password) => {
        const crypto = mx.getCrypto();
        if (!crypto) throw new Error('\u53d1\u751f\u610f\u5916\u9519\u8bef\uff0c\u672a\u627e\u5230\u52a0\u5bc6\u6a21\u5757\u3002');
        const keysJSON = await crypto.exportRoomKeysAsJson();

        const encKeys = await encryptMegolmKeyFile(keysJSON, password);

        const blob = new Blob([encKeys], {
          type: 'text/plain;charset=us-ascii',
        });
        await saveDownloadedFile(blob, 'cinny-keys.txt');
      },
      [mx]
    )
  );

  const exporting = exportState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (exporting) return;

    const { passwordInput, confirmPasswordInput } = evt.target as HTMLFormElement & {
      passwordInput: HTMLInputElement;
      confirmPasswordInput: HTMLInputElement;
    };

    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (password !== confirmPassword) return;

    exportKeys(password).then(() => {
      if (alive()) {
        passwordInput.value = '';
        confirmPasswordInput.value = '';
      }
    });
  };

  return (
    <SettingTile>
      <Box as="form" onSubmit={handleSubmit} direction="Column" gap="100">
        <Box gap="200" alignItems="End">
          <ConfirmPasswordMatch initialValue>
            {(match, doMatch, passRef, confPassRef) => (
              <>
                <Box grow="Yes" direction="Column" gap="100">
                  <Text size="L400">{'\u65b0\u5bc6\u7801'}</Text>
                  <PasswordInput
                    ref={passRef}
                    name="passwordInput"
                    size="400"
                    variant="Secondary"
                    radii="300"
                    required
                    onChange={doMatch}
                    readOnly={exporting}
                    autoFocus
                  />
                </Box>
                <Box grow="Yes" direction="Column" gap="100">
                  <Text size="L400">{'\u786e\u8ba4\u5bc6\u7801'}</Text>
                  <PasswordInput
                    ref={confPassRef}
                    style={{ color: match ? undefined : color.Critical.Main }}
                    name="confirmPasswordInput"
                    size="400"
                    variant="Secondary"
                    radii="300"
                    required
                    onChange={doMatch}
                    readOnly={exporting}
                  />
                </Box>
              </>
            )}
          </ConfirmPasswordMatch>
          <Button
            type="submit"
            size="400"
            variant="Secondary"
            fill="Soft"
            outlined
            radii="300"
            disabled={exporting}
            before={exporting ? <Spinner size="200" variant="Secondary" fill="Soft" /> : undefined}
          >
            <Text as="span" size="B400">
              {'\u5bfc\u51fa'}
            </Text>
          </Button>
        </Box>
        {exportState.status === AsyncStatus.Error && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            <b>{exportState.error.message}</b>
          </Text>
        )}
      </Box>
    </SettingTile>
  );
}

function ExportKeysTile() {
  const [expand, setExpand] = useState(false);

  return (
    <>
      <SettingTile
        title={'\u5bfc\u51fa\u6d88\u606f\u6570\u636e'}
        description={
          '\u5c06\u53d7\u5bc6\u7801\u4fdd\u62a4\u7684\u52a0\u5bc6\u6570\u636e\u5907\u4efd\u4fdd\u5b58\u5230\u5f53\u524d\u8bbe\u5907\uff0c\u65b9\u4fbf\u540e\u7eed\u89e3\u5bc6\u6d88\u606f\u3002'
        }
        after={
          <Box>
            <Button
              type="button"
              onClick={() => setExpand(!expand)}
              size="300"
              variant="Secondary"
              fill="Soft"
              outlined
              radii="300"
              before={
                <Icon size="100" src={expand ? Icons.ChevronTop : Icons.ChevronBottom} filled />
              }
            >
              <Text as="span" size="B300" truncate>
                {expand ? '\u6536\u8d77' : '\u5c55\u5f00'}
              </Text>
            </Button>
          </Box>
        }
      />
      {expand && <ExportKeys />}
    </>
  );
}

type ImportKeysProps = {
  file: File;
  onDone?: () => void;
};
function ImportKeys({ file, onDone }: ImportKeysProps) {
  const mx = useMatrixClient();
  const alive = useAlive();

  const [decryptState, decryptFile] = useAsyncCallback<void, Error, [string]>(
    useCallback(
      async (password) => {
        const crypto = mx.getCrypto();
        if (!crypto) throw new Error('\u53d1\u751f\u610f\u5916\u9519\u8bef\uff0c\u672a\u627e\u5230\u52a0\u5bc6\u6a21\u5757\u3002');

        const arrayBuffer = await file.arrayBuffer();
        const keys = await decryptMegolmKeyFile(arrayBuffer, password);

        await crypto.importRoomKeysAsJson(keys);
      },
      [file, mx]
    )
  );

  const decrypting = decryptState.status === AsyncStatus.Loading;

  useEffect(() => {
    if (decryptState.status === AsyncStatus.Success) {
      onDone?.();
    }
  }, [onDone, decryptState]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (decrypting) return;

    const { passwordInput } = evt.target as HTMLFormElement & {
      passwordInput: HTMLInputElement;
    };

    const password = passwordInput.value;

    if (!password) return;
    decryptFile(password).then(() => {
      if (alive()) {
        passwordInput.value = '';
      }
    });
  };

  return (
    <SettingTile>
      <Box as="form" onSubmit={handleSubmit} direction="Column" gap="100">
        <Box gap="200" alignItems="End">
          <Box grow="Yes" direction="Column" gap="100">
            <Text size="L400">{'\u5bc6\u7801'}</Text>
            <PasswordInput
              name="passwordInput"
              size="400"
              variant="Secondary"
              radii="300"
              required
              autoFocus
              readOnly={decrypting}
            />
          </Box>
          <Button
            type="submit"
            size="400"
            variant="Secondary"
            fill="Soft"
            outlined
            radii="300"
            disabled={decrypting}
            before={decrypting ? <Spinner size="200" variant="Secondary" fill="Soft" /> : undefined}
          >
            <Text as="span" size="B400">
              {'\u89e3\u5bc6'}
            </Text>
          </Button>
        </Box>
        {decryptState.status === AsyncStatus.Error && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            <b>{decryptState.error.message}</b>
          </Text>
        )}
      </Box>
    </SettingTile>
  );
}

function ImportKeysTile() {
  const [file, setFile] = useState<File>();
  const pickFile = useFilePicker(setFile);

  const handleDone = useCallback(() => {
    setFile(undefined);
  }, []);

  return (
    <>
      <SettingTile
        title={'\u5bfc\u5165\u6d88\u606f\u6570\u636e'}
        description={
          '\u4ece\u8bbe\u5907\u4e2d\u8f7d\u5165\u53d7\u5bc6\u7801\u4fdd\u62a4\u7684\u52a0\u5bc6\u6570\u636e\u5907\u4efd\uff0c\u7528\u4e8e\u89e3\u5bc6\u4f60\u7684\u6d88\u606f\u3002'
        }
        after={
          <Box>
            {file ? (
              <Button
                style={{ maxWidth: toRem(200) }}
                type="button"
                onClick={() => setFile(undefined)}
                size="300"
                variant="Warning"
                fill="Solid"
                radii="300"
                before={<Icon size="100" src={Icons.File} filled />}
                after={<Icon size="100" src={Icons.Cross} />}
              >
                <Text as="span" size="B300" truncate>
                  {file.name}
                </Text>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => pickFile('text/plain')}
                size="300"
                variant="Secondary"
                fill="Soft"
                outlined
                radii="300"
                before={<Icon size="100" src={Icons.ArrowRight} />}
              >
                <Text as="span" size="B300">
                  {'\u5bfc\u5165'}
                </Text>
              </Button>
            )}
          </Box>
        }
      />
      {file && <ImportKeys file={file} onDone={handleDone} />}
    </>
  );
}

export function LocalBackup() {
  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{'\u672c\u5730\u5907\u4efd'}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <ExportKeysTile />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <ImportKeysTile />
      </SequenceCard>
    </Box>
  );
}
