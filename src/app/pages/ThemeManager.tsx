import React, { ReactNode, useEffect } from 'react';
import { configClass, varsClass } from 'folds';
import {
  DarkTheme,
  LightTheme,
  ThemeContextProvider,
  ThemeKind,
  useActiveTheme,
  useSystemThemeKind,
} from '../hooks/useTheme';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import {
  APPEARANCE_MANAGED_VARS,
  createAppearanceVariableMap,
} from '../theme/appearance';

const clearAppearanceVariables = () => {
  APPEARANCE_MANAGED_VARS.forEach((cssVar) => {
    document.body.style.removeProperty(cssVar);
  });
};

export function UnAuthRouteThemeManager() {
  const systemThemeKind = useSystemThemeKind();

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);
    clearAppearanceVariables();
    document.body.style.filter = '';
    if (systemThemeKind === ThemeKind.Dark) {
      document.body.classList.add(...DarkTheme.classNames);
    }
    if (systemThemeKind === ThemeKind.Light) {
      document.body.classList.add(...LightTheme.classNames);
    }
  }, [systemThemeKind]);

  return null;
}

export function AuthRouteThemeManager({ children }: { children: ReactNode }) {
  const activeTheme = useActiveTheme();
  const [monochromeMode] = useSetting(settingsAtom, 'monochromeMode');
  const [interfaceStyle] = useSetting(settingsAtom, 'interfaceStyle');
  const [accentColorId] = useSetting(settingsAtom, 'accentColorId');
  const [accentOpacity] = useSetting(settingsAtom, 'accentOpacity');
  const [outgoingBubbleColorId] = useSetting(settingsAtom, 'outgoingBubbleColorId');
  const [outgoingBubbleOpacity] = useSetting(settingsAtom, 'outgoingBubbleOpacity');
  const [incomingBubbleColorId] = useSetting(settingsAtom, 'incomingBubbleColorId');
  const [incomingBubbleOpacity] = useSetting(settingsAtom, 'incomingBubbleOpacity');

  useEffect(() => {
    document.body.className = '';
    document.body.classList.add(configClass, varsClass);
    document.body.classList.add(...activeTheme.classNames);
    clearAppearanceVariables();

    const appearanceVariables = createAppearanceVariableMap({
      interfaceStyle,
      accentColorId,
      accentOpacity,
      outgoingBubbleColorId,
      outgoingBubbleOpacity,
      incomingBubbleColorId,
      incomingBubbleOpacity,
      themeKind: activeTheme.kind,
      themeClassNames: activeTheme.classNames,
    });

    Object.entries(appearanceVariables).forEach(([cssVar, cssValue]) => {
      document.body.style.setProperty(cssVar, cssValue);
    });

    if (monochromeMode) {
      document.body.style.filter = 'grayscale(1)';
    } else {
      document.body.style.filter = '';
    }
  }, [
    activeTheme,
    monochromeMode,
    interfaceStyle,
    accentColorId,
    accentOpacity,
    outgoingBubbleColorId,
    outgoingBubbleOpacity,
    incomingBubbleColorId,
    incomingBubbleOpacity,
  ]);

  return <ThemeContextProvider value={activeTheme}>{children}</ThemeContextProvider>;
}
