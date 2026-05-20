import React, { FormEventHandler, useMemo, useState } from 'react';
import { Box, Button, Input, Switch, Text, color } from 'folds';
import { useAccountData } from '../../../hooks/useAccountData';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getFallbackSession } from '../../../state/sessions';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';
import { usePinLockSnapshot } from '../../../hooks/usePinLockSnapshot';
import {
  AccountPinDialog,
  LocalPinSetupDialog,
  PinLockDialogShell,
} from '../../../components/pin-lock';
import {
  createDisabledAccountPinPolicyContent,
  createEnabledAccountPinPolicyContent,
  changeAccountPin,
  getAccountPinKey,
  getAccountPinLabel,
  isAccountPinPolicyEnabled,
  isDesktopPinLockSupported,
  isPinCodeFormatValid,
  lockScreenForAccount,
  supportsPinLock,
} from '../../../utils/pinLock';
import {
  AccountDataEvent,
  CinnyAccountPinPolicyContent,
} from '../../../../types/matrix/accountData';
import * as pinCss from '../../../components/pin-lock/style.css';

type SecurityProps = {
  requestClose: () => void;
};

type PinDialogMode = 'setup' | 'change' | 'disable' | undefined;

type ChangePinDialogProps = {
  baseUrl: string;
  userId: string;
  syncPolicy: boolean;
  requestClose: () => void;
};

function ChangePinDialog({
  baseUrl,
  userId,
  syncPolicy,
  requestClose,
}: ChangePinDialogProps) {
  const mx = useMatrixClient();
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();

    if (!isPinCodeFormatValid(nextPin)) {
      setError('PIN 码需要为 4 到 12 位数字。');
      return;
    }

    if (nextPin !== confirmPin) {
      setError('两次输入的新 PIN 码不一致。');
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      const config = await changeAccountPin(baseUrl, userId, currentPin, nextPin);

      if (syncPolicy) {
        await mx.setAccountData(
          AccountDataEvent.CinnyAccountPinPolicy,
          createEnabledAccountPinPolicyContent(config)
        );
      }

      requestClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改 PIN 码失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PinLockDialogShell
      title="修改本机 PIN"
      description="修改后，这台设备上的锁屏和下次登录验证都会使用新的 PIN。账号级策略本身仍然保持开启。"
      accountLabel={getAccountPinLabel(baseUrl, userId)}
      requestClose={requestClose}
      embedded
    >
      <Box as="form" onSubmit={handleSubmit} direction="Column" gap="300">
        <Box direction="Column" gap="100">
          <Text size="L400">当前 PIN</Text>
          <Input
            autoFocus
            required
            outlined
            size="500"
            type="password"
            inputMode="numeric"
            maxLength={12}
            autoComplete="current-password"
            value={currentPin}
            onChange={(evt) => setCurrentPin(evt.currentTarget.value)}
          />
        </Box>
        <Box direction="Column" gap="100">
          <Text size="L400">新 PIN</Text>
          <Input
            required
            outlined
            size="500"
            type="password"
            inputMode="numeric"
            maxLength={12}
            autoComplete="new-password"
            value={nextPin}
            onChange={(evt) => setNextPin(evt.currentTarget.value)}
          />
        </Box>
        <Box direction="Column" gap="100">
          <Text size="L400">确认新 PIN</Text>
          <Input
            required
            outlined
            size="500"
            type="password"
            inputMode="numeric"
            maxLength={12}
            autoComplete="new-password"
            value={confirmPin}
            onChange={(evt) => setConfirmPin(evt.currentTarget.value)}
          />
          <Text size="T200" priority="400">
            PIN 码只会保存在当前设备，不会上报到服务器。
          </Text>
          {error && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              {error}
            </Text>
          )}
        </Box>

        <Box className={pinCss.ActionRow}>
          <Button
            type="button"
            variant="Secondary"
            fill="Soft"
            size="400"
            onClick={requestClose}
            disabled={submitting}
          >
            <Text size="B300">取消</Text>
          </Button>
          <Button type="submit" variant="Primary" size="400" disabled={submitting}>
            <Text size="B300">{submitting ? '正在保存...' : '保存新 PIN'}</Text>
          </Button>
        </Box>
      </Box>
    </PinLockDialogShell>
  );
}

