import React, { RefObject, useEffect, useMemo, useRef } from 'react';
import { Box, Icon, IconButton, Icons, Line, Spinner, Text, config, toRem } from 'folds';
import { useAtomValue } from 'jotai';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SearchOrderBy } from 'matrix-js-sdk';
import { useSearchParams } from 'react-router-dom';
import { PageHero, PageHeroEmpty, PageHeroSection } from '../../components/page';
import { SequenceCard } from '../../components/sequence-card';
import { ScrollTopContainer } from '../../components/scroll-top-container';
import { VirtualTile } from '../../components/virtualizer';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { _SearchPathSearchParams } from '../../pages/paths';
import { decodeSearchParamValueArray, encodeSearchParamValueArray } from '../../pages/pathUtils';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { useRooms } from '../../state/hooks/roomList';
import { useSetting } from '../../state/hooks/settings';
import { mDirectAtom } from '../../state/mDirectList';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { settingsAtom } from '../../state/settings';
import {
  MessageSearchParams,
  SEARCH_MESSAGE_TYPES,
  SearchMessageType,
  useMessageSearch,
} from './useMessageSearch';
import { SearchFilters } from './SearchFilters';
import { SearchInput } from './SearchInput';
import { SearchResultGroup } from './SearchResultGroup';

const useSearchPathSearchParams = (searchParams: URLSearchParams): _SearchPathSearchParams =>
  useMemo(
    () => ({
      global: searchParams.get('global') ?? undefined,
      term: searchParams.get('term') ?? undefined,
      order: searchParams.get('order') ?? undefined,
      rooms: searchParams.get('rooms') ?? undefined,
      senders: searchParams.get('senders') ?? undefined,
      senderQuery: searchParams.get('senderQuery') ?? undefined,
      msgTypes: searchParams.get('msgTypes') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      links: searchParams.get('links') ?? undefined,
    }),
    [searchParams]
  );

type MessageSearchProps = {
  defaultRoomsFilterName: string;
  allowGlobal?: boolean;
  rooms: string[];
  senders?: string[];
  scrollRef: RefObject<HTMLDivElement>;
};

