import React, { useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
  config,
  toRem,
} from 'folds';
import { AUTHOR_CONTACT_ID } from '../constants/projectInfo';
import { stopPropagation } from '../utils/keyboard';
import AuthorContactQR from '../../../public/res/author-contact-qr.png';

type AuthorContactButtonProps = Omit<React.ComponentProps<typeof Button>, 'onClick'>;

export function AuthorContactButton({
  children,
  ...buttonProps
}: AuthorContactButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button {...buttonProps} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => setOpen(false),
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
              }}
            >
              <Dialog variant="Surface">
                <Header
                  style={{
                    padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                    borderBottomWidth: config.borderWidth.B300,
                  }}
                  variant="Surface"
                  size="500"
                >
                  <Box grow="Yes">
                    <Text size="H4">联系作者</Text>
                  </Box>
                  <IconButton size="300" radii="300" onClick={() => setOpen(false)}>
                    <Icon src={Icons.Cross} />
                  </IconButton>
                </Header>
                <Box
                  style={{
                    width: toRem(320),
                    padding: config.space.S400,
                  }}
                  direction="Column"
                  gap="400"
                >
                  <Box direction="Column" gap="300" alignItems="Center">
                    <img
                      src={AuthorContactQR}
                      alt="作者联系二维码"
                      style={{
                        width: '100%',
                        maxWidth: toRem(220),
                        borderRadius: toRem(16),
                      }}
                    />
                    <Box direction="Column" gap="100" alignItems="Center">
                      <Text size="L400">作者联系方式</Text>
                      <Text size="T300">{AUTHOR_CONTACT_ID}</Text>
                    </Box>
                  </Box>
                </Box>
              </Dialog>
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
    </>
  );
}