export function Security({ requestClose }: SecurityProps) {
  const mx = useMatrixClient();
  const session = getFallbackSession();
  const policyEvent = useAccountData(AccountDataEvent.CinnyAccountPinPolicy);
  const { protectedAccountKeys } = usePinLockSnapshot();
  const [dialogMode, setDialogMode] = useState<PinDialogMode>();

  const userId = mx.getUserId();
  const baseUrl = session?.baseUrl;
  const pinSupported = supportsPinLock();
  const desktopPinSupported = isDesktopPinLockSupported();
  const policyEnabled = isAccountPinPolicyEnabled(
    policyEvent?.getContent<CinnyAccountPinPolicyContent>()
  );
  const accountKey = baseUrl && userId ? getAccountPinKey(baseUrl, userId) : undefined;
  const localPinEnabled = useMemo(
    () => !!accountKey && protectedAccountKeys.includes(accountKey),
    [accountKey, protectedAccountKeys]
  );
  const accountPinEnabled = policyEnabled || localPinEnabled;

  if (!desktopPinSupported || !userId || !baseUrl) {
    return null;
  }

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">账户安全</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="PIN 保护"
          description={
            pinSupported ? (
              accountPinEnabled
                ? '当前账号已开启账号级 PIN 策略。其他新设备登录同一账号时，也必须先设置本机 PIN 才能进入。'
                : '开启后，这个账号在每台设备上都需要先设置各自的本机 PIN。PIN 码本身只保存在本地，不会同步到服务器。'
            ) : (
              <Text as="span" size="T200" style={{ color: color.Critical.Main }}>
                当前环境不支持本机 PIN 加密能力，暂时无法启用 PIN 保护。
              </Text>
            )
          }
          after={
            <Switch
              variant="Primary"
              value={accountPinEnabled}
              disabled={!pinSupported}
              onChange={() => setDialogMode(accountPinEnabled ? 'disable' : 'setup')}
            />
          }
        />
        <SettingTile
          title="当前设备状态"
          description={
            localPinEnabled
              ? '这台设备已经保存了本机 PIN，可以用于解锁锁屏和下次登录验证。'
              : '这台设备还没有保存本机 PIN。开启账号级 PIN 策略后，会先要求为当前设备创建本机 PIN。'
          }
          after={
            <Text size="T200" priority="300">
              {localPinEnabled ? '已设置' : '未设置'}
            </Text>
          }
        />
        {localPinEnabled && (
          <SettingTile
            title="修改本机 PIN"
            description="建议使用只有你自己知道的 4 到 12 位数字。修改后不会影响其他设备上的本机 PIN。"
            after={
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                onClick={() => setDialogMode('change')}
              >
                <Text size="B300">修改 PIN</Text>
              </Button>
            }
          />
        )}
        {localPinEnabled && (
          <SettingTile
            title="立即锁屏"
            description="锁屏后会完全切换到 PIN 锁定页面，后面的聊天内容不会继续显示。"
            after={
              <Button
                variant="Primary"
                fill="Soft"
                size="300"
                radii="300"
                onClick={() => {
                  lockScreenForAccount(baseUrl, userId);
                  requestClose();
                }}
              >
                <Text size="B300">锁屏</Text>
              </Button>
            }
          />
        )}
        <Box className={pinCss.NoticeCard} direction="Column" gap="100">
          <Text size="L400">说明</Text>
          <Text size="T300" priority="300">
            账号级策略会跟随账号同步，用来告诉其他设备“这个账号需要本机 PIN”。
          </Text>
          <Text size="T300" priority="300">
            真正的 PIN 码和加密摘要只保存在当前设备，不会上传，也不会在设备之间同步。
          </Text>
          <Text size="T300" priority="300">
            如果忘记 PIN，只能通过清空这台设备的本地数据来重置，本地会话和缓存也会一起被移除。
          </Text>
        </Box>
      </SequenceCard>

      {dialogMode === 'setup' && (
        <LocalPinSetupDialog
          baseUrl={baseUrl}
          userId={userId}
          title="开启账号级 PIN 保护"
          description="先为当前设备创建本机 PIN。保存完成后，这个账号在其他新设备登录时也会先要求设置各自的本机 PIN。"
          submitLabel="开启 PIN 保护"
          onCancel={() => setDialogMode(undefined)}
          embedded
          onSuccess={async (config) => {
            await mx.setAccountData(
              AccountDataEvent.CinnyAccountPinPolicy,
              createEnabledAccountPinPolicyContent(config)
            );
            setDialogMode(undefined);
          }}
        />
      )}
      {dialogMode === 'change' && (
        <ChangePinDialog
          baseUrl={baseUrl}
          userId={userId}
          syncPolicy={accountPinEnabled}
          requestClose={() => setDialogMode(undefined)}
        />
      )}
      {dialogMode === 'disable' && (
        <AccountPinDialog
          baseUrl={baseUrl}
          userId={userId}
          title="关闭 PIN 保护"
          description="输入当前设备的 PIN 后，会关闭这个账号的账号级 PIN 策略，并清除当前设备保存的本机 PIN。"
          submitLabel="关闭 PIN 保护"
          embedded
          onCancel={() => setDialogMode(undefined)}
          onSuccess={async () => {
            await mx.setAccountData(
              AccountDataEvent.CinnyAccountPinPolicy,
              createDisabledAccountPinPolicyContent()
            );
            setDialogMode(undefined);
          }}
        />
      )}
    </Box>
  );
}
