import React, {
  ChangeEventHandler,
  FormEventHandler,
  MouseEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import dayjs from 'dayjs';
import FocusTrap from 'focus-trap-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Room, RoomMember, SearchOrderBy } from 'matrix-js-sdk';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Input,
  Line,
  Menu,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Scroll,
  Spinner,
  Text,
  config,
  toRem,
} from 'folds';
import { SequenceCard } from '../../components/sequence-card';
import { DatePicker } from '../../components/time-date';
import { UserAvatar } from '../../components/user-avatar';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoomMembers } from '../../hooks/useRoomMembers';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { isCompactScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { stopPropagation } from '../../utils/keyboard';
import { MessageSearchParams, ResultGroup, ResultItem, useMessageSearch } from './useMessageSearch';
import { SearchResultGroup } from './SearchResultGroup';

type SearchCategory = 'all' | 'files' | 'media' | 'links';

const DIALOG_STYLE = {
  width: 'calc(100vw - 32px)',
  maxWidth: toRem(1120),
  height: 'min(88vh, 56rem)',
  minWidth: 0,
  overflow: 'hidden' as const,
  borderRadius: config.radii.R500,
  background:
    'linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(248, 250, 252, 0.98) 100%)',
  boxShadow: '0 32px 80px rgba(15, 23, 42, 0.22)',
};

const RESULTS_SHELL_STYLE = {
  minHeight: 0,
  borderRadius: config.radii.R500,
  border: '1px solid rgba(148, 163, 184, 0.22)',
  overflow: 'hidden' as const,
  position: 'relative' as const,
  isolation: 'isolate' as const,
  background: 'rgba(255, 255, 255, 0.92)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.78)',
};

const HEADER_STYLE = {
  padding: `${config.space.S500} ${config.space.S400} ${config.space.S300}`,
  position: 'relative' as const,
  zIndex: 2,
  background:
    'linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(255, 255, 255, 0.96) 100%)',
};

const TOOLBAR_STYLE = {
  position: 'relative' as const,
  zIndex: 1,
  background: 'rgba(255, 255, 255, 0.96)',
};

const SOFT_CONTROL_STYLE = {
  border: '1px solid rgba(203, 213, 225, 0.9)',
  background: 'rgba(248, 250, 252, 0.96)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.78)',
};

const PRIMARY_ACTION_STYLE = {
  border: '1px solid rgba(37, 99, 235, 0.42)',
  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
  color: '#ffffff',
  boxShadow: '0 10px 24px rgba(59, 130, 246, 0.24)',
};

const ACTIVE_PILL_STYLE = {
  border: '1px solid rgba(59, 130, 246, 0.24)',
  background: 'rgba(59, 130, 246, 0.12)',
  color: '#1d4ed8',
};

const INACTIVE_PILL_STYLE = {
  border: '1px solid rgba(203, 213, 225, 0.88)',
  background: 'rgba(248, 250, 252, 0.96)',
  color: 'inherit',
};

const DATE_TRIGGER_STYLE = {
  minHeight: toRem(42),
  width: '100%',
  minWidth: 0,
  borderRadius: config.radii.R300,
  border: '1px solid rgba(203, 213, 225, 0.9)',
  background: 'rgba(255, 255, 255, 0.94)',
  padding: `0 ${config.space.S200}`,
  color: 'inherit',
  boxSizing: 'border-box' as const,
  cursor: 'pointer',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
};

const FILTER_PANEL_STYLE = {
  background:
    'linear-gradient(180deg, rgba(248, 250, 252, 0.84) 0%, rgba(255, 255, 255, 0.98) 100%)',
};

const DATE_PICKER_MIN_TS = dayjs('2000-01-01').startOf('day').valueOf();

const formatDateLabel = (value?: string): string =>
  value ? dayjs(value).format('YYYY / MM / DD') : '\u5e74 / \u6708 / \u65e5';

const dateValueToTs = (value?: string): number => {
  if (!value) return dayjs().startOf('day').valueOf();
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.startOf('day').valueOf() : dayjs().startOf('day').valueOf();
};

const CATEGORY_TABS: Array<{ id: SearchCategory; label: string }> = [
  { id: 'all', label: '\u5168\u90e8' },
  { id: 'files', label: '\u6587\u4ef6' },
  { id: 'media', label: '\u56fe\u7247\u4e0e\u89c6\u9891' },
  { id: 'links', label: '\u94fe\u63a5' },
];

const getCategoryFilters = (
  category: SearchCategory
): Pick<MessageSearchParams, 'msgTypes' | 'onlyLinks'> => {
  if (category === 'files') {
    return {
      msgTypes: ['file', 'audio'],
    };
  }

  if (category === 'media') {
    return {
      msgTypes: ['image', 'video'],
    };
  }

  if (category === 'links') {
    return {
      onlyLinks: true,
    };
  }

  return {};
};

type MemberSelectorProps = {
  room: Room;
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
};

function MemberSelector({ room, selectedUserIds, onChange }: MemberSelectorProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const members = useRoomMembers(mx, room.roomId);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [localSelected, setLocalSelected] = useState<string[]>(selectedUserIds);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLocalSelected(selectedUserIds);
    setQuery('');
  }, [menuAnchor, selectedUserIds]);

  const visibleMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sortedMembers = [...members].sort((memberA, memberB) => {
      const memberAName = getMemberDisplayName(room, memberA.userId) ?? memberA.userId;
      const memberBName = getMemberDisplayName(room, memberB.userId) ?? memberB.userId;
      return memberAName.localeCompare(memberBName);
    });

    if (!normalizedQuery) return sortedMembers;

    return sortedMembers.filter((member) => {
      const memberName = getMemberDisplayName(room, member.userId) ?? '';
      return [member.userId, memberName].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [members, query, room]);

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleToggleMember: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const userId = evt.currentTarget.getAttribute('data-user-id');
    if (!userId) return;

    setLocalSelected((current) =>
      current.includes(userId)
        ? current.filter((selectedUserId) => selectedUserId !== userId)
        : current.concat(userId)
    );
  };

  const handleSave = () => {
    onChange(localSelected);
    setMenuAnchor(undefined);
  };

  const handleClear = () => {
    onChange([]);
    setMenuAnchor(undefined);
  };

  return (
    <PopOut
      anchor={menuAnchor}
      align="Start"
      position="Bottom"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setMenuAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu
            variant="Surface"
            style={{
              width: 'calc(100vw - 48px)',
              maxWidth: toRem(320),
            }}
          >
            <Box direction="Column" style={{ maxHeight: 'min(70vh, 30rem)' }}>
              <Box
                shrink="No"
                direction="Column"
                gap="100"
                style={{ padding: config.space.S300, paddingBottom: config.space.S200 }}
              >
                <Text size="L400">{'\u9009\u62e9\u53d1\u9001\u4eba'}</Text>
                <Input
                  value={query}
                  onChange={(evt) => setQuery(evt.currentTarget.value)}
                  size="300"
                  radii="300"
                  placeholder={'\u641c\u7d22\u6635\u79f0\u6216 Matrix ID'}
                  before={<Icon size="100" src={Icons.Search} />}
                  after={
                    visibleMembers.length > 0 ? (
                      <Badge variant="Secondary" size="400" radii="Pill">
                        <Text size="L400">{visibleMembers.length}</Text>
                      </Badge>
                    ) : undefined
                  }
                />
              </Box>

              <Scroll size="300" hideTrack visibility="Hover">
                <Box direction="Column" gap="100" style={{ padding: config.space.S200 }}>
                  {visibleMembers.length === 0 && (
                    <Text
                      size="T300"
                      priority="300"
                      align="Center"
                      style={{ padding: config.space.S400 }}
                    >
                      {'\u672a\u627e\u5230\u5339\u914d\u6210\u5458'}
                    </Text>
                  )}

                  {visibleMembers.map((member: RoomMember) => {
                    const displayName = getMemberDisplayName(room, member.userId) ?? member.userId;
                    const avatarMxc = getMemberAvatarMxc(room, member.userId);
                    const selected = localSelected.includes(member.userId);

                    return (
                      <MenuItem
                        key={member.userId}
                        as="button"
                        data-user-id={member.userId}
                        onClick={handleToggleMember}
                        variant={selected ? 'Success' : 'Surface'}
                        size="300"
                        radii="300"
                        aria-pressed={selected}
                        before={
                          <Avatar size="200">
                            <UserAvatar
                              userId={member.userId}
                              src={
                                avatarMxc
                                  ? mxcUrlToHttp(
                                      mx,
                                      avatarMxc,
                                      useAuthentication,
                                      40,
                                      40,
                                      'crop'
                                    ) ?? undefined
                                  : undefined
                              }
                              alt={displayName}
                              renderFallback={() => <Icon size="100" src={Icons.User} filled />}
                            />
                          </Avatar>
                        }
                        after={selected ? <Icon size="100" src={Icons.Check} /> : undefined}
                      >
                        <Box grow="Yes" direction="Column" gap="25">
                          <Text size="T300" truncate>
                            {displayName}
                          </Text>
                          <Text size="T200" priority="300" truncate>
                            {member.userId}
                          </Text>
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Box>
              </Scroll>

              <Line variant="Surface" size="300" />
              <Box shrink="No" gap="100" style={{ padding: config.space.S200 }}>
                <Button size="300" variant="Secondary" radii="300" onClick={handleSave}>
                  <Text size="B300">
                    {localSelected.length > 0
                      ? `\u4fdd\u5b58 (${localSelected.length})`
                      : '\u4fdd\u5b58'}
                  </Text>
                </Button>
                <Button
                  size="300"
                  radii="300"
                  variant="Secondary"
                  fill="Soft"
                  onClick={handleClear}
                  disabled={localSelected.length === 0}
                >
                  <Text size="B300">{'\u6e05\u7a7a'}</Text>
                </Button>
              </Box>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <Button
        size="300"
        variant="Secondary"
        fill="Soft"
        outlined
        onClick={handleOpenMenu}
        style={{ width: '100%', ...SOFT_CONTROL_STYLE }}
      >
        <Box grow="Yes" alignItems="Center" justifyContent="SpaceBetween" gap="200">
          <Text size="T300" truncate>
            {selectedUserIds.length > 0
              ? `\u5df2\u9009\u62e9 ${selectedUserIds.length} \u4eba`
              : '\u70b9\u51fb\u9009\u62e9'}
          </Text>
          <Icon size="100" src={Icons.ChevronBottom} />
        </Box>
      </Button>
    </PopOut>
  );
}

type DateFilterFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

function DateFilterField({ value, onChange }: DateFilterFieldProps) {
  const [pickerAnchor, setPickerAnchor] = useState<RectCords>();
  const pickerOpen = !!pickerAnchor;
  const selectedTs = useMemo(() => dateValueToTs(value), [value]);

  const handleTogglePicker: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setPickerAnchor((current) => (current ? undefined : evt.currentTarget.getBoundingClientRect()));
  };

  const handleDateChange = (nextTs: number) => {
    onChange(dayjs(nextTs).format('YYYY-MM-DD'));
  };

  const handleClear = () => {
    onChange('');
    setPickerAnchor(undefined);
  };

  return (
    <PopOut
      anchor={pickerAnchor}
      align="End"
      position="Bottom"
      offset={8}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setPickerAnchor(undefined),
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) =>
              evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu
            variant="Surface"
            style={{
              width: 'fit-content',
              maxWidth: 'calc(100vw - 48px)',
              padding: config.space.S200,
            }}
          >
            <Box direction="Column" gap="200">
              <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
                <Text size="L400">
                  {value ? formatDateLabel(value) : '\u9009\u62e9\u65e5\u671f'}
                </Text>
                <Box shrink="No" gap="100">
                  {value && (
                    <Chip
                      variant="SurfaceVariant"
                      radii="Pill"
                      onClick={handleClear}
                      style={INACTIVE_PILL_STYLE}
                    >
                      <Text size="T200">{'\u6e05\u7a7a'}</Text>
                    </Chip>
                  )}
                  <Chip
                    variant="SurfaceVariant"
                    radii="Pill"
                    onClick={() => setPickerAnchor(undefined)}
                    style={INACTIVE_PILL_STYLE}
                  >
                    <Text size="T200">{'\u5173\u95ed'}</Text>
                  </Chip>
                </Box>
              </Box>
              <DatePicker
                min={DATE_PICKER_MIN_TS}
                max={Date.now()}
                value={selectedTs}
                onChange={handleDateChange}
              />
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <button
        type="button"
        onClick={handleTogglePicker}
        aria-expanded={pickerOpen}
        style={DATE_TRIGGER_STYLE}
      >
        <Box grow="Yes" alignItems="Center" justifyContent="SpaceBetween" gap="200">
          <Text size="T300" priority={value ? '400' : '300'}>
            {formatDateLabel(value)}
          </Text>
          <Icon size="100" src={pickerOpen ? Icons.ChevronTop : Icons.ChevronBottom} />
        </Box>
      </button>
    </PopOut>
  );
}

type RoomMessageSearchDialogProps = {
  room: Room;
  direct?: boolean;
  requestClose: () => void;
};

export function RoomMessageSearchDialog({
  room,
  direct,
  requestClose,
}: RoomMessageSearchDialogProps) {
  const mx = useMatrixClient();
  const { navigateRoom } = useRoomNavigate();
  const screenSize = useScreenSizeContext();
  const compact = isCompactScreenSize(screenSize);

  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState('');
  const [term, setTerm] = useState<string>();
  const [category, setCategory] = useState<SearchCategory>('all');
  const [selectedSenders, setSelectedSenders] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [order, setOrder] = useState<string>(SearchOrderBy.Recent);

  const categoryFilters = useMemo(() => getCategoryFilters(category), [category]);
  const hasFilterSelection =
    category !== 'all' || selectedSenders.length > 0 || !!dateFrom || !!dateTo;
  const browsingAllMessages = !term && !hasFilterSelection;
  const hasSearchCriteria = browsingAllMessages || !!term || hasFilterSelection;

  const searchParams: MessageSearchParams = useMemo(
    () => ({
      term,
      order,
      rooms: [room.roomId],
      senders: selectedSenders.length > 0 ? selectedSenders : undefined,
      msgTypes: categoryFilters.msgTypes,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      onlyLinks: categoryFilters.onlyLinks,
      includeAllMessages: browsingAllMessages,
    }),
    [
      browsingAllMessages,
      categoryFilters.msgTypes,
      categoryFilters.onlyLinks,
      dateFrom,
      dateTo,
      order,
      room.roomId,
      selectedSenders,
      term,
    ]
  );

  const searchMessages = useMessageSearch(searchParams);
  const selectedSendersKey = selectedSenders.join(',');

  const { status, data, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    enabled: hasSearchCriteria,
    queryKey: [
      'room-message-search-dialog',
      room.roomId,
      term,
      order,
      selectedSendersKey,
      dateFrom,
      dateTo,
      category,
    ],
    queryFn: ({ pageParam }) => searchMessages(pageParam),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextToken,
  });

  const groups = useMemo<ResultGroup[]>(() => {
    const groupedItems = new Map<string, ResultItem[]>();

    data?.pages.forEach((page) => {
      page.groups.forEach((group) => {
        const existingItems = groupedItems.get(group.roomId) ?? [];
        existingItems.push(...group.items);
        groupedItems.set(group.roomId, existingItems);
      });
    });

    return Array.from(groupedItems.entries()).map(([roomId, items]) => ({
      roomId,
      items,
    }));
  }, [data]);

  const highlights = useMemo(() => {
    const mixedHighlights = data?.pages.flatMap((result) => result.highlights) ?? [];
    return Array.from(new Set(mixedHighlights));
  }, [data]);

  const resultCount = useMemo(
    () => groups.reduce((count, group) => count + group.items.length, 0),
    [groups]
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: 0 });
  }, [category, dateFrom, dateTo, order, selectedSendersKey, term]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return undefined;

    const handleScroll = () => {
      if (!hasNextPage || isFetchingNextPage) return;

      const remainingHeight =
        scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;

      if (remainingHeight <= 240) {
        fetchNextPage();
      }
    };

    handleScroll();
    scrollElement.addEventListener('scroll', handleScroll);

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [fetchNextPage, groups.length, hasNextPage, isFetchingNextPage]);

  const handleSearchSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const nextTerm = searchInput.trim();
    setTerm(nextTerm || undefined);
  };

  const handleSearchInputChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setSearchInput(evt.currentTarget.value);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setTerm(undefined);
  };

  const handleResetFilters = () => {
    setCategory('all');
    setSelectedSenders([]);
    setDateFrom('');
    setDateTo('');
    setOrder(SearchOrderBy.Recent);
  };

  const handleOpenResult = (roomId: string, eventId: string) => {
    requestClose();
    navigateRoom(roomId, eventId);
  };

  const searchStatusLabel = useMemo(() => {
    if (status === 'pending') {
      return browsingAllMessages
        ? '\u52a0\u8f7d\u804a\u5929\u8bb0\u5f55...'
        : '\u641c\u7d22\u4e2d...';
    }

    if (resultCount > 0) {
      return browsingAllMessages
        ? `\u5df2\u663e\u793a ${resultCount} \u6761\u8bb0\u5f55`
        : `\u627e\u5230 ${resultCount} \u6761\u8bb0\u5f55`;
    }

    return browsingAllMessages
      ? '\u5f53\u524d\u4f1a\u8bdd\u6682\u65e0\u53ef\u663e\u793a\u8bb0\u5f55'
      : '\u6682\u65e0\u5339\u914d\u8bb0\u5f55';
  }, [browsingAllMessages, resultCount, status]);

  const emptyStateLabel = useMemo(() => {
    if (browsingAllMessages) {
      return '\u5f53\u524d\u4f1a\u8bdd\u6682\u65e0\u53ef\u663e\u793a\u8bb0\u5f55';
    }
    if (term) {
      return `\u672a\u627e\u5230\u4e0e "${term}" \u76f8\u5173\u7684\u8bb0\u5f55`;
    }
    return '\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6682\u65e0\u8bb0\u5f55';
  }, [browsingAllMessages, term]);

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
          <Dialog variant="Surface" style={DIALOG_STYLE}>
            <Box direction="Column" style={{ height: '100%', minWidth: 0 }}>
              <Box alignItems="Center" gap="300" style={HEADER_STYLE}>
                <Box grow="Yes" direction="Column" gap="50" style={{ minWidth: 0 }}>
                  <Text size="H4" truncate>
                    {'\u804a\u5929\u8bb0\u5f55'}
                  </Text>
                  <Text size="T300" priority="300" truncate>
                    {room.name}
                  </Text>
                </Box>
                <Box shrink="No">
                  <IconButton
                    onClick={requestClose}
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                    style={SOFT_CONTROL_STYLE}
                  >
                    <Icon src={Icons.Cross} />
                  </IconButton>
                </Box>
              </Box>

              <Line variant="SurfaceVariant" size="300" />

              <Box
                grow="Yes"
                direction="Column"
                gap="300"
                style={{ padding: config.space.S400, minHeight: 0 }}
              >
                <Box direction="Column" gap="250" style={TOOLBAR_STYLE}>
                  <Box
                    as="form"
                    onSubmit={handleSearchSubmit}
                    direction={compact ? 'Column' : 'Row'}
                    gap="150"
                    alignItems={compact ? undefined : 'Center'}
                    style={{
                      width: '100%',
                      maxWidth: compact ? '100%' : toRem(620),
                      minWidth: 0,
                    }}
                  >
                    <Box grow="Yes" style={{ minWidth: 0, width: '100%' }}>
                      <Input
                        value={searchInput}
                        onChange={handleSearchInputChange}
                        size="500"
                        variant="Background"
                        outlined
                        style={{ minWidth: 0, ...SOFT_CONTROL_STYLE }}
                        placeholder={'\u641c\u7d22\u5f53\u524d\u4f1a\u8bdd\u8bb0\u5f55'}
                        before={
                          status === 'pending' && hasSearchCriteria ? (
                            <Spinner variant="Secondary" size="200" />
                          ) : (
                            <Icon size="200" src={Icons.Search} />
                          )
                        }
                      />
                    </Box>
                    <Box shrink="No" gap="100" wrap="Wrap">
                      {(searchInput || term) && (
                        <Button
                          type="button"
                          size="400"
                          variant="Secondary"
                          radii="Pill"
                          outlined
                          onClick={handleClearSearch}
                          style={SOFT_CONTROL_STYLE}
                        >
                          <Box alignItems="Center" gap="100">
                            <Icon size="50" src={Icons.Cross} />
                            <Text size="B300">{'\u6e05\u7a7a'}</Text>
                          </Box>
                        </Button>
                      )}
                      <Button
                        type="submit"
                        size="400"
                        variant="Primary"
                        radii="Pill"
                        style={PRIMARY_ACTION_STYLE}
                      >
                        <Text size="B300">{'\u641c\u7d22'}</Text>
                      </Button>
                    </Box>
                  </Box>

                  <Box gap="200" wrap="Wrap" alignItems="Center">
                    {CATEGORY_TABS.map((tab) => {
                      const active = category === tab.id;

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setCategory(tab.id)}
                          style={{
                            border: 'none',
                            borderBottom: `${toRem(2)} solid ${active ? '#3b82f6' : 'transparent'}`,
                            background: active ? 'rgba(59, 130, 246, 0.10)' : 'transparent',
                            color: active ? '#2563eb' : 'inherit',
                            padding: `${config.space.S100} ${config.space.S200}`,
                            borderRadius: config.radii.R300,
                            cursor: 'pointer',
                            font: 'inherit',
                            fontWeight: active ? 600 : 500,
                          }}
                        >
                          <Text size="L400">{tab.label}</Text>
                        </button>
                      );
                    })}

                    <Box grow="Yes" />
                    <Text size="T300" priority="300">
                      {searchStatusLabel}
                    </Text>
                  </Box>
                </Box>

                <Box grow="Yes" direction={compact ? 'Column' : 'Row'} style={RESULTS_SHELL_STYLE}>
                  <Box grow="Yes" style={{ minHeight: 0, minWidth: 0 }}>
                    <Scroll ref={scrollRef} size="300" hideTrack visibility="Hover">
                      <Box
                        direction="Column"
                        gap="300"
                        style={{ padding: config.space.S300, paddingTop: config.space.S400 }}
                      >
                        {hasSearchCriteria && status === 'pending' && groups.length === 0 && (
                          <Box direction="Column" gap="100">
                            {[...Array(6).keys()].map((key) => (
                              <SequenceCard
                                variant="SurfaceVariant"
                                key={key}
                                style={{ minHeight: toRem(84) }}
                              />
                            ))}
                          </Box>
                        )}

                        {hasSearchCriteria && status === 'success' && groups.length === 0 && (
                          <Box
                            className={ContainerColor({ variant: 'Warning' })}
                            style={{
                              padding: config.space.S300,
                              borderRadius: config.radii.R400,
                            }}
                            alignItems="Center"
                            gap="200"
                          >
                            <Icon size="200" src={Icons.Info} />
                            <Text>{emptyStateLabel}</Text>
                          </Box>
                        )}

                        {groups.map((group) => {
                          const groupRoom =
                            group.roomId === room.roomId ? room : mx.getRoom(group.roomId);
                          if (!groupRoom) return null;

                          return (
                            <SearchResultGroup
                              key={group.roomId}
                              room={groupRoom}
                              highlights={highlights}
                              items={group.items}
                              mediaAutoLoad={mediaAutoLoad}
                              urlPreview={urlPreview}
                              onOpen={handleOpenResult}
                              legacyUsernameColor={legacyUsernameColor || direct}
                              hour24Clock={hour24Clock}
                              dateFormatString={dateFormatString}
                              hideRoomHeader
                            />
                          );
                        })}

                        {isFetchingNextPage && (
                          <Box justifyContent="Center" alignItems="Center">
                            <Spinner size="600" variant="Secondary" />
                          </Box>
                        )}

                        {error && (
                          <Box
                            className={ContainerColor({ variant: 'Critical' })}
                            style={{
                              padding: config.space.S300,
                              borderRadius: config.radii.R400,
                            }}
                            direction="Column"
                            gap="200"
                          >
                            <Text size="L400">{error.name}</Text>
                            <Text size="T300">{error.message}</Text>
                          </Box>
                        )}
                      </Box>
                    </Scroll>
                  </Box>

                  <Line
                    direction={compact ? 'Horizontal' : 'Vertical'}
                    variant="Surface"
                    size="300"
                  />

                  <Box
                    shrink="No"
                    direction="Column"
                    style={{
                      width: compact ? '100%' : toRem(288),
                      minWidth: compact ? 0 : toRem(288),
                      maxWidth: compact ? '100%' : toRem(288),
                      minHeight: 0,
                      ...FILTER_PANEL_STYLE,
                    }}
                  >
                    <Scroll size="300" hideTrack visibility="Hover">
                      <Box direction="Column" gap="400" style={{ padding: config.space.S300 }}>
                        <Box direction="Column" gap="100">
                          <Text size="L400">{'\u7b5b\u9009\u6761\u4ef6'}</Text>
                          <Text size="T200" priority="300">
                            {
                              '\u5f53\u524d\u5df2\u9501\u5b9a\u5230\u8fd9\u4e2a\u4f1a\u8bdd\uff0c\u65e0\u9700\u518d\u9009\u62e9\u623f\u95f4\u3002'
                            }
                          </Text>
                        </Box>

                        <Box direction="Column" gap="150">
                          <Text size="T200" priority="300">
                            {'\u6392\u5e8f'}
                          </Text>
                          <Box gap="100" wrap="Wrap">
                            <Chip
                              variant={order !== SearchOrderBy.Rank ? 'Success' : 'SurfaceVariant'}
                              radii="Pill"
                              outlined={order === SearchOrderBy.Rank}
                              aria-pressed={order !== SearchOrderBy.Rank}
                              onClick={() => setOrder(SearchOrderBy.Recent)}
                              style={
                                order !== SearchOrderBy.Rank
                                  ? ACTIVE_PILL_STYLE
                                  : INACTIVE_PILL_STYLE
                              }
                            >
                              <Text size="T200">{'\u6700\u65b0'}</Text>
                            </Chip>
                            <Chip
                              variant={order === SearchOrderBy.Rank ? 'Success' : 'SurfaceVariant'}
                              radii="Pill"
                              outlined={order !== SearchOrderBy.Rank}
                              aria-pressed={order === SearchOrderBy.Rank}
                              onClick={() => setOrder(SearchOrderBy.Rank)}
                              style={
                                order === SearchOrderBy.Rank
                                  ? ACTIVE_PILL_STYLE
                                  : INACTIVE_PILL_STYLE
                              }
                            >
                              <Text size="T200">{'\u76f8\u5173\u5ea6'}</Text>
                            </Chip>
                          </Box>
                        </Box>

                        <Box direction="Column" gap="150">
                          <Text size="T200" priority="300">
                            {direct ? '\u53d1\u9001\u4eba' : '\u7fa4\u6210\u5458'}
                          </Text>
                          <MemberSelector
                            room={room}
                            selectedUserIds={selectedSenders}
                            onChange={(userIds) => setSelectedSenders(userIds)}
                          />
                          {selectedSenders.length > 0 && (
                            <Box gap="100" wrap="Wrap">
                              {selectedSenders.map((userId) => (
                                <Chip
                                  key={userId}
                                  variant="Success"
                                  radii="Pill"
                                  after={<Icon size="50" src={Icons.Cross} />}
                                  onClick={() =>
                                    setSelectedSenders((current) =>
                                      current.filter((selectedUserId) => selectedUserId !== userId)
                                    )
                                  }
                                >
                                  <Text size="T200">
                                    {getMemberDisplayName(room, userId) ??
                                      getMxIdLocalPart(userId) ??
                                      userId}
                                  </Text>
                                </Chip>
                              ))}
                            </Box>
                          )}
                        </Box>

                        <Box direction="Column" gap="150">
                          <Text size="T200" priority="300">
                            {'\u65e5\u671f'}
                          </Text>
                          <Box direction="Column" gap="100">
                            <DateFilterField value={dateFrom} onChange={setDateFrom} />
                            <DateFilterField value={dateTo} onChange={setDateTo} />
                          </Box>
                        </Box>

                        {hasFilterSelection || order === SearchOrderBy.Rank ? (
                          <Box>
                            <Button
                              size="300"
                              variant="Secondary"
                              fill="Soft"
                              outlined
                              onClick={handleResetFilters}
                              style={SOFT_CONTROL_STYLE}
                            >
                              <Text size="B300">{'\u6e05\u7a7a\u7b5b\u9009'}</Text>
                            </Button>
                          </Box>
                        ) : null}
                      </Box>
                    </Scroll>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
