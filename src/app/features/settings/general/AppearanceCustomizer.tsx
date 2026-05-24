import React, { CSSProperties, useCallback, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Box, Button, Icon, Icons, Spinner, Text, color } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { useTheme } from '../../../hooks/useTheme';
import { useSetting } from '../../../state/hooks/settings';
import {
  InterfaceStyle,
  defaultAppearanceSettings,
  settingsAtom,
} from '../../../state/settings';
import {
  getImageFileUrl,
  loadImageElement,
  selectFile,
} from '../../../utils/dom';
import {
  CARD_BACKDROP_VAR,
  CARD_BG_VAR,
  CARD_BORDER_VAR,
  CARD_SHADOW_VAR,
  CLIENT_ROOT_BG_VAR,
  CLIENT_SHELL_BACKDROP_VAR,
  CLIENT_SHELL_BG_VAR,
  CLIENT_SHELL_BORDER_VAR,
  CLIENT_SHELL_SHADOW_VAR,
  CONTENT_BG_VAR,
  NAV_RAIL_BG_VAR,
  NAV_RAIL_BORDER_VAR,
  PAGE_HEADER_BG_VAR,
  PAGE_NAV_BORDER_VAR,
  appearanceColorPresets,
  getAccentColorHex,
  getIncomingBubbleColorHex,
  getOutgoingBubbleColorHex,
  getPreviewBubbleStyle,
  getPreviewChromeStyle,
} from '../../../theme/appearance';
import { THEME_DEFAULT_ACCENT_ID } from '../../../theme/appearanceShared';
import { SequenceCardStyle } from '../styles.css';
import * as css from './AppearanceCustomizer.css';

const interfaceOptions: Array<{
  id: InterfaceStyle;
  label: string;
  description: string;
}> = [
  {
    id: 'default',
    label: '\u7ECF\u5178',
    description: '\u66F4\u7A33\u91CD\uFF0C\u8FB9\u754C\u66F4\u6E05\u6670\uFF0C\u9002\u5408\u957F\u65F6\u95F4\u4F7F\u7528\u3002',
  },
  {
    id: 'frosted',
    label: '\u73BB\u7483\u78E8\u7802',
    description:
      '\u66F4\u901A\u900F\uFF0C\u5E26\u6709\u6A21\u7CCA\u548C\u5C42\u6B21\u611F\uFF0C\u63A5\u8FD1\u73BB\u7483\u98CE\u683C\u3002',
  },
];

const MAX_BACKGROUND_BYTES = 1_600_000;
const BACKGROUND_EDGE_CANDIDATES = [1600, 1280, 960] as const;
const BACKGROUND_QUALITY_CANDIDATES = [0.82, 0.74, 0.66] as const;
const MIN_OPACITY = 20;
const MAX_OPACITY = 100;

const getSelectedColorMeta = (
  value: string,
  resolver: (value?: string) => string,
  themeDefaultLabel?: string
): { label: string; hex: string } => {
  const preset = appearanceColorPresets.find((item) => item.id === value);
  const hex = resolver(value).toUpperCase();

  return {
    label:
      (themeDefaultLabel && value === THEME_DEFAULT_ACCENT_ID ? themeDefaultLabel : preset?.label) ??
      '\u81EA\u5B9A\u4E49',
    hex,
  };
};

const getScaledDimensions = (
  width: number,
  height: number,
  maxEdge: number
): [number, number] => {
  const largestEdge = Math.max(width, height);
  if (largestEdge <= maxEdge) {
    return [width, height];
  }

  const scale = maxEdge / largestEdge;
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
};

const encodeCanvas = (canvas: HTMLCanvasElement, quality: number): string => {
  const webpDataUrl = canvas.toDataURL('image/webp', quality);
  if (webpDataUrl.startsWith('data:image/webp')) {
    return webpDataUrl;
  }

  return canvas.toDataURL('image/jpeg', quality);
};

