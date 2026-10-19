import React from 'react';
import { Box, Text } from 'folds';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';

const safeSize = (value: number) =>
  Number.isFinite(value) ? Math.min(24, Math.max(14, value)) : 16;
export function NavigationFontStyle() {
  const [room] = useSetting(settingsAtom, 'roomNameFontSize');
  const [space] = useSetting(settingsAtom, 'spaceNameFontSize');
  return (
    <style>{`:root { --starfire-space-font: calc(${safeSize(
      space
    )}px * var(--app-text-scale, 1)); } [data-room-name], .native-room-name { font-size: calc(${safeSize(
      room
    )}px * var(--app-text-scale, 1)) !important; line-height: 1.4 !important; } [data-space-name] { font-size: calc(${safeSize(
      space
    )}px * var(--app-text-scale, 1)) !important; line-height: 1.4 !important; }`}</style>
  );
}
export function NavigationFontSettings() {
  const [room, setRoom] = useSetting(settingsAtom, 'roomNameFontSize');
  const [space, setSpace] = useSetting(settingsAtom, 'spaceNameFontSize');
  return (
    <Box direction="Column" gap="300">
      <Text size="L400">房间与空间字号</Text>
      <label>
        房间名称：{safeSize(room)} px
        <input
          aria-label="房间名称字号"
          type="range"
          min={14}
          max={24}
          step={1}
          value={safeSize(room)}
          onChange={(e) => setRoom(Number(e.currentTarget.value))}
        />
      </label>
      <Text style={{ fontSize: safeSize(room) }}>房间预览 · 日常交流</Text>
      <label>
        空间名称：{safeSize(space)} px
        <input
          aria-label="空间名称字号"
          type="range"
          min={14}
          max={24}
          step={1}
          value={safeSize(space)}
          onChange={(e) => setSpace(Number(e.currentTarget.value))}
        />
      </label>
      <Text style={{ fontSize: safeSize(space) }}>空间预览 · 我的团队</Text>
      <Text size="T200">调整后立即生效，自动保存在当前设备。</Text>
    </Box>
  );
}
