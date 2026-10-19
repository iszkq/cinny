import { CalculatorSettings } from '../../../components/calculator/CalculatorSettings';
import React, { FormEventHandler, useMemo, useState } from 'react';
import { Box, Button, Input, Switch, Text, color } from 'folds';
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
  clearLocalAccountPin,
  changeAccountPin,
  getAccountPinKey,
  getPinIdleMinutes,
  setPinIdleMinutes,
  getAccountPinLabel,
  isPinCodeFormatValid,
  lockScreenForAccount,
  supportsPinLock,
} from '../../../utils/pinLock';
import * as pinCss from '../../../components/pin-lock/style.css';

type SecurityProps = {
  requestClose: () => void;
};

type PinDialogMode = 'setup' | 'change' | 'disable' | undefined;

type ChangePinDialogProps = {
  baseUrl: string;
  userId: string;
  requestClose: () => void;
};

function ChangePinDialog({ baseUrl, userId, requestClose }: ChangePinDialogProps) {
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
      await changeAccountPin(baseUrl, userId, currentPin, nextPin);

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
      description="修改后，只有这台设备上的锁屏和下次登录验证使用新的 PIN，其他设备不受影响。"
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
  const { protectedAccountKeys } = usePinLockSnapshot();
  const [dialogMode, setDialogMode] = useState<PinDialogMode>();

  const userId = mx.getUserId();
  const baseUrl = session?.baseUrl;
  const pinSupported = supportsPinLock();
  const accountKey = baseUrl && userId ? getAccountPinKey(baseUrl, userId) : undefined;
  const localPinEnabled = useMemo(
    () => !!accountKey && protectedAccountKeys.includes(accountKey),
    [accountKey, protectedAccountKeys]
  );
  const accountPinEnabled = localPinEnabled;

  if (!pinSupported || !userId || !baseUrl) {
    return null;
  }

  return (
    <Box direction="Column" gap="100">
      {(import.meta.env.VITE_IOS_APP === 'true' || import.meta.env.VITE_ANDROID_APP === 'true') && <CalculatorSettings />}
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
              accountPinEnabled ? (
                '当前设备已开启 PIN 保护。其他设备可以独立设置，不受本机 PIN 影响。'
              ) : (
                '开启后仅保护当前设备。PIN 校验摘要只保存在本机，不会同步到服务器。'
              )
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
              : '这台设备尚未设置 PIN，可在此独立开启本机保护。'
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
            title="无操作后自动锁定"
            description="保持账号登录；达到所选时间后隐藏聊天，输入 PIN 恢复。切换到后台、最小化和电脑休眠也计入时间。"
            after={
              <select
                aria-label="自动锁定时间"
                value={getPinIdleMinutes(baseUrl, userId)}
                onChange={(event) => setPinIdleMinutes(baseUrl, userId, Number(event.target.value))}
              >
                <option value={1}>1 分钟</option>
                <option value={5}>5 分钟</option>
                <option value={10}>10 分钟</option>
              </select>
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
            PIN 只保护当前设备；开启、修改或关闭都不会影响其他设备。
          </Text>
          <Text size="T300" priority="300">
            本版本仅在当前设备保存 PIN 校验摘要，不保存明文 PIN，也不会上传或同步。
          </Text>
          <Text size="T300" priority="300">
            如果忘记 PIN，可退出后重新登录，再验证设备并设置新的本机 PIN。设备验证需另一台已验证设备或恢复密钥；未备份的本机加密密钥可能随退出丢失。
          </Text>
        </Box>
      </SequenceCard>

      {dialogMode === 'setup' && (
        <LocalPinSetupDialog
          baseUrl={baseUrl}
          userId={userId}
          title="开启本机 PIN 保护"
          description="为当前设备设置独立 PIN，不会改变其他设备的设置。"
          submitLabel="开启 PIN 保护"
          onCancel={() => setDialogMode(undefined)}
          embedded
          onSuccess={() => {
            setDialogMode(undefined);
          }}
        />
      )}
      {dialogMode === 'change' && (
        <ChangePinDialog
          baseUrl={baseUrl}
          userId={userId}
          requestClose={() => setDialogMode(undefined)}
        />
      )}
      {dialogMode === 'disable' && (
        <AccountPinDialog
          baseUrl={baseUrl}
          userId={userId}
          title="关闭 PIN 保护"
          description="验证当前设备的 PIN 后，仅关闭本机 PIN 保护，其他设备不受影响。"
          submitLabel="关闭 PIN 保护"
          embedded
          onCancel={() => setDialogMode(undefined)}
          onSuccess={() => {
            clearLocalAccountPin(baseUrl, userId);
            setDialogMode(undefined);
          }}
        />
      )}
    </Box>
  );
}