const createCompressedBackgroundDataUrl = async (file: File): Promise<string> => {
  const fileUrl = getImageFileUrl(file);

  try {
    const image = await loadImageElement(fileUrl);
    let fallbackDataUrl: string | undefined;

    for (const maxEdge of BACKGROUND_EDGE_CANDIDATES) {
      const [targetWidth, targetHeight] = getScaledDimensions(
        image.naturalWidth || image.width,
        image.naturalHeight || image.height,
        maxEdge
      );

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('\u65E0\u6CD5\u5904\u7406\u8FD9\u5F20\u56FE\u7247\u3002');
      }

      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      for (const quality of BACKGROUND_QUALITY_CANDIDATES) {
        const dataUrl = encodeCanvas(canvas, quality);
        fallbackDataUrl = dataUrl;

        if (dataUrl.length <= MAX_BACKGROUND_BYTES) {
          return dataUrl;
        }
      }
    }

    if (fallbackDataUrl) {
      return fallbackDataUrl;
    }

    throw new Error('\u56FE\u7247\u5904\u7406\u5931\u8D25\uFF0C\u8BF7\u6362\u4E00\u5F20\u518D\u8BD5\u3002');
  } finally {
    URL.revokeObjectURL(fileUrl);
  }
};

const getPreviewBackgroundStyle = (backgroundDataUrl?: string): CSSProperties | undefined => {
  if (!backgroundDataUrl) return undefined;

  return {
    backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.18) 0%, rgba(15, 23, 42, 0.34) 100%), url(${backgroundDataUrl})`,
    backgroundPosition: 'center, center',
    backgroundRepeat: 'no-repeat, no-repeat',
    backgroundSize: 'cover, cover',
  };
};

type ColorFieldProps = {
  title: string;
  value: string;
  onChange: (value: string) => void;
  resolver: (value?: string) => string;
  themeDefaultLabel?: string;
};

function ColorField({ title, value, onChange, resolver, themeDefaultLabel }: ColorFieldProps) {
  const selected = getSelectedColorMeta(value, resolver, themeDefaultLabel);

  return (
    <div className={css.SwatchSection}>
      <div className={css.SwatchHeader}>
        <Text size="T300">{title}</Text>
        <span className={css.SwatchMeta}>
          {selected.label} {'\u00B7'} {selected.hex}
        </span>
      </div>
      <div className={css.SwatchGrid}>
        {themeDefaultLabel && (
          <button
            type="button"
            className={css.ThemeDefaultSwatchButton}
            aria-pressed={value === THEME_DEFAULT_ACCENT_ID}
            onClick={() => onChange(THEME_DEFAULT_ACCENT_ID)}
          >
            <span
              className={css.ThemeDefaultSwatchFill}
              style={{ background: resolver(THEME_DEFAULT_ACCENT_ID) }}
            />
            <span className={css.ThemeDefaultSwatchLabel}>{themeDefaultLabel}</span>
          </button>
        )}
        {appearanceColorPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={css.SwatchButton}
            aria-pressed={value === preset.id}
            title={preset.label}
            onClick={() => onChange(preset.id)}
          >
            <span className={css.SwatchFill} style={{ background: preset.value }} />
          </button>
        ))}
        <label className={css.CustomColorField}>
          <input
            className={css.CustomColorInput}
            type="color"
            aria-label={`${title} \u81EA\u5B9A\u4E49\u989C\u8272`}
            value={resolver(value).toLowerCase()}
            onChange={(evt) => onChange(evt.currentTarget.value.toUpperCase())}
          />
          <span className={css.CustomColorLabel}>{'\u81EA\u5B9A\u4E49'}</span>
        </label>
      </div>
    </div>
  );
}

type OpacityFieldProps = {
  title: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
};

function OpacityField({ title, description, value, onChange }: OpacityFieldProps) {
  return (
    <div className={css.OpacitySection}>
      <div className={css.SwatchHeader}>
        <div className={css.OpacityTitleBlock}>
          <Text size="T300">{title}</Text>
          {description && (
            <Text size="T200" priority="300">
              {description}
            </Text>
          )}
        </div>
        <span className={css.SwatchMeta}>{`${value}%`}</span>
      </div>
      <div className={css.OpacityControlRow}>
        <span className={css.OpacityHint}>{`${MIN_OPACITY}%`}</span>
        <input
          className={css.OpacitySlider}
          type="range"
          min={MIN_OPACITY}
          max={MAX_OPACITY}
          step={1}
          value={value}
          onChange={(evt) => onChange(parseInt(evt.currentTarget.value, 10))}
        />
        <span className={css.OpacityHint}>{`${MAX_OPACITY}%`}</span>
      </div>
    </div>
  );
}

const toBubbleStyle = (bubble: {
  background: string;
  text: string;
  border: string;
  shadow: string;
  backdrop: string;
}): CSSProperties => ({
  background: bubble.background,
  color: bubble.text,
  borderColor: bubble.border,
  boxShadow: bubble.shadow,
  backdropFilter: bubble.backdrop,
  WebkitBackdropFilter: bubble.backdrop,
});

export function AppearanceCustomizer() {
  const theme = useTheme();
  const settings = useAtomValue(settingsAtom);
  const setSettings = useSetAtom(settingsAtom);
  const [interfaceStyle, setInterfaceStyle] = useSetting(settingsAtom, 'interfaceStyle');
  const [accentColorId, setAccentColorId] = useSetting(settingsAtom, 'accentColorId');
  const [accentOpacity, setAccentOpacity] = useSetting(settingsAtom, 'accentOpacity');
  const [outgoingBubbleColorId, setOutgoingBubbleColorId] = useSetting(
    settingsAtom,
    'outgoingBubbleColorId'
  );
  const [outgoingBubbleOpacity, setOutgoingBubbleOpacity] = useSetting(
    settingsAtom,
    'outgoingBubbleOpacity'
  );
  const [incomingBubbleColorId, setIncomingBubbleColorId] = useSetting(
    settingsAtom,
    'incomingBubbleColorId'
  );
  const [incomingBubbleOpacity, setIncomingBubbleOpacity] = useSetting(
    settingsAtom,
    'incomingBubbleOpacity'
  );
  const [chatBackgroundDataUrl, setChatBackgroundDataUrl] = useSetting(
    settingsAtom,
    'chatBackgroundDataUrl'
  );
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [backgroundError, setBackgroundError] = useState<string>();

  const accentColor = getAccentColorHex(accentColorId, theme.classNames);
  const previewChrome = getPreviewChromeStyle(
    interfaceStyle,
    theme.kind,
    accentColorId,
    accentOpacity,
    theme.classNames
  );
  const incomingBubble = getPreviewBubbleStyle({
    interfaceStyle,
    themeKind: theme.kind,
    tone: 'other',
    colorId: incomingBubbleColorId,
    opacity: incomingBubbleOpacity,
  });
  const outgoingBubble = getPreviewBubbleStyle({
    interfaceStyle,
    themeKind: theme.kind,
    tone: 'self',
    colorId: outgoingBubbleColorId,
    opacity: outgoingBubbleOpacity,
  });
  const previewBackgroundStyle = getPreviewBackgroundStyle(chatBackgroundDataUrl);

  const handlePickBackground = useCallback(async () => {
    const file = await selectFile({ accept: 'image/*' });
    if (!(file instanceof File)) return;

    setBackgroundLoading(true);
    setBackgroundError(undefined);

    try {
      const dataUrl = await createCompressedBackgroundDataUrl(file);
      setChatBackgroundDataUrl(dataUrl);
    } catch (error) {
      setBackgroundError(
        error instanceof Error
          ? error.message
          : '\u56FE\u7247\u5904\u7406\u5931\u8D25\uFF0C\u8BF7\u6362\u4E00\u5F20\u518D\u8BD5\u3002'
      );
    } finally {
      setBackgroundLoading(false);
    }
  }, [setChatBackgroundDataUrl]);

  const handleRemoveBackground = useCallback(() => {
    setBackgroundError(undefined);
    setChatBackgroundDataUrl(undefined);
  }, [setChatBackgroundDataUrl]);

  const handleResetAppearance = useCallback(() => {
    setBackgroundError(undefined);
    setSettings({
      ...settings,
      ...defaultAppearanceSettings,
    });
  }, [setSettings, settings]);

  const previewShellStyle: CSSProperties = {
    background: previewChrome[CLIENT_SHELL_BG_VAR],
    borderColor: previewChrome[CLIENT_SHELL_BORDER_VAR],
    boxShadow: previewChrome[CLIENT_SHELL_SHADOW_VAR],
    backdropFilter: previewChrome[CLIENT_SHELL_BACKDROP_VAR],
    WebkitBackdropFilter: previewChrome[CLIENT_SHELL_BACKDROP_VAR],
  };

  const previewRailStyle: CSSProperties = {
    background: previewChrome[NAV_RAIL_BG_VAR],
    borderColor: previewChrome[NAV_RAIL_BORDER_VAR],
  };

  const previewContentStyle: CSSProperties = {
    background: previewChrome[CONTENT_BG_VAR],
    ...previewBackgroundStyle,
  };

  const previewHeaderStyle: CSSProperties = {
    background: previewChrome[PAGE_HEADER_BG_VAR],
    borderColor: previewChrome[PAGE_NAV_BORDER_VAR],
  };

  const previewCardStyle: CSSProperties = {
    background: previewChrome[CARD_BG_VAR],
    borderColor: previewChrome[CARD_BORDER_VAR],
    boxShadow: previewChrome[CARD_SHADOW_VAR],
    backdropFilter: previewChrome[CARD_BACKDROP_VAR],
    WebkitBackdropFilter: previewChrome[CARD_BACKDROP_VAR],
  };

  const appearancePreview = (
    <div
      className={css.PreviewRoot}
      style={{
        background: previewChrome[CLIENT_ROOT_BG_VAR],
      }}
    >
      <div className={css.PreviewShell} style={previewShellStyle}>
        <div className={css.PreviewRail} style={previewRailStyle}>
          <div
            className={css.PreviewRailItem}
            style={{ background: accentColor, opacity: accentOpacity / 100 }}
          />
          <div className={css.PreviewRailItem} />
          <div className={css.PreviewRailItem} />
        </div>

        <div className={css.PreviewContent} style={previewContentStyle}>
          <div className={css.PreviewHeader} style={previewHeaderStyle}>
            <span className={css.PreviewHeaderTitle}>{'\u5B9E\u65F6\u9884\u89C8'}</span>
            <span
              className={css.PreviewHeaderAccent}
              style={{ background: accentColor, opacity: accentOpacity / 100 }}
            />
          </div>

          <div className={css.PreviewBody}>
            <div className={css.PreviewCard} style={previewCardStyle}>
              <span className={css.PreviewCardTitle}>{'\u5F53\u524D\u754C\u9762\u98CE\u683C'}</span>
              <span className={css.PreviewCardText}>
                {chatBackgroundDataUrl
                  ? '\u80CC\u666F\u56FE\u5DF2\u542F\u7528\uFF0C\u53EF\u4EE5\u76F4\u63A5\u89C2\u5BDF\u6C14\u6CE1\u3001\u5BB9\u5668\u548C\u80CC\u666F\u7684\u53E0\u52A0\u6548\u679C\u3002'
                  : interfaceStyle === 'frosted'
                    ? '\u73BB\u7483\u78E8\u7802\u4F1A\u8BA9\u5BB9\u5668\u66F4\u901A\u900F\uFF0C\u9002\u5408\u66F4\u8F7B\u76C8\u7684\u89C6\u89C9\u611F\u53D7\u3002'
                    : '\u7ECF\u5178\u98CE\u683C\u66F4\u7A33\uFF0C\u8FB9\u754C\u66F4\u6E05\u6670\uFF0C\u9002\u5408\u957F\u65F6\u95F4\u804A\u5929\u548C\u6D4F\u89C8\u3002'}
              </span>
            </div>

            <div className={css.PreviewMessages}>
              <div className={css.PreviewRow}>
                <div className={css.PreviewAvatar} />
                <div className={css.PreviewBubble} style={toBubbleStyle(incomingBubble)}>
                  <span className={css.PreviewBubbleMeta}>Alice</span>
                  <span className={css.PreviewBubbleText}>
                    {
                      '\u5207\u6362\u989C\u8272\u3001\u98CE\u683C\u548C\u80CC\u666F\u65F6\uFF0C\u8FD9\u91CC\u4F1A\u9A6C\u4E0A\u770B\u5230\u804A\u5929\u754C\u9762\u7684\u5B9E\u9645\u6548\u679C\u3002'
                    }
                  </span>
                </div>
              </div>

              <div className={css.PreviewRowSelf}>
                <div className={css.PreviewBubble} style={toBubbleStyle(outgoingBubble)}>
                  <span className={css.PreviewBubbleMeta}>You</span>
                  <span className={css.PreviewBubbleText}>
                    {
                      '\u70B9\u4E00\u4E0B\u6062\u590D\u9ED8\u8BA4\u5C31\u53EF\u4EE5\u56DE\u5230\u521D\u59CB\u5916\u89C2\uFF0C\u4E0D\u4F1A\u5F71\u54CD\u4F60\u7684\u804A\u5929\u6570\u636E\u3002'
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <div className={css.ControlSection}>
        <div className={css.SectionHeader}>
          <Text size="L400">{'\u98CE\u683C\u81EA\u5B9A\u4E49'}</Text>
          <Text size="T200" priority="300">
            {
              '\u4E3B\u9898\u8272\u3001\u804A\u5929\u6C14\u6CE1\u548C\u804A\u5929\u80CC\u666F\u4F1A\u7ACB\u5373\u5E94\u7528\uFF0C\u81EA\u5DF1\u7684\u6C14\u6CE1\u9ED8\u8BA4\u4F1A\u6BD4\u4ED6\u4EBA\u66F4\u5F3A\u8C03\u4E00\u70B9\uFF0C\u4E0B\u9762\u7684\u9884\u89C8\u4E5F\u4F1A\u5B9E\u65F6\u53D8\u5316\u3002'
            }
          </Text>
        </div>

        <Box wrap="Wrap" gap="200">
          <Button
            size="300"
            variant="Secondary"
            fill="Soft"
            radii="300"
            before={<Icon size="50" src={Icons.ArrowGoLeft} />}
            onClick={handleResetAppearance}
            disabled={backgroundLoading}
          >
            <Text size="B300">{'\u4E00\u952E\u6062\u590D\u9ED8\u8BA4'}</Text>
          </Button>
        </Box>

        <div className={css.StyleOptions}>
          {interfaceOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={css.StyleOptionButton}
              aria-pressed={interfaceStyle === option.id}
              onClick={() => setInterfaceStyle(option.id)}
            >
              <span className={css.StyleOptionTitle}>{option.label}</span>
              <span className={css.StyleOptionDescription}>{option.description}</span>
            </button>
          ))}
        </div>

        {appearancePreview}

        <ColorField
          title={'\u4E3B\u9898\u8272'}
          value={accentColorId}
          onChange={setAccentColorId}
          resolver={(value) => getAccentColorHex(value, theme.classNames)}
          themeDefaultLabel={'\u8DDF\u968F\u4E3B\u9898'}
        />
        <OpacityField
          title={'\u4E3B\u9898\u8272\u900F\u660E\u5EA6'}
          description={'\u5F71\u54CD\u754C\u9762\u4E2D\u7684\u4E3B\u9898\u8272\u5F3A\u5EA6\u548C\u67D0\u4E9B\u6309\u94AE\u7684\u663E\u793A\u611F\u3002'}
          value={accentOpacity}
          onChange={setAccentOpacity}
        />
        <ColorField
          title={'\u81EA\u5DF1\u7684\u6C14\u6CE1\u989C\u8272'}
          value={outgoingBubbleColorId}
          onChange={setOutgoingBubbleColorId}
          resolver={getOutgoingBubbleColorHex}
        />
        <OpacityField
          title={'\u81EA\u5DF1\u6C14\u6CE1\u900F\u660E\u5EA6'}
          description={'\u540C\u8272\u60C5\u51B5\u4E0B\uFF0C\u81EA\u5DF1\u7684\u6C14\u6CE1\u9ED8\u8BA4\u4F1A\u6BD4\u4ED6\u4EBA\u66F4\u6DF1\u4E00\u4E9B\u3002'}
          value={outgoingBubbleOpacity}
          onChange={setOutgoingBubbleOpacity}
        />
        <ColorField
          title={'\u4ED6\u4EBA\u7684\u6C14\u6CE1\u989C\u8272'}
          value={incomingBubbleColorId}
          onChange={setIncomingBubbleColorId}
          resolver={getIncomingBubbleColorHex}
        />
        <OpacityField
          title={'\u4ED6\u4EBA\u6C14\u6CE1\u900F\u660E\u5EA6'}
          value={incomingBubbleOpacity}
          onChange={setIncomingBubbleOpacity}
        />

        <div className={css.SwatchSection}>
          <div className={css.SwatchHeader}>
            <Text size="T300">{'\u804A\u5929\u80CC\u666F'}</Text>
            <span className={css.SwatchMeta}>
              {chatBackgroundDataUrl ? '\u5DF2\u542F\u7528' : '\u672A\u8BBE\u7F6E'}
            </span>
          </div>

          <Box wrap="Wrap" gap="200">
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              before={
                backgroundLoading ? (
                  <Spinner size="50" />
                ) : (
                  <Icon size="50" src={Icons.Photo} />
                )
              }
              onClick={() => {
                handlePickBackground().catch(() => undefined);
              }}
              disabled={backgroundLoading}
            >
              <Text size="B300">{'\u4E0A\u4F20\u80CC\u666F\u56FE'}</Text>
            </Button>
            <Button
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              before={<Icon size="50" src={Icons.Cross} />}
              onClick={handleRemoveBackground}
              disabled={!chatBackgroundDataUrl || backgroundLoading}
            >
              <Text size="B300">{'\u79FB\u9664\u80CC\u666F'}</Text>
            </Button>
          </Box>

          <div
            className={css.BackgroundPreview}
            style={{
              background: previewChrome[CONTENT_BG_VAR],
              ...previewBackgroundStyle,
            }}
          >
            <span className={css.BackgroundPreviewBadge}>
              {chatBackgroundDataUrl
                ? '\u804A\u5929\u80CC\u666F\u9884\u89C8'
                : '\u672A\u8BBE\u7F6E\u804A\u5929\u80CC\u666F'}
            </span>
          </div>

          <Text size="T200" priority="300">
            {
              '\u80CC\u666F\u56FE\u53EA\u4FDD\u5B58\u5728\u5F53\u524D\u8BBE\u5907\u672C\u5730\uFF0C\u4E0D\u4F1A\u6539\u53D8\u6D88\u606F\u5185\u5BB9\u6216\u5176\u4ED6\u4EBA\u770B\u5230\u7684\u754C\u9762\u3002'
            }
          </Text>
          {backgroundError && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              {backgroundError}
            </Text>
          )}
        </div>
      </div>
    </SequenceCard>
  );
}
