import { createContext, useContext } from 'react';
export const SpaceSelectionContext = createContext<(() => void) | undefined>(undefined);
export const useCloseSpaceSelection = () => useContext(SpaceSelectionContext);
