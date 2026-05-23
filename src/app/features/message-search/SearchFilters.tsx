import React, {
  ChangeEventHandler,
  MouseEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import FocusTrap from 'focus-trap-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Badge,
  Box,
  Button,
  Chip,
  Header,
  Icon,
  Icons,
  Input,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Scroll,
  Text,
  config,
  toRem,
} from 'folds';
import { SearchOrderBy } from 'matrix-js-sdk';
import {
  SearchItemStrGetter,
  UseAsyncSearchOptions,
  useAsyncSearch,
} from '../../hooks/useAsyncSearch';
import { DebounceOptions, useDebounce } from '../../hooks/useDebounce';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { VirtualTile } from '../../components/virtualizer';
import { stopPropagation } from '../../utils/keyboard';
import { getRoomIconSrc } from '../../utils/room';
import { factoryRoomIdByAtoZ } from '../../utils/sort';
import { SEARCH_MESSAGE_TYPES, SearchMessageType } from './useMessageSearch';

const DATE_INPUT_STYLE = {
  minHeight: toRem(36),
  minWidth: toRem(154),
  borderRadius: config.radii.R300,
  border: '1px solid rgba(148, 163, 184, 0.34)',
  background: 'rgba(255, 255, 255, 0.88)',
  padding: `0 ${config.space.S200}`,
  color: 'inherit',
};

const FILTER_FIELD_STYLE = {
  minWidth: toRem(148),
};

const MESSAGE_TYPE_LABEL: Record<SearchMessageType, string> = {
  text: '\u6587\u672c',
  image: '\u56fe\u7247',
  video: '\u89c6\u9891',
  audio: '\u97f3\u9891',
  file: '\u6587\u4ef6',
  sticker: '\u8d34\u7eb8',
  poll: '\u6295\u7968',
};

type OrderButtonProps = {
  order?: string;
  onChange: (order?: string) => void;
};

function OrderButton({ order, onChange }: OrderButtonProps) {
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const rankOrder = order === SearchOrderBy.Rank;

  const setOrder = (nextOrder?: string) => {
    setMenuAnchor(undefined);
    onChange(nextOrder);
  };

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={menuAnchor}
      align="End"
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
          <Menu variant="Surface">
            <Header size="300" variant="Surface" style={{ padding: `0 ${config.space.S300}` }}>
              <Text size="L400">{'\u6392\u5e8f\u65b9\u5f0f'}</Text>
            </Header>
            <Line variant="Surface" size="300" />
            <div style={{ padding: config.space.S100 }}>
              <MenuItem
                onClick={() => setOrder()}
                variant="Surface"
                size="300"
                radii="300"
                aria-pressed={!rankOrder}
              >
                <Text size="T300">{'\u6700\u65b0'}</Text>
              </MenuItem>
              <MenuItem
                onClick={() => setOrder(SearchOrderBy.Rank)}
                variant="Surface"
                size="300"
                radii="300"
                aria-pressed={rankOrder}
              >
                <Text size="T300">{'\u76f8\u5173\u5ea6'}</Text>
              </MenuItem>
            </div>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        variant="SurfaceVariant"
        radii="Pill"
        after={<Icon size="50" src={Icons.Sort} />}
        onClick={handleOpenMenu}
      >
        <Text size="T200">{rankOrder ? '\u76f8\u5173\u5ea6' : '\u6700\u65b0'}</Text>
      </Chip>
    </PopOut>
  );
}

const SEARCH_OPTS: UseAsyncSearchOptions = {
  limit: 20,
  matchOptions: {
    contain: true,
  },
};

const SEARCH_DEBOUNCE_OPTS: DebounceOptions = {
  wait: 200,
};

type SelectRoomButtonProps = {
  roomList: string[];
  selectedRooms?: string[];
  onChange: (rooms?: string[]) => void;
};

