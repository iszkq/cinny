import FocusTrap from 'focus-trap-react';
import {
  Avatar,
  Box,
  config,
  Icon,
  Icons,
  Input,
  Line,
  MenuItem,
  Modal,
  Overlay,
  OverlayCenter,
  Scroll,
  Spinner,
  Text,
  toRem,
} from 'folds';
import React, {
  ChangeEventHandler,
  KeyboardEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isKeyHotkey } from 'is-hotkey';
import { useAtom, useAtomValue } from 'jotai';
import { Room, RoomType } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import { useDirects, useOrphanSpaces, useRooms, useSpaces } from '../../state/hooks/roomList';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { mDirectAtom } from '../../state/mDirectList';
import { allRoomsAtom } from '../../state/room-list/roomList';
import {
  SearchItemStrGetter,
  UseAsyncSearchOptions,
  useAsyncSearch,
} from '../../hooks/useAsyncSearch';
import { useAllJoinedRoomsSet, useGetRoom } from '../../hooks/useGetRoom';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import {
  getAllParents,
  getDirectRoomAvatarUrl,
  getRoomAvatarUrl,
  guessPerfectParent,
} from '../../utils/room';
import { highlightText, makeHighlightRegex } from '../../plugins/react-custom-html-parser';
import { factoryRoomIdByActivity } from '../../utils/sort';
import { nameInitials } from '../../utils/common';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useListFocusIndex } from '../../hooks/useListFocusIndex';
import {
  getMxIdLocalPart,
  getMxIdServer,
  guessDmRoomUserId,
  isRoomAlias,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { UnreadBadge, UnreadBadgeCenter } from '../../components/unread-badge';
import { searchModalAtom } from '../../state/searchModal';
import { useKeyDown } from '../../hooks/useKeyDown';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { KeySymbol } from '../../utils/key-symbol';
import { isMacOS } from '../../utils/user-agent';
import { useFavoritesRoomIds } from '../../hooks/useFavoritesRoom';
import { stopPropagation } from '../../utils/keyboard';
import {
  DirectorySearchItem,
  DirectorySearchScope,
  searchHomeserverDirectory,
} from './directorySearch';
import {
  getDirectCreatePath,
  getHomeRoomPath,
  getSpacePath,
  withSearchParam,
} from '../../pages/pathUtils';
import { DirectCreateSearchParams } from '../../pages/paths';

enum SearchRoomType {
  Rooms = '#',
  Spaces = '*',
  Directs = '@',
}

const getSearchPrefixToRoomType = (prefix: string): SearchRoomType | undefined => {
  if (prefix === '#') return SearchRoomType.Rooms;
  if (prefix === '*') return SearchRoomType.Spaces;
  if (prefix === '@') return SearchRoomType.Directs;
  return undefined;
};

const getDirectorySearchScope = (
  searchRoomType: SearchRoomType | undefined
): DirectorySearchScope => {
  if (searchRoomType === SearchRoomType.Directs) return 'users';
  if (searchRoomType === SearchRoomType.Rooms) return 'rooms';
  if (searchRoomType === SearchRoomType.Spaces) return 'spaces';
  return 'all';
};

type SearchResultItem =
  | {
      type: 'local';
      roomId: string;
    }
  | DirectorySearchItem;

type DirectorySearchState = {
  key: string;
  loading: boolean;
  items: DirectorySearchItem[];
  error?: Error;
  unavailableSources: number;
};

const DIRECTORY_SEARCH_DEBOUNCE_MS = 300;

const useTopActiveRooms = (
  searchRoomType: SearchRoomType | undefined,
  rooms: string[],
  directs: string[],
  spaces: string[]
) => {
  const mx = useMatrixClient();

  return useMemo(() => {
    if (searchRoomType === SearchRoomType.Spaces) {
      return spaces;
    }
    if (searchRoomType === SearchRoomType.Directs) {
      return [...directs].sort(factoryRoomIdByActivity(mx)).slice(0, 20);
    }
    if (searchRoomType === SearchRoomType.Rooms) {
      return [...rooms].sort(factoryRoomIdByActivity(mx)).slice(0, 20);
    }
    return [...rooms, ...directs].sort(factoryRoomIdByActivity(mx)).slice(0, 20);
  }, [mx, rooms, directs, spaces, searchRoomType]);
};

const getDmUserId = (
  roomId: string,
  getRoom: (roomId: string) => Room | undefined,
  myUserId: string
): string | undefined => {
  const room = getRoom(roomId);
  const targetUserId = room && guessDmRoomUserId(room, myUserId);
  return targetUserId;
};

const useSearchTargetRooms = (
  searchRoomType: SearchRoomType | undefined,
  rooms: string[],
  directs: string[],
  spaces: string[]
) =>
  useMemo(() => {
    if (searchRoomType === undefined) {
      return [...rooms, ...directs, ...spaces];
    }
    if (searchRoomType === SearchRoomType.Rooms) return rooms;
    if (searchRoomType === SearchRoomType.Spaces) return spaces;
    if (searchRoomType === SearchRoomType.Directs) return directs;

    return [];
  }, [rooms, spaces, directs, searchRoomType]);

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  matchOptions: {
    contain: true,
  },
  normalizeOptions: {
    ignoreWhitespace: false,
  },
};

