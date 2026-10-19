import React from 'react';
import { color } from 'folds';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';

export function ThemeMode() {
  const [system, setSystem] = useSetting(settingsAtom, 'useSystemTheme');
  const [theme, setTheme] = useSetting(settingsAtom, 'themeId');
  return (
    <select
      aria-label="界面模式"
      value={
        system ? 'system' : theme === 'dark-theme' || theme === 'butter-theme' ? 'dark' : 'light'
      }
      style={{
        margin: '4px 12px',
        width: 'calc(100% - 24px)',
        minHeight: 32,
        padding: '4px 8px',
        borderRadius: 8,
        border: `1px solid ${color.Background.ContainerLine}`,
        background: color.Background.Container,
        color: color.Background.OnContainer,
        font: 'inherit',
        fontSize: 13,
      }}
      onChange={(e) => {
        const mode = e.currentTarget.value;
        if (mode !== 'system') setTheme(mode === 'dark' ? 'dark-theme' : 'light-theme');
        setSystem(mode === 'system');
      }}
    >
      <option value="light">☀ 白天模式</option>
      <option value="dark">☾ 夜间模式</option>
      <option value="system">◐ 跟随系统</option>
    </select>
  );
}
