import { ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { useMatch } from 'react-router-dom';
import {
  isCompactScreenSize,
  isDesktopLikeScreenSize,
  useScreenSizeContext,
} from '../hooks/useScreenSize';
import { desktopPageNavCollapsedAtom } from '../state/desktopPageNav';
import { isDesktopUpdaterSupported } from '../utils/desktopUpdater';

type MobileFriendlyClientNavProps = {
  children: ReactNode;
};
export function MobileFriendlyClientNav({ children }: MobileFriendlyClientNavProps) {
  const screenSize = useScreenSizeContext();
  const desktopApp = isDesktopUpdaterSupported();
  if (isCompactScreenSize(screenSize) && !desktopApp) {
    return null;
  }

  return children;
}

type MobileFriendlyPageNavProps = {
  path: string;
  children: ReactNode;
};
export function MobileFriendlyPageNav({ path, children }: MobileFriendlyPageNavProps) {
  const screenSize = useScreenSizeContext();
  const desktopApp = isDesktopUpdaterSupported();
  const desktopLayout = isDesktopLikeScreenSize(screenSize);
  const desktopPageNavCollapsed = useAtomValue(desktopPageNavCollapsedAtom);
  const exactPath = useMatch({
    path,
    caseSensitive: true,
    end: true,
  });

  if (desktopLayout && desktopPageNavCollapsed) {
    return null;
  }

  if (isCompactScreenSize(screenSize) && !exactPath && !desktopApp) {
    return null;
  }

  return children;
}
