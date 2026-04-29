import { ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { useMatch } from 'react-router-dom';
import { isCompactScreenSize, ScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';
import { desktopPageNavCollapsedAtom } from '../state/desktopPageNav';

type MobileFriendlyClientNavProps = {
  children: ReactNode;
};
export function MobileFriendlyClientNav({ children }: MobileFriendlyClientNavProps) {
  const screenSize = useScreenSizeContext();
  if (isCompactScreenSize(screenSize)) {
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
  const desktopPageNavCollapsed = useAtomValue(desktopPageNavCollapsedAtom);
  const exactPath = useMatch({
    path,
    caseSensitive: true,
    end: true,
  });

  if (screenSize === ScreenSize.Desktop && desktopPageNavCollapsed) {
    return null;
  }

  if (isCompactScreenSize(screenSize) && !exactPath) {
    return null;
  }

  return children;
}
