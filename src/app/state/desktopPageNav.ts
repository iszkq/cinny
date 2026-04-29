import { WritableAtom } from 'jotai';
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './utils/atomWithLocalStorage';

const DESKTOP_PAGE_NAV_COLLAPSED = 'desktopSecondaryPageNavCollapsed';
const DESKTOP_PAGE_NAV_WIDTH = 'desktopSecondaryPageNavWidth';

export type DesktopPageNavCollapsedAtom = WritableAtom<boolean, [boolean], undefined>;
export type DesktopPageNavWidthAtom = WritableAtom<number, [number], undefined>;

export const desktopPageNavCollapsedAtom: DesktopPageNavCollapsedAtom =
  atomWithLocalStorage<boolean>(
    DESKTOP_PAGE_NAV_COLLAPSED,
    (key) => getLocalStorageItem<boolean>(key, false),
    (key, value) => {
      setLocalStorageItem(key, value);
    }
  );

export const desktopPageNavWidthAtom: DesktopPageNavWidthAtom = atomWithLocalStorage<number>(
  DESKTOP_PAGE_NAV_WIDTH,
  (key) => getLocalStorageItem<number>(key, 256),
  (key, value) => {
    setLocalStorageItem(key, value);
  }
);
