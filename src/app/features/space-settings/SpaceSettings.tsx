import React, { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Avatar, Box, config, Icon, IconButton, Icons, IconSrc, Text } from 'folds';
import { JoinRule } from 'matrix-js-sdk';
import { PageNav, PageNavContent, PageNavHeader, PageRoot } from '../../components/page';
import { isDesktopLikeScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { mxcUrlToHttp } from '../../utils/matrix';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoomAvatar, useRoomJoinRule, useRoomName } from '../../hooks/useRoomMeta';
import { mDirectAtom } from '../../state/mDirectList';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { SpaceSettingsPage } from '../../state/spaceSettings';
import { useRoom } from '../../hooks/useRoom';
import { EmojisStickers } from '../common-settings/emojis-stickers';
import { Members } from '../common-settings/members';
import { DeveloperTools } from '../common-settings/developer-tools';
import { General } from './general';
import { Permissions } from './permissions';
import { NavButton, NavItem, NavItemContent } from '../../components/nav';

type SpaceSettingsMenuItem = {
  page: SpaceSettingsPage;
  name: string;
  icon: IconSrc;
};

const useSpaceSettingsMenuItems = (): SpaceSettingsMenuItem[] =>
  useMemo(
    () => [
      {
        page: SpaceSettingsPage.GeneralPage,
        name: '\u5e38\u89c4',
        icon: Icons.Setting,
      },
      {
        page: SpaceSettingsPage.MembersPage,
        name: '\u6210\u5458',
        icon: Icons.User,
      },
      {
        page: SpaceSettingsPage.PermissionsPage,
        name: '\u6743\u9650',
        icon: Icons.Lock,
      },
      {
        page: SpaceSettingsPage.EmojisStickersPage,
        name: '\u8868\u60c5\u4e0e\u5206\u7c7b',
        icon: Icons.Smile,
      },
      {
        page: SpaceSettingsPage.DeveloperToolsPage,
        name: '\u5f00\u53d1\u5de5\u5177',
        icon: Icons.Terminal,
      },
    ],
    []
  );

type SpaceSettingsProps = {
  initialPage?: SpaceSettingsPage;
  requestClose: () => void;
};
export function SpaceSettings({ initialPage, requestClose }: SpaceSettingsProps) {
  const room = useRoom();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const mDirects = useAtomValue(mDirectAtom);

  const roomAvatar = useRoomAvatar(room, mDirects.has(room.roomId));
  const roomName = useRoomName(room);
  const joinRuleContent = useRoomJoinRule(room);

  const avatarUrl = roomAvatar
    ? mxcUrlToHttp(mx, roomAvatar, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const screenSize = useScreenSizeContext();
  const compact = !isDesktopLikeScreenSize(screenSize);
  const [activePage, setActivePage] = useState<SpaceSettingsPage | undefined>(() => {
    if (initialPage) return initialPage;
    return compact ? undefined : SpaceSettingsPage.GeneralPage;
  });
  const menuItems = useSpaceSettingsMenuItems();

  const handlePageRequestClose = () => {
    if (compact) {
      setActivePage(undefined);
      return;
    }
    requestClose();
  };

  return (
    <PageRoot
      nav={
        compact && activePage !== undefined ? undefined : (
          <PageNav size="300">
            <PageNavHeader outlined={false}>
              <Box grow="Yes" gap="200">
                <Avatar size="200" radii="300">
                  <RoomAvatar
                    roomId={room.roomId}
                    src={avatarUrl}
                    alt={roomName}
                    renderFallback={() => (
                      <RoomIcon
                        roomType={room.getType()}
                        size="50"
                        joinRule={joinRuleContent?.join_rule ?? JoinRule.Invite}
                        filled
                      />
                    )}
                  />
                </Avatar>
                <Text size="H4" truncate>
                  {roomName}
                </Text>
              </Box>
              <Box shrink="No">
                {compact && (
                  <IconButton onClick={requestClose} variant="Background">
                    <Icon src={Icons.Cross} />
                  </IconButton>
                )}
              </Box>
            </PageNavHeader>
            <Box grow="Yes" direction="Column">
              <PageNavContent>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: config.space.S100,
                    flexGrow: 1,
                  }}
                >
                  {menuItems.map((item) => (
                    <NavItem
                      key={item.name}
                      variant="Background"
                      radii="400"
                      aria-selected={activePage === item.page}
                      highlight={activePage === item.page}
                    >
                      <NavButton type="button" onClick={() => setActivePage(item.page)}>
                        <NavItemContent>
                          <Box as="span" grow="Yes" alignItems="Center" gap="200">
                            <Icon
                              src={item.icon}
                              size="100"
                              filled={activePage === item.page}
                            />
                            <Box as="span" grow="Yes">
                              <Text size="Inherit" as="span" truncate>
                                {item.name}
                              </Text>
                            </Box>
                          </Box>
                        </NavItemContent>
                      </NavButton>
                    </NavItem>
                  ))}
                </div>
              </PageNavContent>
            </Box>
          </PageNav>
        )
      }
    >
      {activePage === SpaceSettingsPage.GeneralPage && (
        <General requestClose={handlePageRequestClose} />
      )}
      {activePage === SpaceSettingsPage.MembersPage && (
        <Members requestClose={handlePageRequestClose} />
      )}
      {activePage === SpaceSettingsPage.PermissionsPage && (
        <Permissions requestClose={handlePageRequestClose} />
      )}
      {activePage === SpaceSettingsPage.EmojisStickersPage && (
        <EmojisStickers requestClose={handlePageRequestClose} />
      )}
      {activePage === SpaceSettingsPage.DeveloperToolsPage && (
        <DeveloperTools requestClose={handlePageRequestClose} />
      )}
    </PageRoot>
  );
}
