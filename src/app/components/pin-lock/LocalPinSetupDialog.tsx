import React, { FormEventHandler, useState } from 'react';
import { Box, Button, Input, Text, color } from 'folds';
import {
  AccountPinConfig,
  enableAccountPin,
  isPinCodeFormatValid,
  supportsPinLock,
} from '../../utils/pinLock';
import { PinLockDialogShell } from './PinLockShell';
import * as css from './style.css';

type LocalPinSetupFormProps = {
  baseUrl: string;
  userId: string;
  submitLabel: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSuccess: (config: AccountPinConfig) => void | Promise<void>;
  autoFocus?: boolean;
};

export function LocalPinSetupForm({
  baseUrl,
  userId,
  submitLabel,
  cancelLabel = '取消',
  onCancel,
  onSuccess,
  autoFocus,
}: LocalPinSetupFormProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();

    if (!supportsPinLock()) {
      setError('当前环境不支持本地 PIN 加密能力。');
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
      const config = await enableAccountPin(baseUrl, userId, pin);
      await onSuccess(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启用 PIN 失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="300">
      <Box direction="Column" gap="100">
        <Text size="L400">新 PIN 码</Text>
        <Input
          autoFocus={autoFocus}
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
        <Text size="L400">确认 PIN 码</Text>
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
        <Text size="T200" priority="400">
          这个 PIN 只保存在当前设备，本身不会上传到服务器。
        </Text>
        {error && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            {error}
          </Text>
        )}
      </Box>

      <Box className={css.ActionRow}>
        {onCancel && (
          <Button
            type="button"
            variant="Secondary"
            fill="Soft"
            size="400"
            onClick={onCancel}
            disabled={submitting}
          >
            <Text size="B300">{cancelLabel}</Text>
          </Button>
        )}
        <Button type="submit" variant="Primary" size="400" disabled={submitting}>
          <Text size="B300">{submitting ? '正在保存...' : submitLabel}</Text>
        </Button>
      </Box>
    </Box>
  );
}

type LocalPinSetupDialogProps = {
  baseUrl: string;
  userId: string;
  title: string;
  description: string;
  submitLabel: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSuccess: (config: AccountPinConfig) => void | Promise<void>;
  embedded?: boolean;
};

export function LocalPinSetupDialog({
  baseUrl,
  userId,
  title,
  description,
  submitLabel,
  cancelLabel,
  onCancel,
  onSuccess,
  embedded,
}: LocalPinSetupDialogProps) {
  return (
    <PinLockDialogShell
      title={title}
      description={description}
      requestClose={onCancel}
      embedded={embedded}
    >
      <LocalPinSetupForm
        baseUrl={baseUrl}
        userId={userId}
        submitLabel={submitLabel}
        cancelLabel={cancelLabel}
        onCancel={onCancel}
        onSuccess={onSuccess}
        autoFocus
      />
    </PinLockDialogShell>
  );
}