function SelectRoomButton({ roomList, selectedRooms, onChange }: SelectRoomButtonProps) {
  const mx = useMatrixClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [localSelected, setLocalSelected] = useState(selectedRooms);

  const getRoomNameStr: SearchItemStrGetter<string> = useCallback(
    (roomId) => mx.getRoom(roomId)?.name ?? roomId,
    [mx]
  );

  const [searchResult, searchRoomRaw, resetSearch] = useAsyncSearch(
    roomList,
    getRoomNameStr,
    SEARCH_OPTS
  );
  const rooms = Array.from(searchResult?.items ?? roomList).sort(factoryRoomIdByAtoZ(mx));

  const virtualizer = useVirtualizer({
    count: rooms.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 5,
  });
  const vItems = virtualizer.getVirtualItems();

  const searchRoom = useDebounce(searchRoomRaw, SEARCH_DEBOUNCE_OPTS);

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

    if (localSelected?.includes(roomId)) {
      setLocalSelected(localSelected.filter((rId) => rId !== roomId));
      return;
    }

    setLocalSelected([...(localSelected ?? []), roomId]);
  };

  const handleSave = () => {
    setMenuAnchor(undefined);
    onChange(localSelected && localSelected.length > 0 ? localSelected : undefined);
  };

  const handleDeselectAll = () => {
    setMenuAnchor(undefined);
    onChange(undefined);
  };

  useEffect(() => {
    setLocalSelected(selectedRooms);
    resetSearch();
  }, [menuAnchor, resetSearch, selectedRooms]);

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={menuAnchor}
      align="Center"
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
          <Menu variant="Surface" style={{ width: toRem(250) }}>
            <Box direction="Column" style={{ maxHeight: toRem(450), maxWidth: toRem(300) }}>
              <Box
                shrink="No"
                direction="Column"
                gap="100"
                style={{ padding: config.space.S200, paddingBottom: 0 }}
              >
                <Text size="L400">{'\u641c\u7d22'}</Text>
                <Input
                  onChange={handleSearchChange}
                  size="300"
                  radii="300"
                  placeholder={'\u8f93\u5165\u623f\u95f4\u540d'}
                  after={
                    searchResult && searchResult.items.length > 0 ? (
                      <Badge variant="Secondary" size="400" radii="Pill">
                        <Text size="L400">{searchResult.items.length}</Text>
                      </Badge>
                    ) : null
                  }
                />
              </Box>

              <Scroll ref={scrollRef} size="300" hideTrack>
                <Box
                  direction="Column"
                  gap="100"
                  style={{
                    padding: config.space.S200,
                    paddingRight: 0,
                  }}
                >
                  {!searchResult && <Text size="L400">{'\u623f\u95f4'}</Text>}
                  {searchResult && (
                    <Text size="L400">{`“${searchResult.query}” \u7684\u623f\u95f4\u641c\u7d22\u7ed3\u679c`}</Text>
                  )}
                  {searchResult && searchResult.items.length === 0 && (
                    <Text style={{ padding: config.space.S400 }} size="T300" align="Center">
                      {'\u672a\u627e\u5230\u5339\u914d\u9879'}
                    </Text>
                  )}

                  <div
                    style={{
                      position: 'relative',
                      height: virtualizer.getTotalSize(),
                    }}
                  >
                    {vItems.map((vItem) => {
                      const roomId = rooms[vItem.index];
                      const room = mx.getRoom(roomId);
                      if (!room) return null;

                      const selected = localSelected?.includes(roomId);

                      return (
                        <VirtualTile
                          virtualItem={vItem}
                          style={{ paddingBottom: config.space.S100 }}
                          ref={virtualizer.measureElement}
                          key={roomId}
                        >
                          <MenuItem
                            data-room-id={roomId}
                            onClick={handleRoomClick}
                            variant={selected ? 'Success' : 'Surface'}
                            size="300"
                            radii="300"
                            aria-pressed={selected}
                            before={
                              <Icon
                                size="50"
                                src={getRoomIconSrc(Icons, room.getType(), room.getJoinRule())}
                              />
                            }
                          >
                            <Text truncate size="T300">
                              {room.name}
                            </Text>
                          </MenuItem>
                        </VirtualTile>
                      );
                    })}
                  </div>
                </Box>
              </Scroll>

              <Line variant="Surface" size="300" />
              <Box shrink="No" direction="Column" gap="100" style={{ padding: config.space.S200 }}>
                <Button size="300" variant="Secondary" radii="300" onClick={handleSave}>
                  <Text size="B300">
                    {localSelected && localSelected.length > 0
                      ? `\u4fdd\u5b58 (${localSelected.length})`
                      : '\u4fdd\u5b58'}
                  </Text>
                </Button>
                <Button
                  size="300"
                  radii="300"
                  variant="Secondary"
                  fill="Soft"
                  onClick={handleDeselectAll}
                  disabled={!localSelected || localSelected.length === 0}
                >
                  <Text size="B300">{'\u53d6\u6d88\u5168\u9009'}</Text>
                </Button>
              </Box>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <Chip
        onClick={handleOpenMenu}
        variant="SurfaceVariant"
        radii="Pill"
        before={<Icon size="100" src={Icons.PlusCircle} />}
      >
        <Text size="T200">{'\u9009\u62e9\u623f\u95f4'}</Text>
      </Chip>
    </PopOut>
  );
}

