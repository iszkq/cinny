import { WritableAtom } from 'jotai';
import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from './utils/atomWithLocalStorage';

const DESKTOP_PAGE_NAV_COLLAPSED = 'desktopPageNavCollapsed';

export type DesktopPageNavCollapsedAtom = WritableAtom<boolean, [boolean], undefined>;

export const desktopPageNavCollapsedAtom: DesktopPageNavCollapsedAtom =
  atomWithLocalStorage<boolean>(
    DESKTOP_PAGE_NAV_COLLAPSED,
    (key) => getLocalStorageItem<boolean>(key, true),
    (key, value) => {
      setLocalStorageItem(key, value);
    }
  );
