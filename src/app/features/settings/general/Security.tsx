import React, { FormEventHandler, useMemo, useState } from 'react';
import { Box, Button, Input, Switch, Text, color } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getFallbackSession } from '../../../state/sessions';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';
import { Modal500 } from '../../../components/Modal500';
import {
  changeAccountPin,
  disableAccountPin,
  enableAccountPin,
  getAccountPinKey,
  isPinCodeFormatValid,
  lockScreenForAccount,
  supportsPinLock,
} from '../../../utils/pinLock';
import { usePinLockSnapshot } from '../../../hooks/usePinLockSnapshot';

type SecurityProps = {
  requestClose: () => void;
};

type PinDialogMode = 'setup' | 'change' | 'disable' | undefined;

type PinDialogShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  requestClose: () => void;
};

function PinDialogShell({ title, description, children, requestClose }: PinDialogShellProps) {
  return (
    <Modal500 requestClose={requestClose}>
      <Box direction="Column" gap="400">
        <Box direction="Column" gap="100">
          <Text size="H4">{title}</Text>
          <Text size="T300" priority="300">
            {description}
          </Text>
        </Box>
        {children}
      </Box>
    </Modal500>
  );
}

type DialogActionsProps = {
  submitting: boolean;
  submitLabel: string;
  requestClose: () => void;
};

function DialogActions({ submitting, submitLabel, requestClose }: DialogActionsProps) {
  return (
    <Box justifyContent="End" gap="200">
      <Button
        type="button"
        variant="Secondary"
        fill="Soft"
        onClick={requestClose}
        disabled={submitting}
      >
        <Text size="B300">取消</Text>
      </Button>
      <Button type="submit" variant="Primary" disabled={submitting}>
        <Text size="B300">{submitting ? '处理中...' : submitLabel}</Text>
      </Button>
    </Box>
  );
}

function PinError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <Text size="T200" style={{ color: color.Critical.Main }}>
      {message}
    </Text>
  );
}

type SetupPinDialogProps = {
  baseUrl: string;
  userId: string;
  requestClose: () => void;
};

function SetupPinDialog({ baseUrl, userId, requestClose }: SetupPinDialogProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();

    if (!supportsPinLock()) {
      setError('当前运行环境不支持 Web Crypto，无法启用 PIN 锁。');
      return;
    }
    if (!isPinCodeFormatValid(pin)) {
      setError('PIN 码需要为 4 到 12 位数字。');
      return;
    }
    if (pin !== confirmPin) {
      setError('两次输入的 PIN 码不一致。');
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      await enableAccountPin(baseUrl, userId, pin);
      requestClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '启用 PIN 锁失败，请重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PinDialogShell
      title="启用账号 PIN 锁"
      description="只对当前账号生效。退出后再次登录这个账号时，会先要求输入 PIN 码。"
      requestClose={requestClose}
    >
      <Box as="form" onSubmit={handleSubmit} direction="Column" gap="300">
        <Box direction="Column" gap="100">
          <Text size="T300">新 PIN 码</Text>
          <Input
            autoFocus
            required
            outlined
            size="500"
            type="password"
            inputMode="numeric"
            maxLength={12}
            autoComplete="new-password"
            placeholder="请输入 4 到 12 位数字"
            value={pin}
            onChange={(evt) => setPin(evt.currentTarget.value)}
          />
        </Box>
        <Box direction="Column" gap="100">
          <Text size="T300">确认 PIN 码</Text>
          <Input
            required
            outlined
            size="500"
            type="password"
            inputMode="numeric"
            maxLength={12}
            autoComplete="new-password"
            placeholder="请再次输入 PIN 码"
            value={confirmPin}
            onChange={(evt) => setConfirmPin(evt.currentTarget.value)}
          />
        </Box>
        <PinError message={error} />
        <DialogActions
          submitting={submitting}
          submitLabel="启用 PIN 锁"
          requestClose={requestClose}
        />
      </Box>
    </PinDialogShell>
  );
}

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
      setError('新 PIN 码需要为 4 到 12 位数字。');
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
      setError(err instanceof Error ? err.message : '修改 PIN 码失败，请重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PinDialogShell
      title="修改账号 PIN 码"
      description="修改后，当前账号后续登录和锁屏解锁都会使用新的 PIN 码。"
      requestClose={requestClose}
    >
      <Box as="form" onSubmit={handleSubmit} direction="Column" gap="300">
        <Box direction="Column" gap="100">
          <Text size="T300">当前 PIN 码</Text>
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
          <Text size="T300">新 PIN 码</Text>
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
          <Text size="T300">确认新 PIN 码</Text>
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
        </Box>
        <PinError message={error} />
        <DialogActions
          submitting={submitting}
          submitLabel="保存新 PIN 码"
          requestClose={requestClose}
        />
      </Box>
    </PinDialogShell>
  );
}

