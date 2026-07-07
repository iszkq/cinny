import React, { FormEventHandler, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import { CinnyJitsiMeetInfo, getJitsiMeetJoinUrl } from '../../utils/jitsiMeet';
import { openExternalUrlInNewWindow } from '../../utils/desktop';
import { stopPropagation } from '../../utils/keyboard';
import * as css from './JitsiMeet.css';

const DEFAULT_MEETING_TITLE = '\u4f1a\u8bae';

type JitsiMeetCardProps = {
  meeting: CinnyJitsiMeetInfo;
  displayName?: string;
  avatarUrl?: string;
};
export function JitsiMeetCard({ meeting, displayName, avatarUrl }: JitsiMeetCardProps) {
  const meetingTitle = meeting.title || DEFAULT_MEETING_TITLE;
  const joinUrl = getJitsiMeetJoinUrl(meeting.url, {
    displayName,
    avatarUrl,
    subject: meetingTitle,
  });
  const handleJoin = () => {
    void openExternalUrlInNewWindow(joinUrl, meeting.url, meetingTitle).catch(() => undefined);
  };

  return (
    <Box className={css.MeetingCard} direction="Column">
      <Box className={css.MeetingCardMain} alignItems="Center" gap="300">
        <Box className={css.MeetingCardIcon}>
          <Icon size="300" src={Icons.VideoCamera} filled />
        </Box>
        <Box grow="Yes" direction="Column" gap="100" style={{ minWidth: 0 }}>
          <Text size="B400" truncate>
            {meetingTitle}
          </Text>
          <Text size="T200" priority="300" truncate>
            {meeting.domain}
          </Text>
        </Box>
      </Box>
      <Box className={css.MeetingCardFooter}>
        <Button
          className={css.JoinButton}
          size="400"
          variant="Success"
          fill="Soft"
          radii="300"
          before={<Icon size="100" src={Icons.VideoCamera} filled />}
          onClick={handleJoin}
        >
          <Text as="span" size="B300">
            {'\u52a0\u5165\u4f1a\u8bae'}
          </Text>
        </Button>
      </Box>
    </Box>
  );
}

type StartJitsiMeetPromptProps = {
  submitting?: boolean;
  error?: string;
  requestClose: () => void;
  onSubmit: (title: string) => void;
};
export function StartJitsiMeetPrompt({
  submitting,
  error,
  requestClose,
  onSubmit,
}: StartJitsiMeetPromptProps) {
  const [title, setTitle] = useState('');

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (submitting) return;

    onSubmit(title.trim() || DEFAULT_MEETING_TITLE);
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog
            variant="Surface"
            style={{
              width: 'min(420px, calc(100vw - 32px))',
              maxWidth: 'calc(100vw - 32px)',
              overflow: 'hidden',
            }}
          >
            <Box
              as="form"
              onSubmit={handleSubmit}
              direction="Column"
              style={{ width: '100%', minWidth: 0 }}
            >
              <Header
                style={{
                  padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                  borderBottomWidth: config.borderWidth.B300,
                  minWidth: 0,
                }}
                variant="Surface"
                size="500"
              >
                <Box grow="Yes" style={{ minWidth: 0 }}>
                  <Text size="H4">{'\u53d1\u8d77\u4f1a\u8bae'}</Text>
                </Box>
                <IconButton size="300" onClick={requestClose} radii="300" disabled={submitting}>
                  <Icon src={Icons.Cross} />
                </IconButton>
              </Header>
              <Box
                style={{
                  boxSizing: 'border-box',
                  padding: config.space.S400,
                  width: '100%',
                  minWidth: 0,
                }}
                direction="Column"
                gap="400"
              >
                <Box direction="Column" gap="100" style={{ width: '100%', minWidth: 0 }}>
                  <Text size="L400">{'\u4f1a\u8bae\u540d\u79f0'}</Text>
                  <Input
                    autoFocus
                    value={title}
                    onChange={(evt) => setTitle(evt.currentTarget.value)}
                    placeholder={DEFAULT_MEETING_TITLE}
                    maxLength={120}
                    size="400"
                    radii="300"
                    readOnly={submitting}
                    style={{ width: '100%', minWidth: 0 }}
                  />
                  {error && (
                    <Text size="T200" style={{ color: color.Critical.Main }}>
                      {error}
                    </Text>
                  )}
                </Box>
                <Box
                  justifyContent="End"
                  gap="200"
                  wrap="Wrap"
                  style={{ width: '100%', minWidth: 0 }}
                >
                  <Button
                    type="button"
                    variant="Secondary"
                    fill="Soft"
                    radii="300"
                    onClick={requestClose}
                    disabled={submitting}
                  >
                    <Text as="span" size="B300">
                      {'\u53d6\u6d88'}
                    </Text>
                  </Button>
                  <Button
                    type="submit"
                    variant="Success"
                    radii="300"
                    before={submitting ? <Spinner size="200" fill="Solid" /> : undefined}
                    disabled={submitting}
                  >
                    <Text as="span" size="B300">
                      {submitting ? '\u53d1\u9001\u4e2d...' : '\u53d1\u9001'}
                    </Text>
                  </Button>
                </Box>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
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
