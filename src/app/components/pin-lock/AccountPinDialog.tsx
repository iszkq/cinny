import React, { FormEventHandler, useState } from 'react';
import { Box, Button, Input, Text, color } from 'folds';
import { Modal500 } from '../Modal500';
import {
  getAccountPinLabel,
  isPinCodeFormatValid,
  verifyAccountPin,
} from '../../utils/pinLock';

type AccountPinDialogProps = {
  baseUrl: string;
  userId: string;
  title: string;
  description: string;
  submitLabel: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSuccess: () => void;
};

export function AccountPinDialog({
  baseUrl,
  userId,
  title,
  description,
  submitLabel,
  cancelLabel = '取消',
  onCancel,
  onSuccess,
}: AccountPinDialogProps) {
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
      const verified = await verifyAccountPin(baseUrl, userId, pin);
      if (!verified) {
        setError('PIN 码错误，请重试。');
        return;
      }

      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal500 requestClose={onCancel ?? (() => undefined)}>
      <Box as="form" onSubmit={handleSubmit} direction="Column" gap="400">
        <Box direction="Column" gap="100">
          <Text size="H4">{title}</Text>
          <Text size="T300" priority="300">
            {description}
          </Text>
          <Text size="T200" priority="400">
            {getAccountPinLabel(baseUrl, userId)}
          </Text>
        </Box>

        <Box direction="Column" gap="100">
          <Text size="T300">PIN 码</Text>
          <Input
            autoFocus
            required
            outlined
            size="500"
            type="password"
            inputMode="numeric"
            maxLength={12}
            autoComplete="current-password"
            placeholder="请输入 PIN 码"
            value={pin}
            onChange={(evt) => setPin(evt.currentTarget.value)}
          />
          {error && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              {error}
            </Text>
          )}
        </Box>

        <Box justifyContent="End" gap="200">
          {onCancel && (
            <Button
              type="button"
              variant="Secondary"
              fill="Soft"
              onClick={onCancel}
              disabled={submitting}
            >
              <Text size="B300">{cancelLabel}</Text>
            </Button>
          )}
          <Button type="submit" variant="Primary" disabled={submitting}>
            <Text size="B300">{submitting ? '验证中...' : submitLabel}</Text>
          </Button>
        </Box>
      </Box>
    </Modal500>
  );
}
