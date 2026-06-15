import React, { useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Box } from 'folds';
import { factoryRoomIdByActivity } from '../../utils/sort';
import { NavCategory, NavCategoryHeader } from '../../components/nav';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { RoomNotificationMode } from '../../hooks/useRoomsNotificationPreferences';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { makeNavCategoryId } from '../../state/closedNavCategories';
import { useClosedNavCategoriesAtom } from '../../state/hooks/closedNavCategories';
import { useCategoryHandler } from '../../hooks/useCategoryHandler';
import {
  FAVORITE_ROOM_NAV_CATEGORY_ID,
  RoomNavCustomCategory,
} from '../../state/roomNavCategories';
import { useRoomNavCategoriesAtom } from '../../state/hooks/roomNavCategories';
import { RoomNavCategoryButton } from './RoomNavCategoryButton';
import { RoomNavItem } from './RoomNavItem';

type RoomNavItemRoom = React.ComponentProps<typeof RoomNavItem>['room'];

type RoomNavCategorySectionData = {
  id: string;
  name: string;
  roomIds: string[];
};

type RoomNavCategorySectionsProps = {
  scope: string;
  roomIds: string[];
  selectedRoomId?: string;
  getRoom: (roomId: string) => RoomNavItemRoom | undefined;
  getLinkPath: (roomId: string) => string;
  getNotificationMode: (roomId: string) => RoomNotificationMode;
  direct?: boolean | ((roomId: string) => boolean);
  showAvatar?: boolean;
};

const getScopedRoomIds = (roomIds: string[], allowedRoomIds: Set<string>): string[] =>
  roomIds.filter((roomId) => allowedRoomIds.has(roomId));

const makeSectionData = (
  favorites: string[],
  categories: RoomNavCustomCategory[],
  allowedRoomIds: Set<string>
): RoomNavCategorySectionData[] => {
  const sections: RoomNavCategorySectionData[] = [];
  const favoriteRoomIds = getScopedRoomIds(favorites, allowedRoomIds);

  if (favoriteRoomIds.length > 0) {
    sections.push({
      id: FAVORITE_ROOM_NAV_CATEGORY_ID,
      name: '\u6536\u85cf',
      roomIds: favoriteRoomIds,
    });
  }

  categories.forEach((category) => {
    const scopedRoomIds = getScopedRoomIds(category.roomIds, allowedRoomIds);
    if (scopedRoomIds.length === 0) return;

    sections.push({
      id: category.id,
      name: category.name,
      roomIds: scopedRoomIds,
    });
  });

  return sections;
};

export function RoomNavCategorySections({
  scope,
  roomIds,
  selectedRoomId,
  getRoom,
  getLinkPath,
  getNotificationMode,
  direct,
  showAvatar = true,
}: RoomNavCategorySectionsProps) {
  const mx = useMatrixClient();
  const roomNavCategories = useAtomValue(useRoomNavCategoriesAtom());
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());
  const allowedRoomIds = useMemo(() => new Set(roomIds), [roomIds]);
  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  const sections = useMemo(
    () =>
      makeSectionData(
        roomNavCategories.favorites,
        roomNavCategories.categories,
        allowedRoomIds
      ).map((section) => ({
        ...section,
        roomIds: Array.from(section.roomIds).sort(factoryRoomIdByActivity(mx)),
      })),
    [allowedRoomIds, mx, roomNavCategories]
  );

  if (sections.length === 0) return null;

  return (
    <Box direction="Column" gap="300">
      {sections.map((section) => {
        const categoryId = makeNavCategoryId('room-nav-category', scope, section.id);
        const closed = closedCategories.has(categoryId);
        const visibleRoomIds = closed
          ? section.roomIds.filter(
              (roomId) => roomToUnread.has(roomId) || roomId === selectedRoomId
            )
          : section.roomIds;

        return (
          <NavCategory key={section.id}>
            <NavCategoryHeader>
              <RoomNavCategoryButton
                closed={closed}
                data-category-id={categoryId}
                onClick={handleCategoryClick}
              >
                {section.name}
              </RoomNavCategoryButton>
            </NavCategoryHeader>
            {visibleRoomIds.map((roomId) => {
              const room = getRoom(roomId);
              if (!room) return null;
              const isDirect = typeof direct === 'function' ? direct(roomId) : direct;

              return (
                <RoomNavItem
                  key={roomId}
                  room={room}
                  selected={selectedRoomId === roomId}
                  showAvatar={showAvatar}
                  direct={isDirect}
                  linkPath={getLinkPath(roomId)}
                  notificationMode={getNotificationMode(roomId)}
                />
              );
            })}
          </NavCategory>
        );
      })}
    </Box>
  );
}