type DisablePinDialogProps = {
  baseUrl: string;
  userId: string;
  requestClose: () => void;
};

function DisablePinDialog({ baseUrl, userId, requestClose }: DisablePinDialogProps) {
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();

    setSubmitting(true);
    setError(undefined);

    try {
      await disableAccountPin(baseUrl, userId, pin);
      requestClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '关闭 PIN 锁失败，请重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PinDialogShell
      title="关闭账号 PIN 锁"
      description="关闭后，当前账号再次登录时将不再需要输入 PIN 码。"
      requestClose={requestClose}
    >
      <Box as="form" onSubmit={handleSubmit} direction="Column" gap="300">
        <Box direction="Column" gap="100">
          <Text size="T300">当前 PIN 码</Text>
          <Input
            autoFocus
            required
            outlined
            size="500"
            type="password"
            inputMode="numeric"
            maxLength={12}
            autoComplete="current-password"
            value={pin}
            onChange={(evt) => setPin(evt.currentTarget.value)}
          />
        </Box>
        <PinError message={error} />
        <DialogActions
          submitting={submitting}
          submitLabel="关闭 PIN 锁"
          requestClose={requestClose}
        />
      </Box>
    </PinDialogShell>
  );
}

export function Security({ requestClose }: SecurityProps) {
  const mx = useMatrixClient();
  const session = getFallbackSession();
  const { protectedAccountKeys } = usePinLockSnapshot();
  const [dialogMode, setDialogMode] = useState<PinDialogMode>();

  const userId = mx.getUserId();
  const baseUrl = session?.baseUrl;
  const accountKey =
    baseUrl && userId ? getAccountPinKey(baseUrl, userId) : undefined;
  const enabled = useMemo(
    () => !!accountKey && protectedAccountKeys.includes(accountKey),
    [accountKey, protectedAccountKeys]
  );

  if (!userId || !baseUrl) {
    return null;
  }

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">账号安全</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="账号 PIN 锁"
          description="为当前账号单独启用本地 PIN 保护。退出后再次登录这个账号时，会先要求输入 PIN。"
          after={
            <Switch
              variant="Primary"
              value={enabled}
              onChange={() => setDialogMode(enabled ? 'disable' : 'setup')}
            />
          }
        />
        {enabled && (
          <SettingTile
            title="修改 PIN 码"
            description="建议使用只有你自己知道的 4 到 12 位数字。"
            after={
              <Button variant="Secondary" fill="Soft" size="300" onClick={() => setDialogMode('change')}>
                <Text size="B300">修改 PIN</Text>
              </Button>
            }
          />
        )}
        {enabled && (
          <SettingTile
            title="立即锁屏"
            description="锁定当前账号界面，重新查看内容前必须输入该账号的 PIN 码。"
            after={
              <Button
                variant="Primary"
                fill="Soft"
                size="300"
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
        <SettingTile
          description="忘记 PIN 时，可通过“清空全部本地数据”恢复，但这会同时删除本地会话和缓存。"
        />
      </SequenceCard>

      {dialogMode === 'setup' && (
        <SetupPinDialog baseUrl={baseUrl} userId={userId} requestClose={() => setDialogMode(undefined)} />
      )}
      {dialogMode === 'change' && (
        <ChangePinDialog baseUrl={baseUrl} userId={userId} requestClose={() => setDialogMode(undefined)} />
      )}
      {dialogMode === 'disable' && (
        <DisablePinDialog baseUrl={baseUrl} userId={userId} requestClose={() => setDialogMode(undefined)} />
      )}
    </Box>
  );
}
