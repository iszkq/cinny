import React, { useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { isDesktopLikeScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { getCanonicalAliasOrRoomId } from '../../../utils/matrix';
import { factoryRoomIdByActivity } from '../../../utils/sort';
import { desktopPageNavCollapsedAtom } from '../../../state/desktopPageNav';
import { getHomeRoomPath } from '../../pathUtils';
import { WelcomePage } from '../WelcomePage';
import { useHomeRooms } from './useHomeRooms';

export function HomeLanding() {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const screenSize = useScreenSizeContext();
  const desktopLayout = isDesktopLikeScreenSize(screenSize);
  const setDesktopPageNavCollapsed = useSetAtom(desktopPageNavCollapsedAtom);
  const rooms = useHomeRooms();

  const firstRoomId = useMemo(() => {
    const sortedRooms = [...rooms].sort(factoryRoomIdByActivity(mx));
    return sortedRooms[0];
  }, [mx, rooms]);

  useLayoutEffect(() => {
    if (!desktopLayout) return;

    setDesktopPageNavCollapsed(false);
  }, [desktopLayout, setDesktopPageNavCollapsed]);

  useLayoutEffect(() => {
    if (!desktopLayout || !firstRoomId) return;

    navigate(getHomeRoomPath(getCanonicalAliasOrRoomId(mx, firstRoomId)), { replace: true });
  }, [desktopLayout, firstRoomId, mx, navigate]);

  if (!desktopLayout) return null;
  if (!firstRoomId) return <WelcomePage />;

  return null;
}
