import FocusTrap from 'focus-trap-react';
import {
  Avatar,
  Box,
  Button,
  config,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  MenuItem,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
} from 'folds';
import React, {
  ChangeEventHandler,
  MouseEventHandler,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAtomValue } from 'jotai';
import { useVirtualizer } from '@tanstack/react-virtual';
import { stopPropagation } from '../../utils/keyboard';
import { useDirects, useRooms } from '../../state/hooks/roomList';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { mDirectAtom } from '../../state/mDirectList';
import { VirtualTile } from '../../components/virtualizer';
import { getDirectRoomAvatarUrl, getRoomAvatarUrl } from '../../utils/room';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { nameInitials } from '../../utils/common';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { factoryRoomIdByAtoZ } from '../../utils/sort';
import {
  SearchItemStrGetter,
  useAsyncSearch,
  UseAsyncSearchOptions,
} from '../../hooks/useAsyncSearch';
import { highlightText, makeHighlightRegex } from '../../plugins/react-custom-html-parser';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useAllJoinedRoomsSet, useGetRoom } from '../../hooks/useGetRoom';
import { forwardMessagesToRooms, ForwardableMessage } from './forwardMessages';

const SEARCH_OPTS: UseAsyncSearchOptions = {
  limit: 500,
  matchOptions: {
    contain: true,
  },
  normalizeOptions: {
    ignoreWhitespace: false,
  },
};

type ForwardMessagesModalProps = {
  messages: ForwardableMessage[];
  requestClose: () => void;
  onComplete: () => void;
};

const CN = {
  title: '\u8f6c\u53d1\u6d88\u606f',
  searchPlaceholder: '\u641c\u7d22\u79c1\u804a\u6216\u623f\u95f4',
  directLabel: '\u79c1\u804a/\u76f4\u804a',
  roomLabel: '\u623f\u95f4',
  noTarget: '\u6682\u65e0\u53ef\u8f6c\u53d1\u76ee\u6807',
  noMatch: '\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u4f1a\u8bdd',
  needTarget: '\u8bf7\u9009\u62e9\u81f3\u5c11\u4e00\u4e2a\u76ee\u6807\u4f1a\u8bdd',
  cancel: '\u53d6\u6d88',
  forwarding: '\u8f6c\u53d1\u4e2d...',
  forward: '\u5f00\u59cb\u8f6c\u53d1',
} as const;

