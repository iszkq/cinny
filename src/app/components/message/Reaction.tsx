import React from 'react';
import { Box, Text, as } from 'folds';
import classNames from 'classnames';
import { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import * as css from './Reaction.css';
import { getHexcodeForEmoji, getShortcodeFor } from '../../plugins/emoji';
import { getMemberDisplayName } from '../../utils/room';
import {
  eventWithShortcode,
  getMxIdLocalPart,
  isHttpUrl,
  isMxcUrl,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { useStableMediaUrl } from '../emoji-board/components/useStableMediaUrl';

export const Reaction = as<
  'button',
  {
    mx: MatrixClient;
    count: number;
    reaction: string;
    useAuthentication?: boolean;
  }
>(({ className, mx, count, reaction, useAuthentication, ...props }, ref) => {
  const customEmoji = isMxcUrl(reaction) || isHttpUrl(reaction);
  const originalMediaUrl = isMxcUrl(reaction)
    ? (mxcUrlToHttp(mx, reaction, useAuthentication) ?? undefined)
    : isHttpUrl(reaction)
      ? reaction
      : undefined;
  const thumbnailMediaUrl = isMxcUrl(reaction)
    ? (mxcUrlToHttp(mx, reaction, useAuthentication, 48, 48, 'scale') ?? undefined)
    : undefined;
  const { displayUrl, handleLoad, handleError, requestKey } = useStableMediaUrl(
    originalMediaUrl,
    thumbnailMediaUrl,
    {
      disableObjectUrlCache: true,
    }
  );

  return (
    <Box
      as="button"
      className={classNames(css.Reaction, className)}
      alignItems="Center"
      shrink="No"
      gap="200"
      {...props}
      ref={ref}
    >
      <Text className={css.ReactionText} as="span" size="T400">
        {customEmoji ? (
          <img
            key={requestKey}
            className={css.ReactionImg}
            src={displayUrl ?? originalMediaUrl ?? thumbnailMediaUrl ?? reaction}
            alt={reaction}
            decoding="async"
            onLoad={handleLoad}
            onError={handleError}
          />
        ) : (
          <Text as="span" size="Inherit" truncate>
            {reaction}
          </Text>
        )}
      </Text>
      <Text as="span" size="T300">
        {count}
      </Text>
    </Box>
  );
});

type ReactionTooltipMsgProps = {
  room: Room;
  reaction: string;
  events: MatrixEvent[];
};

export function ReactionTooltipMsg({ room, reaction, events }: ReactionTooltipMsgProps) {
  const shortCodeEvt = events.find(eventWithShortcode);
  const shortcode =
    shortCodeEvt?.getContent().shortcode ??
    getShortcodeFor(getHexcodeForEmoji(reaction)) ??
    reaction;
  const names = events.map(
    (ev: MatrixEvent) =>
      getMemberDisplayName(room, ev.getSender() ?? 'Unknown') ??
      getMxIdLocalPart(ev.getSender() ?? 'Unknown') ??
      'Unknown'
  );

  return (
    <>
      {names.length === 1 && <b>{names[0]}</b>}
      {names.length === 2 && (
        <>
          <b>{names[0]}</b>
          <Text as="span" size="Inherit" priority="300">
            {' and '}
          </Text>
          <b>{names[1]}</b>
        </>
      )}
      {names.length === 3 && (
        <>
          <b>{names[0]}</b>
          <Text as="span" size="Inherit" priority="300">
            {', '}
          </Text>
          <b>{names[1]}</b>
          <Text as="span" size="Inherit" priority="300">
            {' and '}
          </Text>
          <b>{names[2]}</b>
        </>
      )}
      {names.length > 3 && (
        <>
          <b>{names[0]}</b>
          <Text as="span" size="Inherit" priority="300">
            {', '}
          </Text>
          <b>{names[1]}</b>
          <Text as="span" size="Inherit" priority="300">
            {', '}
          </Text>
          <b>{names[2]}</b>
          <Text as="span" size="Inherit" priority="300">
            {' and '}
          </Text>
          <b>{names.length - 3} others</b>
        </>
      )}
      <Text as="span" size="Inherit" priority="300">
        {' reacted with '}
      </Text>
      :<b>{shortcode}</b>:
    </>
  );
}
