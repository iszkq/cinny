import React, {
  FormEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  Input,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  config,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { factoryRoomIdByActivity } from '../../utils/sort';
import { NavCategory, NavCategoryHeader } from '../../components/nav';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { RoomNotificationMode } from '../../hooks/useRoomsNotificationPreferences';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { makeNavCategoryId } from '../../state/closedNavCategories';
import { useClosedNavCategoriesAtom } from '../../state/hooks/closedNavCategories';
import { useCategoryHandler } from '../../hooks/useCategoryHandler';
import { stopPropagation } from '../../utils/keyboard';
import {
  FAVORITE_ROOM_NAV_CATEGORY_ID,
  getRoomNavCustomCategories,
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
  custom: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
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
      custom: false,
      canMoveUp: false,
      canMoveDown: false,
    });
  }

  categories.forEach((category, index) => {
    const scopedRoomIds = getScopedRoomIds(category.roomIds, allowedRoomIds);

    sections.push({
      id: category.id,
      name: category.name,
      roomIds: scopedRoomIds,
      custom: true,
      canMoveUp: index > 0,
      canMoveDown: index < categories.length - 1,
    });
  });

  return sections;
};

type RoomNavCategoryOptionsProps = {
  categoryId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: () => void;
};

function RoomNavCategoryOptions({
  categoryId,
  canMoveUp,
  canMoveDown,
  onRename,
}: RoomNavCategoryOptionsProps) {
  const setRoomNavCategories = useSetAtom(useRoomNavCategoriesAtom());
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.stopPropagation();
    setMenuAnchor((currentState) =>
      currentState ? undefined : evt.currentTarget.getBoundingClientRect()
    );
  };

  const requestClose = useCallback(() => setMenuAnchor(undefined), []);

  const handleMoveCategory = (direction: 'UP' | 'DOWN') => {
    setRoomNavCategories({
      type: 'MOVE_CATEGORY',
      categoryId,
      direction,
    });
    requestClose();
  };

  const handleDeleteCategory = () => {
    setRoomNavCategories({
      type: 'DELETE_CATEGORY',
      categoryId,
    });
    requestClose();
  };

  const handleRenameCategory = () => {
    requestClose();
    onRename();
  };

  return (
    <PopOut
      anchor={menuAnchor}
      position="Bottom"
      align="End"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            returnFocusOnDeactivate: false,
            onDeactivate: requestClose,
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu style={{ maxWidth: toRem(180), width: '100vw' }}>
            <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
              <MenuItem
                onClick={handleRenameCategory}
                size="300"
                after={<Icon size="100" src={Icons.Pencil} />}
                radii="300"
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  {'\u91cd\u547d\u540d\u5206\u7c7b'}
                </Text>
              </MenuItem>
              <MenuItem
                onClick={() => handleMoveCategory('UP')}
                size="300"
                after={<Icon size="100" src={Icons.ArrowTop} />}
                radii="300"
                disabled={!canMoveUp}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  {'\u4e0a\u79fb\u5206\u7c7b'}
                </Text>
              </MenuItem>
              <MenuItem
                onClick={() => handleMoveCategory('DOWN')}
                size="300"
                after={<Icon size="100" src={Icons.ArrowBottom} />}
                radii="300"
                disabled={!canMoveDown}
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  {'\u4e0b\u79fb\u5206\u7c7b'}
                </Text>
              </MenuItem>
            </Box>
            <Line variant="Surface" size="300" />
            <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
              <MenuItem
                onClick={handleDeleteCategory}
                variant="Critical"
                fill="None"
                size="300"
                after={<Icon size="100" src={Icons.Delete} />}
                radii="300"
              >
                <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                  {'\u5220\u9664\u5206\u7c7b'}
                </Text>
              </MenuItem>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <IconButton
        onClick={handleOpenMenu}
        size="300"
        variant="Background"
        fill="None"
        radii="300"
        aria-label="分类选项"
        aria-pressed={!!menuAnchor}
      >
        <Icon size="50" src={Icons.VerticalDots} />
      </IconButton>
    </PopOut>
  );
}

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
  const setRoomNavCategories = useSetAtom(useRoomNavCategoriesAtom());
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const [closedCategories, setClosedCategories] = useAtom(useClosedNavCategoriesAtom());
  const [renamingCategoryId, setRenamingCategoryId] = useState<string>();
  const allowedRoomIds = useMemo(() => new Set(roomIds), [roomIds]);
  const handleCategoryClick = useCategoryHandler(setClosedCategories, (categoryId) =>
    closedCategories.has(categoryId)
  );

  const sections = useMemo(
    () =>
      makeSectionData(
        roomNavCategories.favorites,
        getRoomNavCustomCategories(roomNavCategories, scope),
        allowedRoomIds
      ).map((section) => ({
        ...section,
        roomIds: Array.from(section.roomIds).sort(factoryRoomIdByActivity(mx)),
      })),
    [allowedRoomIds, mx, roomNavCategories, scope]
  );

  const handleRenameCategory: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();

    const nameInput = evt.currentTarget.elements.namedItem('categoryNameInput');
    if (!(nameInput instanceof HTMLInputElement)) return;

    const name = nameInput.value.trim();
    if (!name || !renamingCategoryId) return;

    setRoomNavCategories({
      type: 'RENAME_CATEGORY',
      categoryId: renamingCategoryId,
      name,
    });
    setRenamingCategoryId(undefined);
  };

  const handleRenameCategoryKeyDown: KeyboardEventHandler<HTMLFormElement> = (evt) => {
    if (evt.key === 'Escape') {
      evt.stopPropagation();
      setRenamingCategoryId(undefined);
    }
  };

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
              {renamingCategoryId === section.id ? (
                <Box
                  as="form"
                  onSubmit={handleRenameCategory}
                  onKeyDown={handleRenameCategoryKeyDown}
                  alignItems="Center"
                  gap="100"
                  grow="Yes"
                >
                  <Input
                    name="categoryNameInput"
                    size="300"
                    variant="Background"
                    radii="300"
                    defaultValue={section.name}
                    style={{ flexGrow: 1, minWidth: 0 }}
                    autoFocus
                    required
                  />
                  <IconButton
                    type="submit"
                    size="300"
                    variant="Primary"
                    fill="Soft"
                    radii="300"
                    aria-label="保存分类名称"
                  >
                    <Icon size="50" src={Icons.Check} />
                  </IconButton>
                  <IconButton
                    type="button"
                    onClick={() => setRenamingCategoryId(undefined)}
                    size="300"
                    variant="Secondary"
                    fill="Soft"
                    radii="300"
                    aria-label="取消重命名"
                  >
                    <Icon size="50" src={Icons.Cross} />
                  </IconButton>
                </Box>
              ) : (
                <>
                  <RoomNavCategoryButton
                    closed={closed}
                    data-category-id={categoryId}
                    onClick={handleCategoryClick}
                  >
                    {section.name}
                  </RoomNavCategoryButton>
                  {section.custom && (
                    <RoomNavCategoryOptions
                      categoryId={section.id}
                      canMoveUp={section.canMoveUp}
                      canMoveDown={section.canMoveDown}
                      onRename={() => setRenamingCategoryId(section.id)}
                    />
                  )}
                </>
              )}
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
                  categoryScope={scope}
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