export function ForwardMessagesModal({
  messages,
  requestClose,
  onComplete,
}: ForwardMessagesModalProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const mDirects = useAtomValue(mDirectAtom);
  const rooms = useRooms(mx, allRoomsAtom, mDirects);
  const directs = useDirects(mx, allRoomsAtom, mDirects);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);

  const allRoomsSet = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allRoomsSet);

  const items = useMemo(
    () =>
      [...directs, ...rooms]
        .filter((roomId) => getRoom(roomId))
        .sort(factoryRoomIdByAtoZ(mx)),
    [directs, rooms, getRoom, mx]
  );

  const getRoomNameStr: SearchItemStrGetter<string> = useCallback(
    (roomId) => getRoom(roomId)?.name ?? roomId,
    [getRoom]
  );

  const [searchResult, searchRoom, resetSearch] = useAsyncSearch(
    items,
    getRoomNameStr,
    SEARCH_OPTS
  );
  const queryHighlightRegex = searchResult?.query
    ? makeHighlightRegex(searchResult.query.split(' '))
    : undefined;
  const visibleItems = searchResult ? searchResult.items : items;

  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 5,
  });
  const vItems = virtualizer.getVirtualItems();

  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const value = evt.currentTarget.value.trim();
    if (!value) {
      resetSearch();
      return;
    }
    searchRoom(value);
  };

  const handleRoomClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const roomId = evt.currentTarget.getAttribute('data-room-id');
    if (!roomId) return;

    setSelectedRoomIds((current) =>
      current.includes(roomId)
        ? current.filter((selectedId) => selectedId !== roomId)
        : current.concat(roomId)
    );
  };

  const [forwardState, runForward] = useAsyncCallback(
    useCallback(
      async (roomIds: string[]) => {
        await forwardMessagesToRooms(mx, roomIds, messages);
      },
      [mx, messages]
    )
  );

  const handleForward = () => {
    if (selectedRoomIds.length === 0) return;

    runForward(selectedRoomIds)
      .then(() => {
        onComplete();
        requestClose();
      })
      .catch(() => undefined);
  };

  const renderRoom = (roomId: string) => {
    const room = getRoom(roomId);
    if (!room) return null;

    const direct = mDirects.has(roomId);
    const avatarUrl = direct
      ? getDirectRoomAvatarUrl(mx, room, 96, useAuthentication)
      : getRoomAvatarUrl(mx, room, 96, useAuthentication);
    const roomName = room.name || roomId;
    const selected = selectedRoomIds.includes(roomId);

    return (
      <MenuItem
        key={roomId}
        as="button"
        data-room-id={roomId}
        onClick={handleRoomClick}
        aria-pressed={selected}
        after={selected ? <Icon src={Icons.Check} size="100" /> : undefined}
        radii="300"
      >
        <Box alignItems="Center" gap="300" grow="Yes">
          <Avatar size="300">
            <RoomAvatar
              roomId={roomId}
              src={avatarUrl}
              alt={roomName}
              renderFallback={() =>
                direct ? (
                  <Text size="H6">{nameInitials(roomName)}</Text>
                ) : (
                  <RoomIcon roomType={room.getType()} joinRule={room.getJoinRule()} size="200" />
                )
              }
            />
          </Avatar>
          <Box grow="Yes" direction="Column" gap="50">
            <Text size="B300" truncate>
              {queryHighlightRegex ? highlightText(queryHighlightRegex, [roomName]) : roomName}
            </Text>
            <Text size="T200" priority="300" truncate>
              {direct ? CN.directLabel : CN.roomLabel}
            </Text>
          </Box>
        </Box>
      </MenuItem>
    );
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
          <Modal size="300">
            <Box grow="Yes" direction="Column">
              <Header
                size="500"
                style={{
                  padding: config.space.S200,
                  paddingLeft: config.space.S400,
                }}
              >
                <Box grow="Yes" direction="Column">
                  <Text size="H4">{CN.title}</Text>
                  <Text size="T200" priority="300">
                    {`\u5df2\u9009 ${messages.length} \u6761\u6d88\u606f\uff0c\u8bf7\u9009\u62e9\u8981\u8f6c\u53d1\u5230\u7684\u4f1a\u8bdd`}
                  </Text>
                </Box>
                <Box shrink="No">
                  <IconButton size="300" radii="300" onClick={requestClose}>
                    <Icon src={Icons.Cross} />
                  </IconButton>
                </Box>
              </Header>
              <Box grow="Yes">
                <Scroll ref={scrollRef} size="300" hideTrack>
                  <Box
                    style={{ padding: config.space.S300, paddingRight: 0 }}
                    direction="Column"
                    gap="500"
                  >
                    <Box
                      direction="Column"
                      style={{ position: 'sticky', top: config.space.S300, zIndex: 1 }}
                    >
                      <Input
                        onChange={handleSearchChange}
                        before={<Icon size="200" src={Icons.Search} />}
                        placeholder={CN.searchPlaceholder}
                        size="400"
                        variant="Background"
                        outlined
                      />
                    </Box>
                    {vItems.length === 0 && (
                      <Box
                        style={{ paddingTop: config.space.S700 }}
                        grow="Yes"
                        alignItems="Center"
                        justifyContent="Center"
                        direction="Column"
                        gap="100"
                      >
                        <Text size="H6" align="Center">
                          {searchResult ? CN.noMatch : CN.noTarget}
                        </Text>
                      </Box>
                    )}
                    <Menu style={{ paddingRight: config.space.S300 }}>
                      <Box
                        style={{
                          position: 'relative',
                          height: virtualizer.getTotalSize(),
                        }}
                        direction="Column"
                      >
                        {vItems.map((vItem) => {
                          const roomId = visibleItems[vItem.index];

                          return (
                            <VirtualTile
                              virtualItem={vItem}
                              ref={virtualizer.measureElement}
                              key={roomId}
                            >
                              {renderRoom(roomId)}
                            </VirtualTile>
                          );
                        })}
                      </Box>
                    </Menu>
                  </Box>
                </Scroll>
              </Box>
              <Box
                alignItems="Center"
                justifyContent="SpaceBetween"
                style={{ padding: config.space.S300 }}
              >
                <Text size="T300" priority="300">
                  {selectedRoomIds.length === 0
                    ? CN.needTarget
                    : `\u5c06\u8f6c\u53d1\u5230 ${selectedRoomIds.length} \u4e2a\u4f1a\u8bdd`}
                </Text>
                <Box gap="200">
                  <Button
                    variant="Secondary"
                    fill="Soft"
                    size="300"
                    radii="300"
                    onClick={requestClose}
                  >
                    <Text size="B300">{CN.cancel}</Text>
                  </Button>
                  <Button
                    variant="Primary"
                    size="300"
                    radii="300"
                    onClick={handleForward}
                    disabled={
                      selectedRoomIds.length === 0 || forwardState.status === AsyncStatus.Loading
                    }
                    aria-disabled={
                      selectedRoomIds.length === 0 || forwardState.status === AsyncStatus.Loading
                    }
                    before={
                      forwardState.status === AsyncStatus.Loading ? (
                        <Spinner size="100" variant="Primary" fill="Solid" />
                      ) : undefined
                    }
                  >
                    <Text size="B300">
                      {forwardState.status === AsyncStatus.Loading ? CN.forwarding : CN.forward}
                    </Text>
                  </Button>
                </Box>
              </Box>
            </Box>
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
