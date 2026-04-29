import React from 'react';
import { useCallEmbed } from '../hooks/useCallEmbed';
import { CallStatus } from '../features/call-status';
import { useSelectedRoom } from '../hooks/router/useSelectedRoom';
import { isCompactScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';

export function CallStatusRenderer() {
  const callEmbed = useCallEmbed();
  const selectedRoom = useSelectedRoom();

  const screenSize = useScreenSizeContext();

  if (!callEmbed) return null;

  if (isCompactScreenSize(screenSize) && callEmbed.roomId === selectedRoom) return null;

  return <CallStatus callEmbed={callEmbed} />;
}
