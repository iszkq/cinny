import React, { FormEventHandler, useState } from 'react';
import { Box, Button, Input, Text, color } from 'folds';
import {
  AccountPinConfig,
  getAccountPinLabel,
  isPinCodeFormatValid,
  verifyAccountPin,
  verifyPinConfig,
} from '../../utils/pinLock';
import { PinLockDialogShell } from './PinLockShell';
import * as css from './style.css';

type AccountPinFormProps = {
  baseUrl: string;
  userId: string;
  submitLabel: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSuccess: () => void | Promise<void>;
  autoFocus?: boolean;
  pinConfig?: AccountPinConfig;
};

export function AccountPinForm({
  baseUrl,
  userId,
  submitLabel,
  cancelLabel = '取消',
  onCancel,
  onSuccess,
  autoFocus,
  pinConfig,
}: AccountPinFormProps) {
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();

    if (!isPinCodeFormatValid(pin)) {
      setError('PIN 码需要为 4 到 12 位数字。');
      return;
    }

    setSubmitting(true);
    setError(undefined);

    try {
      const verified = pinConfig
        ? await verifyPinConfig(pin, pinConfig)
        : await verifyAccountPin(baseUrl, userId, pin);
      if (!verified) {
        setError('PIN 码错误，请重试。');
        return;
      }

      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN 校验失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="300">
      <Box direction="Column" gap="100">
        <Text size="L400">PIN 码</Text>
        <Input
          autoFocus={autoFocus}
          required
          outlined
          size="500"
          type="password"
          inputMode="numeric"
          maxLength={12}
          autoComplete="current-password"
          placeholder="请输入 4 到 12 位数字"
          value={pin}
          onChange={(evt) => setPin(evt.currentTarget.value)}
        />
        <Text size="T200" priority="400">
          仅接受数字输入，用于解锁当前设备上的这个账号。
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
          <Text size="B300">{submitting ? '正在验证...' : submitLabel}</Text>
        </Button>
      </Box>
    </Box>
  );
}

type AccountPinDialogProps = {
  baseUrl: string;
  userId: string;
  title: string;
  description: string;
  submitLabel: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSuccess: () => void | Promise<void>;
  pinConfig?: AccountPinConfig;
  embedded?: boolean;
};

export function AccountPinDialog({
  baseUrl,
  userId,
  title,
  description,
  submitLabel,
  cancelLabel,
  onCancel,
  onSuccess,
  pinConfig,
  embedded,
}: AccountPinDialogProps) {
  return (
    <PinLockDialogShell
      title={title}
      description={description}
      accountLabel={getAccountPinLabel(baseUrl, userId)}
      requestClose={onCancel}
      embedded={embedded}
    >
      <AccountPinForm
        baseUrl={baseUrl}
        userId={userId}
        submitLabel={submitLabel}
        cancelLabel={cancelLabel}
        onCancel={onCancel}
        onSuccess={onSuccess}
        autoFocus
        pinConfig={pinConfig}
      />
    </PinLockDialogShell>
  );
}