export function MessageSearch({
  defaultRoomsFilterName,
  allowGlobal,
  rooms,
  senders,
  scrollRef,
}: MessageSearchProps) {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const allRooms = useRooms(mx, allRoomsAtom, mDirects);
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollTopAnchorRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const searchPathSearchParams = useSearchPathSearchParams(searchParams);
  const { navigateRoom } = useRoomNavigate();

  const searchParamRooms = useMemo(() => {
    if (!searchPathSearchParams.rooms) return undefined;
    const joinedRoomIds = decodeSearchParamValueArray(searchPathSearchParams.rooms).filter(
      (roomId) => allRooms.includes(roomId)
    );
    return joinedRoomIds.length > 0 ? joinedRoomIds : undefined;
  }, [allRooms, searchPathSearchParams.rooms]);

  const searchParamsSenders = useMemo(() => {
    if (!searchPathSearchParams.senders) return undefined;
    const decodedSenders = decodeSearchParamValueArray(searchPathSearchParams.senders);
    return decodedSenders.length > 0 ? decodedSenders : undefined;
  }, [searchPathSearchParams.senders]);

  const searchParamsMsgTypes = useMemo(() => {
    if (!searchPathSearchParams.msgTypes) return undefined;
    const decodedTypes = decodeSearchParamValueArray(searchPathSearchParams.msgTypes).filter(
      (value): value is SearchMessageType =>
        SEARCH_MESSAGE_TYPES.includes(value as SearchMessageType)
    );
    return decodedTypes.length > 0 ? decodedTypes : undefined;
  }, [searchPathSearchParams.msgTypes]);

  const msgSearchParams: MessageSearchParams = useMemo(() => {
    const isGlobal = searchPathSearchParams.global === 'true';
    const defaultRooms = isGlobal ? undefined : rooms;

    return {
      term: searchPathSearchParams.term,
      order: searchPathSearchParams.order ?? SearchOrderBy.Recent,
      rooms: searchParamRooms ?? defaultRooms,
      senders: searchParamsSenders ?? senders,
      senderQuery: searchPathSearchParams.senderQuery,
      msgTypes: searchParamsMsgTypes,
      dateFrom: searchPathSearchParams.dateFrom,
      dateTo: searchPathSearchParams.dateTo,
      onlyLinks: searchPathSearchParams.links === 'true',
    };
  }, [
    rooms,
    searchParamRooms,
    searchParamsMsgTypes,
    searchParamsSenders,
    searchPathSearchParams,
    senders,
  ]);
  const hasSearchCriteria =
    !!msgSearchParams.term ||
    !!(msgSearchParams.senders && msgSearchParams.senders.length > 0) ||
    !!msgSearchParams.senderQuery ||
    !!msgSearchParams.dateFrom ||
    !!msgSearchParams.dateTo ||
    !!msgSearchParams.onlyLinks ||
    !!(msgSearchParams.msgTypes && msgSearchParams.msgTypes.length > 0);

  const searchMessages = useMessageSearch(msgSearchParams);

  const { status, data, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    enabled: hasSearchCriteria,
    queryKey: [
      'search',
      msgSearchParams.term,
      msgSearchParams.order,
      msgSearchParams.rooms,
      msgSearchParams.senders,
      msgSearchParams.senderQuery,
      msgSearchParams.msgTypes,
      msgSearchParams.dateFrom,
      msgSearchParams.dateTo,
      msgSearchParams.onlyLinks,
    ],
    queryFn: ({ pageParam }) => searchMessages(pageParam),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextToken,
  });

  const groups = useMemo(() => data?.pages.flatMap((result) => result.groups) ?? [], [data]);
  const highlights = useMemo(() => {
    const mixedHighlights = data?.pages.flatMap((result) => result.highlights) ?? [];
    return Array.from(new Set(mixedHighlights));
  }, [data]);

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 1,
  });
  const vItems = virtualizer.getVirtualItems();

  const updateSearchParams = (updater: (params: URLSearchParams) => void) => {
    setSearchParams((prevParams) => {
      const newParams = new URLSearchParams(prevParams);
      updater(newParams);
      return newParams;
    });
  };

  const handleSearch = (term: string) => {
    updateSearchParams((params) => {
      params.delete('term');
      params.append('term', term);
    });
  };

  const handleSearchClear = () => {
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    updateSearchParams((params) => {
      params.delete('term');
    });
  };

  const handleSelectedRoomsChange = (selectedRooms?: string[]) => {
    updateSearchParams((params) => {
      params.delete('rooms');
      if (selectedRooms && selectedRooms.length > 0) {
        params.append('rooms', encodeSearchParamValueArray(selectedRooms));
      }
    });
  };

  const handleGlobalChange = (global?: boolean) => {
    updateSearchParams((params) => {
      params.delete('global');
      if (global) {
        params.append('global', 'true');
      }
    });
  };

  const handleOrderChange = (order?: string) => {
    updateSearchParams((params) => {
      params.delete('order');
      if (order) {
        params.append('order', order);
      }
    });
  };

  const handleSenderQueryChange = (senderQuery?: string) => {
    updateSearchParams((params) => {
      params.delete('senderQuery');
      if (senderQuery) {
        params.append('senderQuery', senderQuery);
      }
    });
  };

  const handleSelectedTypesChange = (types?: SearchMessageType[]) => {
    updateSearchParams((params) => {
      params.delete('msgTypes');
      if (types && types.length > 0) {
        params.append('msgTypes', encodeSearchParamValueArray(types));
      }
    });
  };

  const handleDateFromChange = (dateFrom?: string) => {
    updateSearchParams((params) => {
      params.delete('dateFrom');
      if (dateFrom) {
        params.append('dateFrom', dateFrom);
      }
    });
  };

  const handleDateToChange = (dateTo?: string) => {
    updateSearchParams((params) => {
      params.delete('dateTo');
      if (dateTo) {
        params.append('dateTo', dateTo);
      }
    });
  };

  const handleOnlyLinksChange = (onlyLinks?: boolean) => {
    updateSearchParams((params) => {
      params.delete('links');
      if (onlyLinks) {
        params.append('links', 'true');
      }
    });
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: 0 });
    virtualizer.scrollToOffset(0);
  }, [
    msgSearchParams.dateFrom,
    msgSearchParams.dateTo,
    msgSearchParams.msgTypes,
    msgSearchParams.onlyLinks,
    msgSearchParams.order,
    msgSearchParams.rooms,
    msgSearchParams.senderQuery,
    msgSearchParams.senders,
    msgSearchParams.term,
    scrollRef,
    virtualizer,
  ]);

  const lastVItem = vItems[vItems.length - 1];
  const lastVItemIndex: number | undefined = lastVItem?.index;
  const lastGroupIndex = groups.length - 1;

  useEffect(() => {
    if (
      lastGroupIndex > -1 &&
      lastGroupIndex === lastVItemIndex &&
      !isFetchingNextPage &&
      hasNextPage
    ) {
      fetchNextPage();
    }
  }, [lastGroupIndex, lastVItemIndex, fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <Box direction="Column" gap="700">
      <ScrollTopContainer scrollRef={scrollRef} anchorRef={scrollTopAnchorRef}>
        <IconButton
          onClick={() => virtualizer.scrollToOffset(0)}
          variant="SurfaceVariant"
          radii="Pill"
          outlined
          size="300"
          aria-label={'\u56de\u5230\u9876\u90e8'}
        >
          <Icon src={Icons.ChevronTop} size="300" />
        </IconButton>
      </ScrollTopContainer>

      <Box ref={scrollTopAnchorRef} direction="Column" gap="300">
        <SearchInput
          active={!!msgSearchParams.term}
          loading={status === 'pending'}
          searchInputRef={searchInputRef}
          onSearch={handleSearch}
          onReset={handleSearchClear}
        />
        <SearchFilters
          defaultRoomsFilterName={defaultRoomsFilterName}
          allowGlobal={allowGlobal}
          roomList={searchPathSearchParams.global === 'true' ? allRooms : rooms}
          selectedRooms={searchParamRooms}
          onSelectedRoomsChange={handleSelectedRoomsChange}
          global={searchPathSearchParams.global === 'true'}
          onGlobalChange={handleGlobalChange}
          order={msgSearchParams.order}
          onOrderChange={handleOrderChange}
          senderQuery={msgSearchParams.senderQuery}
          onSenderQueryChange={handleSenderQueryChange}
          selectedTypes={msgSearchParams.msgTypes}
          onSelectedTypesChange={handleSelectedTypesChange}
          dateFrom={msgSearchParams.dateFrom}
          dateTo={msgSearchParams.dateTo}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onlyLinks={msgSearchParams.onlyLinks}
          onOnlyLinksChange={handleOnlyLinksChange}
        />
      </Box>

      {!hasSearchCriteria && status === 'pending' && (
        <PageHeroEmpty>
          <PageHeroSection>
            <PageHero
              icon={<Icon size="600" src={Icons.Message} />}
              title={'\u641c\u7d22\u6d88\u606f'}
              subTitle={
                '\u4f7f\u7528\u5173\u952e\u8bcd\u5728\u5f53\u524d\u4f1a\u8bdd\u8303\u56f4\u5185\u67e5\u627e\u5386\u53f2\u6d88\u606f\u3002'
              }
            />
          </PageHeroSection>
        </PageHeroEmpty>
      )}

      {hasSearchCriteria && groups.length === 0 && status === 'success' && (
        <Box
          className={ContainerColor({ variant: 'Warning' })}
          style={{ padding: config.space.S300, borderRadius: config.radii.R400 }}
          alignItems="Center"
          gap="200"
        >
          <Icon size="200" src={Icons.Info} />
          {msgSearchParams.term ? (
            <Text>
              {'\u672a\u627e\u5230\u4e0e '}
              <b>{`"${msgSearchParams.term}"`}</b>
              {' \u76f8\u5173\u7684\u7ed3\u679c'}
            </Text>
          ) : (
            <Text>{'\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6682\u65e0\u8bb0\u5f55'}</Text>
          )}
        </Box>
      )}

      {((hasSearchCriteria && status === 'pending') ||
        (groups.length > 0 && vItems.length === 0)) && (
        <Box direction="Column" gap="100">
          {[...Array(8).keys()].map((key) => (
            <SequenceCard variant="SurfaceVariant" key={key} style={{ minHeight: toRem(80) }} />
          ))}
        </Box>
      )}

      {vItems.length > 0 && (
        <Box direction="Column" gap="300">
          <Box direction="Column" gap="200">
            <Text size="H5">
              {msgSearchParams.term
                ? `"${msgSearchParams.term}" \u7684\u641c\u7d22\u7ed3\u679c`
                : '\u7b5b\u9009\u7ed3\u679c'}
            </Text>
            <Text size="T300" priority="300">
              {
                '\u70b9\u51fb\u7ed3\u679c\u5373\u53ef\u8df3\u8f6c\u5230\u539f\u6d88\u606f\u5e76\u9ad8\u4eae\u5b9a\u4f4d\u3002'
              }
            </Text>
            <Line size="300" variant="Surface" />
          </Box>

          <div
            style={{
              position: 'relative',
              height: virtualizer.getTotalSize(),
            }}
          >
            {vItems.map((vItem) => {
              const group = groups[vItem.index];
              if (!group) return null;

              const groupRoom = mx.getRoom(group.roomId);
              if (!groupRoom) return null;

              return (
                <VirtualTile
                  virtualItem={vItem}
                  style={{ paddingBottom: config.space.S500 }}
                  ref={virtualizer.measureElement}
                  key={vItem.index}
                >
                  <SearchResultGroup
                    room={groupRoom}
                    highlights={highlights}
                    items={group.items}
                    mediaAutoLoad={mediaAutoLoad}
                    urlPreview={urlPreview}
                    onOpen={navigateRoom}
                    legacyUsernameColor={legacyUsernameColor || mDirects.has(groupRoom.roomId)}
                    hour24Clock={hour24Clock}
                    dateFormatString={dateFormatString}
                  />
                </VirtualTile>
              );
            })}
          </div>

          {isFetchingNextPage && (
            <Box justifyContent="Center" alignItems="Center">
              <Spinner size="600" variant="Secondary" />
            </Box>
          )}
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
  );
}
