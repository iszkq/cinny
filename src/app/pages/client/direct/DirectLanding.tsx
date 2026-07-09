import React, { useLayoutEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { isDesktopLikeScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { getCanonicalAliasOrRoomId } from '../../../utils/matrix';
import { factoryRoomIdByActivity } from '../../../utils/sort';
import { desktopPageNavCollapsedAtom } from '../../../state/desktopPageNav';
import { getDirectRoomPath } from '../../pathUtils';
import { WelcomePage } from '../WelcomePage';
import { useDirectRooms } from './useDirectRooms';
import { useClientSyncReady } from '../../../hooks/useClientSyncReady';
import { ClientSyncLoadingPage } from '../ClientSyncLoading';

export function DirectLanding() {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const screenSize = useScreenSizeContext();
  const desktopLayout = isDesktopLikeScreenSize(screenSize);
  const setDesktopPageNavCollapsed = useSetAtom(desktopPageNavCollapsedAtom);
  const directs = useDirectRooms();
  const clientSyncReady = useClientSyncReady(mx);

  const firstDirectId = useMemo(() => {
    const sortedDirects = [...directs].sort(factoryRoomIdByActivity(mx));
    return sortedDirects[0];
  }, [directs, mx]);

  useLayoutEffect(() => {
    if (!desktopLayout) return;

    setDesktopPageNavCollapsed(false);
  }, [desktopLayout, setDesktopPageNavCollapsed]);

  useLayoutEffect(() => {
    if (!desktopLayout || !firstDirectId) return;

    navigate(getDirectRoomPath(getCanonicalAliasOrRoomId(mx, firstDirectId)), { replace: true });
  }, [desktopLayout, firstDirectId, mx, navigate]);

  if (!desktopLayout) return null;
  if (!clientSyncReady && !firstDirectId) {
    return (
      <ClientSyncLoadingPage
        title={'\u6b63\u5728\u540c\u6b65\u79c1\u804a'}
        content={'\u79c1\u804a\u5217\u8868\u9a6c\u4e0a\u51fa\u73b0\u3002'}
      />
    );
  }
  if (!firstDirectId) return <WelcomePage />;

  return null;
}
