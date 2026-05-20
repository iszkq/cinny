import React, { ReactNode } from 'react';
import FocusTrap from 'focus-trap-react';
import { Box, Icon, IconButton, Icons, Overlay, OverlayBackdrop, OverlayCenter, Text } from 'folds';
import { stopPropagation } from '../../utils/keyboard';
import * as css from './style.css';

type PinLockCardProps = {
  title: string;
  description: string;
  accountLabel?: string;
  eyebrow?: string;
  requestClose?: () => void;
  children: ReactNode;
};

export function PinLockCard({
  title,
  description,
  accountLabel,
  eyebrow = '本机 PIN 保护',
  requestClose,
  children,
}: PinLockCardProps) {
  return (
    <Box className={css.Card} direction="Column" gap="500">
      <Box direction="Column" gap="300">
        <Box justifyContent="SpaceBetween" alignItems="Start" gap="300">
          <Text className={css.Eyebrow} as="span">
            {eyebrow}
          </Text>
          {requestClose && (
            <IconButton onClick={requestClose} variant="SurfaceVariant" size="300" radii="300">
              <Icon src={Icons.Cross} />
            </IconButton>
          )}
        </Box>
        <Box direction="Column" gap="150">
          <Text size="H4">{title}</Text>
          <Text size="T300" priority="300">
            {description}
          </Text>
          {accountLabel && (
            <Text className={css.AccountLabel} size="T200" priority="400">
              {accountLabel}
            </Text>
          )}
        </Box>
      </Box>
      {children}
    </Box>
  );
}

type PinLockDialogShellModeProps = PinLockCardProps & {
  embedded?: boolean;
};

export function PinLockDialogShell({
  requestClose,
  embedded,
  ...props
}: PinLockDialogShellModeProps) {
  const card = <PinLockCard requestClose={requestClose} {...props} />;

  if (embedded) {
    return (
      <Box className={css.EmbeddedOverlay}>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: Boolean(requestClose),
            onDeactivate: requestClose,
            escapeDeactivates: requestClose ? stopPropagation : false,
          }}
        >
          {card}
        </FocusTrap>
      </Box>
    );
  }

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Box className={css.DialogViewport} justifyContent="Center">
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: Boolean(requestClose),
              onDeactivate: requestClose,
              escapeDeactivates: requestClose ? stopPropagation : false,
            }}
          >
            {card}
          </FocusTrap>
        </Box>
      </OverlayCenter>
    </Overlay>
  );
}