type SearchFiltersProps = {
  defaultRoomsFilterName: string;
  allowGlobal?: boolean;
  roomList: string[];
  selectedRooms?: string[];
  onSelectedRoomsChange: (selectedRooms?: string[]) => void;
  global?: boolean;
  onGlobalChange: (global?: boolean) => void;
  order?: string;
  onOrderChange: (order?: string) => void;
  senderQuery?: string;
  onSenderQueryChange: (value?: string) => void;
  selectedTypes?: SearchMessageType[];
  onSelectedTypesChange: (types?: SearchMessageType[]) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange: (value?: string) => void;
  onDateToChange: (value?: string) => void;
  onlyLinks?: boolean;
  onOnlyLinksChange: (value?: boolean) => void;
};

export function SearchFilters({
  defaultRoomsFilterName,
  allowGlobal,
  roomList,
  selectedRooms,
  onSelectedRoomsChange,
  global,
  order,
  onGlobalChange,
  onOrderChange,
  senderQuery,
  onSenderQueryChange,
  selectedTypes,
  onSelectedTypesChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onlyLinks,
  onOnlyLinksChange,
}: SearchFiltersProps) {
  const mx = useMatrixClient();
  const hasAdvancedFilters =
    !!senderQuery ||
    !!dateFrom ||
    !!dateTo ||
    !!onlyLinks ||
    !!(selectedTypes && selectedTypes.length > 0);

  const toggleType = (messageType: SearchMessageType) => {
    const nextTypes = selectedTypes?.includes(messageType)
      ? selectedTypes.filter((item) => item !== messageType)
      : [...(selectedTypes ?? []), messageType];
    onSelectedTypesChange(nextTypes.length > 0 ? nextTypes : undefined);
  };

  const resetAdvancedFilters = () => {
    onSenderQueryChange(undefined);
    onSelectedTypesChange(undefined);
    onDateFromChange(undefined);
    onDateToChange(undefined);
    onOnlyLinksChange(undefined);
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{'\u7b5b\u9009'}</Text>

      <Box direction="Column" gap="200">
        <Box gap="200" wrap="Wrap" alignItems="Center">
          <Chip
            variant={!global ? 'Success' : 'Surface'}
            aria-pressed={!global}
            before={!global && <Icon size="100" src={Icons.Check} />}
            outlined
            onClick={() => onGlobalChange()}
          >
            <Text size="T200">{defaultRoomsFilterName}</Text>
          </Chip>

          {allowGlobal && (
            <Chip
              variant={global ? 'Success' : 'Surface'}
              aria-pressed={global}
              before={global && <Icon size="100" src={Icons.Check} />}
              outlined
              onClick={() => onGlobalChange(true)}
            >
              <Text size="T200">{'\u5168\u5c40'}</Text>
            </Chip>
          )}

          <Line
            style={{ margin: `${config.space.S100} 0` }}
            direction="Vertical"
            variant="Surface"
            size="300"
          />

          {selectedRooms?.map((roomId) => {
            const room = mx.getRoom(roomId);
            if (!room) return null;

            return (
              <Chip
                key={roomId}
                variant="Success"
                onClick={() => onSelectedRoomsChange(selectedRooms.filter((rId) => rId !== roomId))}
                radii="Pill"
                before={
                  <Icon size="50" src={getRoomIconSrc(Icons, room.getType(), room.getJoinRule())} />
                }
                after={<Icon size="50" src={Icons.Cross} />}
              >
                <Text size="T200">{room.name}</Text>
              </Chip>
            );
          })}

          <SelectRoomButton
            roomList={roomList}
            selectedRooms={selectedRooms}
            onChange={onSelectedRoomsChange}
          />

          <Box grow="Yes" data-spacing-node />
          <OrderButton order={order} onChange={onOrderChange} />
        </Box>

        <Box direction="Column" gap="150">
          <Box wrap="Wrap" gap="200" alignItems="End">
            <Box direction="Column" gap="100" style={FILTER_FIELD_STYLE}>
              <Text size="T200" priority="300">
                {'\u53d1\u9001\u4eba'}
              </Text>
              <Input
                size="300"
                radii="300"
                placeholder={'\u6635\u79f0\u6216 Matrix ID'}
                value={senderQuery ?? ''}
                onChange={(evt) => onSenderQueryChange(evt.currentTarget.value || undefined)}
                style={{ minWidth: toRem(220), width: toRem(260) }}
              />
            </Box>

            <Box direction="Column" gap="100" style={FILTER_FIELD_STYLE}>
              <Text size="T200" priority="300">
                {'\u5f00\u59cb\u65e5\u671f'}
              </Text>
              <input
                type="date"
                value={dateFrom ?? ''}
                onChange={(evt) => onDateFromChange(evt.currentTarget.value || undefined)}
                style={DATE_INPUT_STYLE}
              />
            </Box>

            <Box direction="Column" gap="100" style={FILTER_FIELD_STYLE}>
              <Text size="T200" priority="300">
                {'\u7ed3\u675f\u65e5\u671f'}
              </Text>
              <input
                type="date"
                value={dateTo ?? ''}
                onChange={(evt) => onDateToChange(evt.currentTarget.value || undefined)}
                style={DATE_INPUT_STYLE}
              />
            </Box>

            <Chip
              variant={onlyLinks ? 'Success' : 'SurfaceVariant'}
              radii="Pill"
              outlined={!onlyLinks}
              aria-pressed={onlyLinks}
              onClick={() => onOnlyLinksChange(onlyLinks ? undefined : true)}
            >
              <Text size="T200">{'\u4ec5\u542b\u94fe\u63a5'}</Text>
            </Chip>

            {hasAdvancedFilters && (
              <Chip
                variant="Secondary"
                radii="Pill"
                outlined
                after={<Icon size="50" src={Icons.Cross} />}
                onClick={resetAdvancedFilters}
              >
                <Text size="T200">{'\u6e05\u7a7a\u9ad8\u7ea7\u7b5b\u9009'}</Text>
              </Chip>
            )}
          </Box>

          <Box wrap="Wrap" gap="100" alignItems="Center">
            <Text size="T200" priority="300">
              {'\u6d88\u606f\u7c7b\u578b'}
            </Text>
            {SEARCH_MESSAGE_TYPES.map((messageType) => {
              const active = !!selectedTypes?.includes(messageType);

              return (
                <Chip
                  key={messageType}
                  variant={active ? 'Success' : 'SurfaceVariant'}
                  radii="Pill"
                  outlined={!active}
                  aria-pressed={active}
                  onClick={() => toggleType(messageType)}
                >
                  <Text size="T200">{MESSAGE_TYPE_LABEL[messageType]}</Text>
                </Chip>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
