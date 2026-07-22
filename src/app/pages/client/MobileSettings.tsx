import React, { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal500 } from '../../components/Modal500';
import { Settings, SettingsPages } from '../../features/settings';

type MobileSettingsContextValue = (initialPage?: SettingsPages) => void;

const MobileSettingsContext = createContext<MobileSettingsContextValue | undefined>(undefined);

type MobileSettingsProviderProps = {
  children: ReactNode;
};

export function MobileSettingsProvider({ children }: MobileSettingsProviderProps) {
  const [initialPage, setInitialPage] = useState<SettingsPages>();
  const [open, setOpen] = useState(false);

  const requestOpen = useCallback((page?: SettingsPages) => {
    setInitialPage(page);
    setOpen(true);
  }, []);
  const requestClose = useCallback(() => setOpen(false), []);
  const contextValue = useMemo(() => requestOpen, [requestOpen]);

  return (
    <MobileSettingsContext.Provider value={contextValue}>
      {children}
      {open && (
        <Modal500 requestClose={requestClose}>
          <Settings initialPage={initialPage} requestClose={requestClose} />
        </Modal500>
      )}
    </MobileSettingsContext.Provider>
  );
}

export const useMobileSettings = (): MobileSettingsContextValue => {
  const requestOpen = useContext(MobileSettingsContext);
  if (!requestOpen) {
    throw new Error('useMobileSettings must be used inside MobileSettingsProvider.');
  }
  return requestOpen;
};
