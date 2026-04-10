import React from 'react';
import { Icon, IconButton, Icons, Line, Text, Tooltip, TooltipProvider } from 'folds';
import { useAtom } from 'jotai';
import * as css from './styles.css';
import { callChatAtom } from '../../state/callEmbed';

export function ControlDivider() {
  return (
    <Line variant="SurfaceVariant" size="300" direction="Vertical" className={css.ControlDivider} />
  );
}

type MicrophoneButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function MicrophoneButton({ enabled, onToggle }: MicrophoneButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">
            {enabled ? '\u5173\u95ed\u9ea6\u514b\u98ce' : '\u6253\u5f00\u9ea6\u514b\u98ce'}
          </Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Surface' : 'Warning'}
          fill="Soft"
          radii="400"
          size="400"
          onClick={() => onToggle()}
          outlined
        >
          <Icon size="400" src={enabled ? Icons.Mic : Icons.MicMute} filled={!enabled} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type SoundButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function SoundButton({ enabled, onToggle }: SoundButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">
            {enabled ? '\u5173\u95ed\u626c\u58f0\u5668' : '\u6253\u5f00\u626c\u58f0\u5668'}
          </Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Surface' : 'Warning'}
          fill="Soft"
          radii="400"
          size="400"
          onClick={() => onToggle()}
          outlined
        >
          <Icon
            size="400"
            src={enabled ? Icons.Headphone : Icons.HeadphoneMute}
            filled={!enabled}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type VideoButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function VideoButton({ enabled, onToggle }: VideoButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">
            {enabled ? '\u5173\u95ed\u6444\u50cf\u5934' : '\u6253\u5f00\u6444\u50cf\u5934'}
          </Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Success' : 'Surface'}
          fill="Soft"
          radii="400"
          size="400"
          onClick={() => onToggle()}
          outlined
        >
          <Icon
            size="400"
            src={enabled ? Icons.VideoCamera : Icons.VideoCameraMute}
            filled={enabled}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type ScreenShareButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function ScreenShareButton({ enabled, onToggle }: ScreenShareButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">
            {enabled
              ? '\u505c\u6b62\u5c4f\u5e55\u5171\u4eab'
              : '\u5f00\u59cb\u5c4f\u5e55\u5171\u4eab'}
          </Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Success' : 'Surface'}
          fill="Soft"
          radii="400"
          size="400"
          onClick={() => onToggle()}
          outlined
        >
          <Icon size="400" src={Icons.ScreenShare} filled={enabled} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

export function ChatButton() {
  const [chat, setChat] = useAtom(callChatAtom);

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{chat ? '\u5173\u95ed\u804a\u5929' : '\u6253\u5f00\u804a\u5929'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={chat ? 'Success' : 'Surface'}
          fill="Soft"
          radii="400"
          size="400"
          onClick={() => setChat(!chat)}
          outlined
        >
          <Icon size="400" src={Icons.Message} filled={chat} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}
