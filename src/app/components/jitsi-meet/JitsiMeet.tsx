import React from 'react';
import {
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
} from 'folds';
import { CinnyJitsiMeetInfo, getJitsiMeetJoinUrl } from '../../utils/jitsiMeet';
import { openExternalUrl } from '../../utils/desktop';
import * as css from './JitsiMeet.css';

type JitsiMeetCardProps = {
  meeting: CinnyJitsiMeetInfo;
  displayName?: string;
  avatarUrl?: string;
};
export function JitsiMeetCard({ meeting, displayName, avatarUrl }: JitsiMeetCardProps) {
  const joinUrl = getJitsiMeetJoinUrl(meeting.url, { displayName, avatarUrl });
  const handleJoin = () => {
    void openExternalUrl(joinUrl).catch(() => undefined);
  };

  return (
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
              onClick={handleJoin}
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