type SearchProps = {
  requestClose: () => void;
};
export function Search({ requestClose }: SearchProps) {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const useAuthentication = useMediaAuthentication();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { navigateRoom, navigateSpace } = useRoomNavigate();
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [searchInput, setSearchInput] = useState('');
  const [directorySearch, setDirectorySearch] = useState<DirectorySearchState>({
    key: '',
    loading: false,
    items: [],
    unavailableSources: 0,
  });

  const allRoomsSet = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allRoomsSet);

  const roomToParents = useAtomValue(roomToParentsAtom);
  const orphanSpaces = useOrphanSpaces(mx, allRoomsAtom, roomToParents);
  const mDirects = useAtomValue(mDirectAtom);
  const favoritesRoomIds = useFavoritesRoomIds();
  const favoritesRoomIdSet = useMemo(() => new Set(favoritesRoomIds), [favoritesRoomIds]);
  const allRooms = useRooms(mx, allRoomsAtom, mDirects);
  const rooms = useMemo(
    () => allRooms.filter((roomId) => !favoritesRoomIdSet.has(roomId)),
    [allRooms, favoritesRoomIdSet]
  );
  const spaces = useSpaces(mx, allRoomsAtom);
  const allDirects = useDirects(mx, allRoomsAtom, mDirects);
  const directs = useMemo(
    () => allDirects.filter((roomId) => !favoritesRoomIdSet.has(roomId)),
    [allDirects, favoritesRoomIdSet]
  );

  const parsedSearch = useMemo(() => {
    const trimmedValue = searchInput.trim();
    const prefix = trimmedValue.match(/^[#@*]/)?.[0];
    const derivedSearchRoomType =
      typeof prefix === 'string' ? getSearchPrefixToRoomType(prefix) : undefined;
    const rawQuery = derivedSearchRoomType ? trimmedValue.slice(1) : trimmedValue;

    return {
      searchRoomType: derivedSearchRoomType,
      rawQuery,
      directoryQuery:
        derivedSearchRoomType === SearchRoomType.Rooms && isRoomAlias(trimmedValue)
          ? trimmedValue
          : rawQuery,
      directoryScope: getDirectorySearchScope(derivedSearchRoomType),
    };
  }, [searchInput]);

  const topActiveRooms = useTopActiveRooms(parsedSearch.searchRoomType, rooms, directs, spaces);
  const targetRooms = useSearchTargetRooms(parsedSearch.searchRoomType, rooms, directs, spaces);

  const getTargetStr: SearchItemStrGetter<string> = useCallback(
    (roomId: string) => {
      const roomName = getRoom(roomId)?.name ?? roomId;
      if (mDirects.has(roomId)) {
        const targetUserId = getDmUserId(roomId, getRoom, mx.getSafeUserId());
        const targetUsername = targetUserId && getMxIdLocalPart(targetUserId);
        if (targetUsername && targetUserId) return [roomName, targetUsername, targetUserId];
      }
      return roomName;
    },
    [getRoom, mDirects, mx]
  );

  const [result, searchRoom, resetSearch] = useAsyncSearch(
    targetRooms,
    getTargetStr,
    SEARCH_OPTIONS
  );

  const directorySearchKey = `${parsedSearch.directoryScope}:${parsedSearch.directoryQuery}`;

  useEffect(() => {
    const query = parsedSearch.directoryQuery;
    if (!query) {
      setDirectorySearch({
        key: '',
        loading: false,
        items: [],
        unavailableSources: 0,
      });
      return undefined;
    }

    let active = true;
    setDirectorySearch({
      key: directorySearchKey,
      loading: true,
      items: [],
      unavailableSources: 0,
    });

    const timeoutId = window.setTimeout(() => {
      searchHomeserverDirectory(mx, query, parsedSearch.directoryScope)
        .then((searchResult) => {
          if (!active) return;
          setDirectorySearch({
            key: directorySearchKey,
            loading: false,
            items: searchResult.items,
            unavailableSources: searchResult.unavailableSources,
          });
        })
        .catch((error: unknown) => {
          if (!active) return;
          setDirectorySearch({
            key: directorySearchKey,
            loading: false,
            items: [],
            error:
              error instanceof Error ? error : new Error('Homeserver directory search failed.'),
            unavailableSources: 0,
          });
        });
    }, DIRECTORY_SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [directorySearchKey, mx, parsedSearch.directoryQuery, parsedSearch.directoryScope]);

  const directUserIds = useMemo(() => {
    const userIds = new Set<string>();
    directs.forEach((roomId) => {
      const userId = getDmUserId(roomId, getRoom, mx.getSafeUserId());
      if (userId) userIds.add(userId);
    });
    return userIds;
  }, [directs, getRoom, mx]);

  const joinedRoomIdentifiers = useMemo(() => {
    const identifiers = new Set<string>();
    allRoomsSet.forEach((roomId) => {
      identifiers.add(roomId);
      const room = getRoom(roomId);
      const canonicalAlias = room?.getCanonicalAlias();
      if (canonicalAlias) identifiers.add(canonicalAlias);
      room?.getAltAliases().forEach((alias) => identifiers.add(alias));
    });
    return identifiers;
  }, [allRoomsSet, getRoom]);

  const directoryItems = useMemo(() => {
    if (directorySearch.key !== directorySearchKey) return [];

    return directorySearch.items.filter((item) => {
      if (item.type === 'user') {
        return item.user.user_id !== mx.getSafeUserId() && !directUserIds.has(item.user.user_id);
      }

      return !(
        joinedRoomIdentifiers.has(item.room.room_id) ||
        (item.room.canonical_alias && joinedRoomIdentifiers.has(item.room.canonical_alias)) ||
        item.room.aliases?.some((alias) => joinedRoomIdentifiers.has(alias))
      );
    });
  }, [
    directUserIds,
    directorySearch.items,
    directorySearch.key,
    directorySearchKey,
    joinedRoomIdentifiers,
    mx,
  ]);

  const itemsToRender = useMemo<SearchResultItem[]>(() => {
    const localRoomsToRender = parsedSearch.rawQuery ? result?.items ?? [] : topActiveRooms;
    return [
      ...localRoomsToRender.map((roomId) => ({ type: 'local' as const, roomId })),
      ...directoryItems,
    ];
  }, [directoryItems, parsedSearch.rawQuery, result, topActiveRooms]);
  const listFocus = useListFocusIndex(itemsToRender.length, 0);

  const queryHighlighRegex = parsedSearch.rawQuery
    ? makeHighlightRegex(parsedSearch.rawQuery.split(' '))
    : undefined;
  const focusTrapOptions = useMemo(
    () => ({
      initialFocus: () => inputRef.current,
      returnFocusOnDeactivate: false,
      allowOutsideClick: true,
      clickOutsideDeactivates: true,
      onDeactivate: requestClose,
      escapeDeactivates: stopPropagation,
    }),
    [requestClose]
  );

  const openRoomId = (roomId: string, isSpace: boolean) => {
    if (isSpace) navigateSpace(roomId);
    else navigateRoom(roomId);
    requestClose();
  };

  const openDirectoryUser = (userId: string) => {
    const directSearchParam: DirectCreateSearchParams = { userId };
    navigate(withSearchParam(getDirectCreatePath(), directSearchParam));
    requestClose();
  };

  const openDirectoryRoom = (item: Extract<DirectorySearchItem, { type: 'room' }>) => {
    const roomIdOrAlias = item.room.canonical_alias ?? item.room.room_id;
    const path =
      item.room.room_type === RoomType.Space
        ? getSpacePath(roomIdOrAlias)
        : getHomeRoomPath(roomIdOrAlias);
    navigate(path);
    requestClose();
  };

  const openSearchItem = (item: SearchResultItem) => {
    if (item.type === 'local') {
      openRoomId(item.roomId, spaces.includes(item.roomId));
      return;
    }
    if (item.type === 'user') {
      openDirectoryUser(item.user.user_id);
      return;
    }
    openDirectoryRoom(item);
  };

  const handleInputChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    listFocus.reset();
    setSearchInput(evt.currentTarget.value);
  };

  useEffect(() => {
    if (!parsedSearch.rawQuery) {
      resetSearch();
      return;
    }

    searchRoom(parsedSearch.rawQuery);
  }, [parsedSearch.rawQuery, resetSearch, searchRoom]);

  const handleInputKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    const item = itemsToRender[listFocus.index];
    if (isKeyHotkey('enter', evt) && item) {
      openSearchItem(item);
      return;
    }
    if (isKeyHotkey('arrowdown', evt)) {
      evt.preventDefault();
      listFocus.next();
      return;
    }
    if (isKeyHotkey('arrowup', evt)) {
      evt.preventDefault();
      listFocus.previous();
    }
  };

  useEffect(() => {
    const scrollView = scrollRef.current;
    const focusedItem = scrollView?.querySelector(`[data-focus-index="${listFocus.index}"]`);

    if (focusedItem && scrollView) {
      focusedItem.scrollIntoView({
        block: 'center',
      });
    }
  }, [listFocus.index]);

  const searchingDirectory = directorySearch.key === directorySearchKey && directorySearch.loading;
  const directoryError =
    directorySearch.key === directorySearchKey ? directorySearch.error : undefined;
  const unavailableSources =
    directorySearch.key === directorySearchKey ? directorySearch.unavailableSources : 0;
  let emptyTitle = '\u6682\u65e0\u623f\u95f4';
  let emptyDescription = '\u4f60\u8fd8\u6ca1\u6709\u53ef\u663e\u793a\u7684\u623f\u95f4\u3002';
  if (parsedSearch.rawQuery) {
    emptyTitle = '\u672a\u627e\u5230\u5339\u914d\u7ed3\u679c';
    emptyDescription = `\u6ca1\u6709\u627e\u5230\u4e0e\u201c${parsedSearch.rawQuery}\u201d\u76f8\u5173\u7684\u7ed3\u679c\u3002`;
  }
  if (directoryError) {
    emptyTitle = '\u670d\u52a1\u5668\u641c\u7d22\u6682\u4e0d\u53ef\u7528';
    emptyDescription =
      '\u65e0\u6cd5\u8bfb\u53d6\u7528\u6237\u6216\u516c\u5f00\u623f\u95f4\u76ee\u5f55\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002';
  }

  return (
    <Overlay open>
      <OverlayCenter>
        <FocusTrap focusTrapOptions={focusTrapOptions}>
          <Modal size="400" style={{ maxHeight: toRem(400), borderRadius: config.radii.R500 }}>
            <Box
              shrink="No"
              style={{ padding: config.space.S400, paddingBottom: 0 }}
              direction="Column"
            >
              <Input
                ref={inputRef}
                size="500"
                variant="Background"
                radii="400"
                outlined
                placeholder={'\u641c\u7d22\u5df2\u52a0\u5165\u548c\u670d\u52a1\u5668\u76ee\u5f55'}
                before={
                  searchingDirectory ? (
                    <Spinner size="200" variant="Secondary" />
                  ) : (
                    <Icon size="200" src={Icons.Search} />
                  )
                }
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
              />
            </Box>
            <Box grow="Yes">
              {itemsToRender.length === 0 && !searchingDirectory && (
                <Box
                  style={{ paddingTop: config.space.S700 }}
                  grow="Yes"
                  alignItems="Center"
                  justifyContent="Center"
                  direction="Column"
                  gap="100"
                >
                  <Text size="H6" align="Center">
                    {emptyTitle}
                  </Text>
                  <Text size="T200" align="Center">
                    {emptyDescription}
                  </Text>
                </Box>
              )}
              {itemsToRender.length > 0 && (
                <Scroll ref={scrollRef} size="300" hideTrack>
                  <div style={{ padding: config.space.S400, paddingRight: config.space.S200 }}>
                    {itemsToRender.map((item, index) => {
                      if (item.type === 'user') {
                        const { user } = item;
                        const displayName = user.display_name || getMxIdLocalPart(user.user_id);
                        const avatarUrl = user.avatar_url
                          ? mxcUrlToHttp(mx, user.avatar_url, useAuthentication, 32, 32, 'crop')
                          : undefined;

                        return (
                          <MenuItem
                            key={`user-${user.user_id}`}
                            as="button"
                            data-focus-index={index}
                            onClick={() => openDirectoryUser(user.user_id)}
                            variant={listFocus.index === index ? 'Primary' : 'Surface'}
                            aria-pressed={listFocus.index === index}
                            radii="400"
                            after={
                              <Text size="T200" priority="300" truncate>
                                <b>{'\u6dfb\u52a0'}</b>
                              </Text>
                            }
                            before={
                              <Avatar size="200" radii="400">
                                <RoomAvatar
                                  roomId={user.user_id}
                                  src={avatarUrl ?? undefined}
                                  alt={displayName ?? user.user_id}
                                  renderFallback={() => (
                                    <Text as="span" size="H6">
                                      {nameInitials(displayName ?? user.user_id)}
                                    </Text>
                                  )}
                                />
                              </Avatar>
                            }
                          >
                            <Box grow="Yes" alignItems="Center" gap="100">
                              {displayName && (
                                <Text size="T400" truncate>
                                  {queryHighlighRegex
                                    ? highlightText(queryHighlighRegex, [displayName])
                                    : displayName}
                                </Text>
                              )}
                              <Text as="span" size="T200" priority="300" truncate>
                                {queryHighlighRegex
                                  ? highlightText(queryHighlighRegex, [user.user_id])
                                  : user.user_id}
                              </Text>
                            </Box>
                          </MenuItem>
                        );
                      }

                      if (item.type === 'room') {
                        const { room: directoryRoom } = item;
                        const roomIdOrAlias =
                          directoryRoom.canonical_alias ?? directoryRoom.room_id;
                        const roomName = directoryRoom.name || roomIdOrAlias;
                        const roomServer = getMxIdServer(roomIdOrAlias);
                        const avatarUrl = directoryRoom.avatar_url
                          ? mxcUrlToHttp(
                              mx,
                              directoryRoom.avatar_url,
                              useAuthentication,
                              32,
                              32,
                              'crop'
                            )
                          : undefined;

                        return (
                          <MenuItem
                            key={`room-${directoryRoom.room_id}`}
                            as="button"
                            data-focus-index={index}
                            onClick={() => openDirectoryRoom(item)}
                            variant={listFocus.index === index ? 'Primary' : 'Surface'}
                            aria-pressed={listFocus.index === index}
                            radii="400"
                            after={
                              <Box gap="100" alignItems="Center">
                                {roomServer && (
                                  <Text size="T200" priority="300" truncate>
                                    {roomServer}
                                  </Text>
                                )}
                                <Text size="T200" priority="300" truncate>
                                  <b>{'\u52a0\u5165'}</b>
                                </Text>
                              </Box>
                            }
                            before={
                              <Avatar
                                size="200"
                                radii={directoryRoom.room_type === RoomType.Space ? '300' : '400'}
                              >
                                {avatarUrl ? (
                                  <RoomAvatar
                                    roomId={directoryRoom.room_id}
                                    src={avatarUrl}
                                    alt={roomName}
                                    renderFallback={() => (
                                      <Text as="span" size="H6">
                                        {nameInitials(roomName)}
                                      </Text>
                                    )}
                                  />
                                ) : (
                                  <RoomIcon
                                    size="100"
                                    joinRule={directoryRoom.join_rule}
                                    roomType={directoryRoom.room_type}
                                  />
                                )}
                              </Avatar>
                            }
                          >
                            <Box grow="Yes" alignItems="Center" gap="100">
                              <Text size="T400" truncate>
                                {queryHighlighRegex
                                  ? highlightText(queryHighlighRegex, [roomName])
                                  : roomName}
                              </Text>
                              {directoryRoom.canonical_alias && (
                                <Text as="span" size="T200" priority="300" truncate>
                                  {queryHighlighRegex
                                    ? highlightText(queryHighlighRegex, [
                                        directoryRoom.canonical_alias,
                                      ])
                                    : directoryRoom.canonical_alias}
                                </Text>
                              )}
                            </Box>
                          </MenuItem>
                        );
                      }

                      const { roomId } = item;
                      const room = getRoom(roomId);
                      if (!room) return null;

                      const dm = mDirects.has(roomId);
                      const dmUserId = dm && getDmUserId(roomId, getRoom, mx.getSafeUserId());
                      const dmUsername = dmUserId && getMxIdLocalPart(dmUserId);
                      const dmUserServer = dmUserId && getMxIdServer(dmUserId);

                      const allParents = getAllParents(roomToParents, roomId);
                      const orphanParents =
                        allParents && orphanSpaces.filter((o) => allParents.has(o));
                      const perfectOrphanParent =
                        orphanParents && guessPerfectParent(mx, roomId, orphanParents);

                      const exactParents = roomToParents.get(roomId);
                      const perfectParent =
                        exactParents && guessPerfectParent(mx, roomId, Array.from(exactParents));

                      const unread = roomToUnread.get(roomId);

                      return (
                        <MenuItem
                          key={roomId}
                          as="button"
                          data-focus-index={index}
                          onClick={() => openRoomId(roomId, room.isSpaceRoom())}
                          variant={listFocus.index === index ? 'Primary' : 'Surface'}
                          aria-pressed={listFocus.index === index}
                          radii="400"
                          after={
                            <Box gap="100">
                              {dmUserServer && (
                                <Text size="T200" priority="300" truncate>
                                  <b>{dmUserServer}</b>
                                </Text>
                              )}
                              {!dm && perfectOrphanParent && (
                                <Text size="T200" priority="300" truncate>
                                  <b>{getRoom(perfectOrphanParent)?.name ?? perfectOrphanParent}</b>
                                </Text>
                              )}
                              {unread && (
                                <UnreadBadgeCenter>
                                  <UnreadBadge
                                    highlight={unread.highlight > 0}
                                    count={unread.total}
                                  />
                                </UnreadBadgeCenter>
                              )}
                            </Box>
                          }
                          before={
                            <Avatar size="200" radii={dm ? '400' : '300'}>
                              {dm || room.isSpaceRoom() ? (
                                <RoomAvatar
                                  roomId={room.roomId}
                                  src={
                                    dm
                                      ? getDirectRoomAvatarUrl(mx, room, 32, useAuthentication)
                                      : getRoomAvatarUrl(mx, room, 32, useAuthentication)
                                  }
                                  alt={room.name}
                                  renderFallback={() => (
                                    <Text as="span" size="H6">
                                      {nameInitials(room.name)}
                                    </Text>
                                  )}
                                />
                              ) : (
                                <RoomIcon
                                  size="100"
                                  joinRule={room.getJoinRule()}
                                  roomType={room.getType()}
                                />
                              )}
                            </Avatar>
                          }
                        >
                          <Box grow="Yes" alignItems="Center" gap="100">
                            <Text size="T400" truncate>
                              {queryHighlighRegex
                                ? highlightText(queryHighlighRegex, [room.name])
                                : room.name}
                            </Text>
                            {dmUsername && (
                              <Text as="span" size="T200" priority="300" truncate>
                                @
                                {queryHighlighRegex
                                  ? highlightText(queryHighlighRegex, [dmUsername])
                                  : dmUsername}
                              </Text>
                            )}
                            {!dm && perfectParent && perfectParent !== perfectOrphanParent && (
                              <Text size="T200" priority="300" truncate>
                                — {getRoom(perfectParent)?.name ?? perfectParent}
                              </Text>
                            )}
                          </Box>
                        </MenuItem>
                      );
                    })}
                    {unavailableSources > 0 && (
                      <Text
                        as="p"
                        size="T200"
                        priority="300"
                        align="Center"
                        style={{ padding: config.space.S200 }}
                      >
                        {
                          '\u90e8\u5206\u670d\u52a1\u5668\u76ee\u5f55\u6682\u65f6\u65e0\u6cd5\u8bfb\u53d6\u3002'
                        }
                      </Text>
                    )}
                  </div>
                </Scroll>
              )}
            </Box>
            <Line size="300" />
            <Box shrink="No" justifyContent="Center" style={{ padding: config.space.S200 }}>
              <Text size="T200" priority="300">
                {'\u8f93\u5165 '}
                <b>#</b>
                {' \u641c\u7d22\u7fa4\u804a\uff0c\u8f93\u5165 '}
                <b>@</b>
                {' \u641c\u7d22\u7528\u6237\uff0c\u8f93\u5165 '}
                <b>*</b>
                {
                  ' \u641c\u7d22\u7a7a\u95f4\uff1b\u7ed3\u679c\u5305\u542b\u670d\u52a1\u5668\u76ee\u5f55\u3002\u5feb\u6377\u952e\uff1a'
                }
                <b>{isMacOS() ? KeySymbol.Command : 'Ctrl'} + k</b>
              </Text>
            </Box>
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

export function SearchModalRenderer() {
  const [opened, setOpen] = useAtom(searchModalAtom);

  useKeyDown(
    window,
    useCallback(
      (event) => {
        if (isKeyHotkey('mod+k', event)) {
          event.preventDefault();
          if (opened) {
            setOpen(false);
            return;
          }

          const portalContainer = document.getElementById('portalContainer');
          if (portalContainer && portalContainer.children.length > 0) {
            return;
          }
          setOpen(true);
        }
      },
      [opened, setOpen]
    )
  );

  return opened && <Search requestClose={() => setOpen(false)} />;
}
