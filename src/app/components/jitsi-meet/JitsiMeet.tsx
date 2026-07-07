import React, { useMemo, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
} from 'folds';
import { CinnyJitsiMeetInfo, getJitsiMeetEmbedUrl } from '../../utils/jitsiMeet';
import { copyToClipboard } from '../../utils/dom';
import { openExternalUrl } from '../../utils/desktop';
import { stopPropagation } from '../../utils/keyboard';
import * as css from './JitsiMeet.css';

type JitsiMeetDialogProps = {
  meeting: CinnyJitsiMeetInfo;
  displayName?: string;
  avatarUrl?: string;
  requestClose: () => void;
};
export function JitsiMeetDialog({
  meeting,
  displayName,
  avatarUrl,
  requestClose,
}: JitsiMeetDialogProps) {
  const embedUrl = useMemo(
    () => getJitsiMeetEmbedUrl(meeting.url, { displayName, avatarUrl }),
    [meeting.url, displayName, avatarUrl]
  );

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter className={css.OverlayCenter}>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog className={css.Dialog} variant="Surface">
            <Box className={css.Shell} direction="Column">
              <Box className={css.Header} alignItems="Center" gap="300">
                <Box className={css.HeaderIcon} shrink="No">
                  <Icon size="300" src={Icons.VideoCamera} filled />
                </Box>
                <Box grow="Yes" direction="Column" gap="100" style={{ minWidth: 0 }}>
                  <Text size="H4" truncate>
                    {'\u89c6\u9891\u4f1a\u8bae'}
                  </Text>
                  <Box className={css.DomainPill}>
                    <Text as="span" size="T200" truncate>
                      {meeting.domain}
                    </Text>
                  </Box>
                </Box>
                <Box shrink="No" gap="100">
                  <TooltipProvider
                    position="Bottom"
                    offset={4}
                    tooltip={
                      <Tooltip>
                        <Text>{'\u590d\u5236\u94fe\u63a5'}</Text>
                      </Tooltip>
                    }
                  >
                    {(triggerRef) => (
                      <IconButton
                        ref={triggerRef}
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                        onClick={() => copyToClipboard(meeting.url)}
                      >
                        <Icon src={Icons.Link} />
                      </IconButton>
                    )}
                  </TooltipProvider>
                  <TooltipProvider
                    position="Bottom"
                    offset={4}
                    tooltip={
                      <Tooltip>
                        <Text>{'\u5728\u6d4f\u89c8\u5668\u6253\u5f00'}</Text>
                      </Tooltip>
                    }
                  >
                    {(triggerRef) => (
                      <IconButton
                        ref={triggerRef}
                        variant="SurfaceVariant"
                        size="300"
                        radii="300"
                        onClick={() => void openExternalUrl(embedUrl).catch(() => undefined)}
                      >
                        <Icon src={Icons.External} />
                      </IconButton>
                    )}
                  </TooltipProvider>
                  <IconButton
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                    onClick={requestClose}
                  >
                    <Icon src={Icons.Cross} />
                  </IconButton>
                </Box>
              </Box>
              <Box className={css.FrameWrap}>
                <iframe
                  className={css.Frame}
                  title="Jitsi Meet"
                  src={embedUrl}
                  allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write;"
                  sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals allow-downloads"
                />
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

type JitsiMeetCardProps = {
  meeting: CinnyJitsiMeetInfo;
  displayName?: string;
  avatarUrl?: string;
};
export function JitsiMeetCard({ meeting, displayName, avatarUrl }: JitsiMeetCardProps) {
  const [open, setOpen] = useState(false);
  const joinUrl = useMemo(
    () => getJitsiMeetEmbedUrl(meeting.url, { displayName, avatarUrl }),
    [meeting.url, displayName, avatarUrl]
  );

  return (
    <>
      <Box className={css.MeetingCard} direction="Column">
        <Box className={css.MeetingCardMain} alignItems="Center" gap="300">
          <Box className={css.MeetingCardIcon}>
            <Icon size="300" src={Icons.VideoCamera} filled />
          </Box>
          <Box grow="Yes" direction="Column" gap="100" style={{ minWidth: 0 }}>
            <Text size="B400" truncate>
              {'\u89c6\u9891\u4f1a\u8bae'}
            </Text>
            <Text size="T200" priority="300" truncate>
              {meeting.domain}
            </Text>
          </Box>
          <TooltipProvider
            position="Top"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>{'\u5728\u6d4f\u89c8\u5668\u6253\u5f00'}</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                className={css.CardExternalButton}
                ref={triggerRef}
                variant="Surface"
                size="300"
                radii="300"
                onClick={() => void openExternalUrl(joinUrl).catch(() => undefined)}
              >
                <Icon src={Icons.External} />
              </IconButton>
            )}
          </TooltipProvider>
        </Box>
        <Box className={css.MeetingCardFooter}>
          <Button
            className={css.JoinButton}
            size="400"
            variant="Success"
            fill="Soft"
            radii="300"
            before={<Icon size="100" src={Icons.VideoCamera} filled />}
            onClick={() => setOpen(true)}
          >
            <Text as="span" size="B300">
              {'\u52a0\u5165\u4f1a\u8bae'}
            </Text>
          </Button>
        </Box>
      </Box>
      {open && (
        <JitsiMeetDialog
          meeting={meeting}
          displayName={displayName}
          avatarUrl={avatarUrl}
          requestClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

type StartJitsiMeetButtonProps = {
  disabled?: boolean;
  sending?: boolean;
  onStart: () => void;
};
export const StartJitsiMeetButton = React.forwardRef<
  HTMLButtonElement,
  StartJitsiMeetButtonProps
>(({ disabled, sending, onStart }, ref) => {
  return (
    <IconButton ref={ref} fill="None" onClick={onStart} disabled={disabled || sending}>
      {sending ? <Spinner size="200" /> : <Icon size="400" src={Icons.VideoCamera} />}
    </IconButton>
  );
});

StartJitsiMeetButton.displayName = 'StartJitsiMeetButton';
