import React, { useEffect } from 'react';
import { Box, Button, Text } from 'folds';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { APP_TEXT_SIZES, normalizeAppTextSize } from '../../../utils/appTextSize';
import './appTextSize.css';
import './AppTextLayout.css';

const labels = ['小', '标准', '较大', '大', '特大'];
export function AppTextSizeFeature() {
  const [size] = useSetting(settingsAtom, 'appTextSize');
  const [zoom] = useSetting(settingsAtom, 'pageZoom');
  useEffect(() => {
    const scale = normalizeAppTextSize(size) / 100;
    const pageScale = Number.isFinite(zoom) ? Math.min(200, Math.max(50, zoom)) / 100 : 1;
    const root = document.documentElement;
    root.style.setProperty('--app-text-scale', String(scale));
    root.style.fontSize = `${16 * scale * pageScale}px`;
    root.dataset.appTextSize = String(normalizeAppTextSize(size));
  }, [size, zoom]);
  return null;
}
export function AppTextSizeSettings() {
  const [stored, setSize] = useSetting(settingsAtom, 'appTextSize');
  const size = normalizeAppTextSize(stored);
  const index = APP_TEXT_SIZES.indexOf(size as typeof APP_TEXT_SIZES[number]);
  return (
    <details className="app-text-size-settings">
      <summary>
        整个 APP 文字大小 · {labels[index]}（{size}%）
      </summary>
      <Box direction="Column" gap="400" style={{ padding: '16px 0', minWidth: 0 }}>
        <Text>调整聊天、列表、菜单和设置文字，立即生效，保存在当前设备。</Text>
        <label htmlFor="app-text-size">
          文字大小：{labels[index]}（{size}%）
        </label>
        <input
          id="app-text-size"
          aria-label="整个 APP 文字大小"
          aria-valuetext={`${labels[index]}，${size}%`}
          type="range"
          min={0}
          max={4}
          step={1}
          value={index}
          onChange={(event) => setSize(APP_TEXT_SIZES[Number(event.currentTarget.value)])}
        />
        <div className="app-text-size-options">
          {APP_TEXT_SIZES.map((value, i) => (
            <button key={value} aria-pressed={size === value} onClick={() => setSize(value)}>
              {labels[i]}
            </button>
          ))}
        </div>
        <Box direction="Column" gap="200" className="app-text-preview">
          <Text size="H4">文字预览</Text>
          <Text>家人聊天 · 今天一起交流</Text>
          <Text size="T200">这是一条消息预览。文字变大时，内容可以换行。</Text>
          <Button>
            <Text>按钮预览</Text>
          </Button>
        </Box>
        <Button onClick={() => setSize(100)}>
          <Text>恢复标准文字大小</Text>
        </Button>
      </Box>
    </details>
  );
}
