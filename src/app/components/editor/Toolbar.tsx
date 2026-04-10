import FocusTrap from 'focus-trap-react';
import {
  Badge,
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  IconSrc,
  Input,
  Line,
  Menu,
  PopOut,
  RectCords,
  Scroll,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
} from 'folds';
import React, { MouseEventHandler, ReactNode, useState } from 'react';
import { ReactEditor, useSlate } from 'slate-react';
import {
  headingLevel,
  getTextColor,
  isAnyMarkActive,
  isBlockActive,
  isMarkActive,
  removeAllMark,
  setTextColor,
  toggleBlock,
  toggleMark,
} from './utils';
import * as css from './Editor.css';
import { BlockType, MarkType } from './types';
import { HeadingLevel } from './slate';
import { isMacOS } from '../../utils/user-agent';
import { KeySymbol } from '../../utils/key-symbol';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { stopPropagation } from '../../utils/keyboard';

function BtnTooltip({ text, shortCode }: { text: string; shortCode?: string }) {
  return (
    <Tooltip style={{ padding: config.space.S300 }}>
      <Box gap="200" direction="Column" alignItems="Center">
        <Text align="Center">{text}</Text>
        {shortCode && (
          <Badge as="kbd" radii="300" size="500">
            <Text size="T200" align="Center">
              {shortCode}
            </Text>
          </Badge>
        )}
      </Box>
    </Tooltip>
  );
}

type MarkButtonProps = { format: MarkType; icon: IconSrc; tooltip: ReactNode };
export function MarkButton({ format, icon, tooltip }: MarkButtonProps) {
  const editor = useSlate();
  const disableInline = isBlockActive(editor, BlockType.CodeBlock);

  if (disableInline) {
    removeAllMark(editor);
  }

  const handleClick = () => {
    toggleMark(editor, format);
    ReactEditor.focus(editor);
  };

  return (
    <TooltipProvider tooltip={tooltip} delay={500}>
      {(triggerRef) => (
        <IconButton
          ref={triggerRef}
          variant="SurfaceVariant"
          onClick={handleClick}
          aria-pressed={isMarkActive(editor, format)}
          size="400"
          radii="300"
          disabled={disableInline}
        >
          <Icon size="200" src={icon} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type BlockButtonProps = {
  format: BlockType;
  icon: IconSrc;
  tooltip: ReactNode;
};
export function BlockButton({ format, icon, tooltip }: BlockButtonProps) {
  const editor = useSlate();

  const handleClick = () => {
    toggleBlock(editor, format, { level: 1 });
    ReactEditor.focus(editor);
  };

  return (
    <TooltipProvider tooltip={tooltip} delay={500}>
      {(triggerRef) => (
        <IconButton
          ref={triggerRef}
          variant="SurfaceVariant"
          onClick={handleClick}
          aria-pressed={isBlockActive(editor, format)}
          size="400"
          radii="300"
        >
          <Icon size="200" src={icon} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

export function HeadingBlockButton() {
  const editor = useSlate();
  const level = headingLevel(editor);
  const [anchor, setAnchor] = useState<RectCords>();
  const isActive = isBlockActive(editor, BlockType.Heading);
  const modKey = isMacOS() ? KeySymbol.Command : 'Ctrl';

  const handleMenuSelect = (selectedLevel: HeadingLevel) => {
    setAnchor(undefined);
    toggleBlock(editor, BlockType.Heading, { level: selectedLevel });
    ReactEditor.focus(editor);
  };

  const handleMenuOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    if (isActive) {
      toggleBlock(editor, BlockType.Heading);
      return;
    }
    setAnchor(evt.currentTarget.getBoundingClientRect());
  };
  return (
    <PopOut
      anchor={anchor}
      offset={5}
      position="Top"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setAnchor(undefined),
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) =>
              evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu style={{ padding: config.space.S100 }}>
            <Box gap="100">
              <TooltipProvider
                tooltip={<BtnTooltip text={'\u4e00\u7ea7\u6807\u9898'} shortCode={`${modKey} + 1`} />}
                delay={500}
              >
                {(triggerRef) => (
                  <IconButton
                    ref={triggerRef}
                    onClick={() => handleMenuSelect(1)}
                    size="400"
                    radii="300"
                  >
                    <Icon size="200" src={Icons.Heading1} />
                  </IconButton>
                )}
              </TooltipProvider>
              <TooltipProvider
                tooltip={<BtnTooltip text={'\u4e8c\u7ea7\u6807\u9898'} shortCode={`${modKey} + 2`} />}
                delay={500}
              >
                {(triggerRef) => (
                  <IconButton
                    ref={triggerRef}
                    onClick={() => handleMenuSelect(2)}
                    size="400"
                    radii="300"
                  >
                    <Icon size="200" src={Icons.Heading2} />
                  </IconButton>
                )}
              </TooltipProvider>
              <TooltipProvider
                tooltip={<BtnTooltip text={'\u4e09\u7ea7\u6807\u9898'} shortCode={`${modKey} + 3`} />}
                delay={500}
              >
                {(triggerRef) => (
                  <IconButton
                    ref={triggerRef}
                    onClick={() => handleMenuSelect(3)}
                    size="400"
                    radii="300"
                  >
                    <Icon size="200" src={Icons.Heading3} />
                  </IconButton>
                )}
              </TooltipProvider>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <IconButton
        style={{ width: 'unset' }}
        variant="SurfaceVariant"
        onClick={handleMenuOpen}
        aria-pressed={isActive}
        size="400"
        radii="300"
      >
        <Icon size="200" src={level ? Icons[`Heading${level}`] : Icons.Heading1} />
        <Icon size="200" src={isActive ? Icons.Cross : Icons.ChevronBottom} />
      </IconButton>
    </PopOut>
  );
}

type ExitFormattingProps = { tooltip: ReactNode };
export function ExitFormatting({ tooltip }: ExitFormattingProps) {
  const editor = useSlate();

  const handleClick = () => {
    if (isAnyMarkActive(editor)) {
      removeAllMark(editor);
    } else if (!isBlockActive(editor, BlockType.Paragraph)) {
      toggleBlock(editor, BlockType.Paragraph);
    }
    ReactEditor.focus(editor);
  };

  return (
    <TooltipProvider tooltip={tooltip} delay={500}>
      {(triggerRef) => (
        <IconButton
          ref={triggerRef}
          variant="SurfaceVariant"
          onClick={handleClick}
          size="400"
          radii="300"
        >
          <Text size="B400">{'\u6e05\u9664\u683c\u5f0f'}</Text>
        </IconButton>
      )}
    </TooltipProvider>
  );
}

export function TextColorButton() {
  const editor = useSlate();
  const disableInline = isBlockActive(editor, BlockType.CodeBlock);
  const [anchor, setAnchor] = useState<RectCords>();
  const currentColor = getTextColor(editor) ?? '#2563eb';

  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <PopOut
      anchor={anchor}
      offset={5}
      position="Top"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu style={{ padding: config.space.S200 }}>
            <Box direction="Column" gap="200">
              <input
                type="color"
                value={currentColor}
                aria-label={'\u6587\u5b57\u989c\u8272'}
                onChange={(evt) => {
                  setTextColor(editor, evt.currentTarget.value);
                  ReactEditor.focus(editor);
                }}
                style={{
                  width: '100%',
                  minHeight: toRem(36),
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <Input
                value={currentColor}
                readOnly
                variant="Background"
                size="300"
                outlined
              />
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                onClick={() => {
                  setTextColor(editor, undefined);
                  ReactEditor.focus(editor);
                  setAnchor(undefined);
                }}
              >
                <Text size="B300">{'\u6e05\u9664\u989c\u8272'}</Text>
              </Button>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <TooltipProvider tooltip={<BtnTooltip text={'\u6587\u5b57\u989c\u8272'} />} delay={500}>
        {(triggerRef) => (
          <IconButton
            ref={triggerRef}
            variant="SurfaceVariant"
            onClick={handleOpen}
            aria-pressed={!!getTextColor(editor)}
            size="400"
            radii="300"
            disabled={disableInline}
          >
            <Text size="B400" style={{ color: currentColor }}>
              A
            </Text>
          </IconButton>
        )}
      </TooltipProvider>
    </PopOut>
  );
}

export function Toolbar() {
  const editor = useSlate();
  const modKey = isMacOS() ? KeySymbol.Command : 'Ctrl';
  const disableInline = isBlockActive(editor, BlockType.CodeBlock);

  const canEscape = isBlockActive(editor, BlockType.Paragraph)
    ? isAnyMarkActive(editor)
    : ReactEditor.isFocused(editor);
  const [isMarkdown, setIsMarkdown] = useSetting(settingsAtom, 'isMarkdown');

  return (
    <Box className={css.EditorToolbarBase}>
      <Scroll direction="Horizontal" size="0">
        <Box className={css.EditorToolbar} alignItems="Center" gap="300">
          <>
            <Box shrink="No" gap="100">
              <MarkButton
                format={MarkType.Bold}
                icon={Icons.Bold}
                tooltip={<BtnTooltip text={'\u52a0\u7c97'} shortCode={`${modKey} + B`} />}
              />
              <MarkButton
                format={MarkType.Italic}
                icon={Icons.Italic}
                tooltip={<BtnTooltip text={'\u659c\u4f53'} shortCode={`${modKey} + I`} />}
              />
              <MarkButton
                format={MarkType.Underline}
                icon={Icons.Underline}
                tooltip={<BtnTooltip text={'\u4e0b\u5212\u7ebf'} shortCode={`${modKey} + U`} />}
              />
              <MarkButton
                format={MarkType.StrikeThrough}
                icon={Icons.Strike}
                tooltip={<BtnTooltip text={'\u5220\u9664\u7ebf'} shortCode={`${modKey} + S`} />}
              />
              <MarkButton
                format={MarkType.Code}
                icon={Icons.Code}
                tooltip={<BtnTooltip text={'\u884c\u5185\u4ee3\u7801'} shortCode={`${modKey} + [`} />}
              />
              <MarkButton
                format={MarkType.Spoiler}
                icon={Icons.EyeBlind}
                tooltip={<BtnTooltip text={'\u5267\u900f'} shortCode={`${modKey} + H`} />}
              />
              <TextColorButton />
            </Box>
            <Line variant="SurfaceVariant" direction="Vertical" style={{ height: toRem(12) }} />
          </>
          <Box shrink="No" gap="100">
            <BlockButton
              format={BlockType.BlockQuote}
              icon={Icons.BlockQuote}
              tooltip={<BtnTooltip text={'\u5f15\u7528'} shortCode={`${modKey} + '`} />}
            />
            <BlockButton
              format={BlockType.CodeBlock}
              icon={Icons.BlockCode}
              tooltip={<BtnTooltip text={'\u4ee3\u7801\u5757'} shortCode={`${modKey} + ;`} />}
            />
            <BlockButton
              format={BlockType.OrderedList}
              icon={Icons.OrderList}
              tooltip={<BtnTooltip text={'\u6709\u5e8f\u5217\u8868'} shortCode={`${modKey} + 7`} />}
            />
            <BlockButton
              format={BlockType.UnorderedList}
              icon={Icons.UnorderList}
              tooltip={<BtnTooltip text={'\u65e0\u5e8f\u5217\u8868'} shortCode={`${modKey} + 8`} />}
            />
            <HeadingBlockButton />
          </Box>
          {canEscape && (
            <>
              <Line variant="SurfaceVariant" direction="Vertical" style={{ height: toRem(12) }} />
              <Box shrink="No" gap="100">
                <ExitFormatting
                  tooltip={
                    <BtnTooltip
                      text={'\u6e05\u9664\u683c\u5f0f'}
                      shortCode={`Escape, ${modKey} + E`}
                    />
                  }
                />
              </Box>
            </>
          )}
          <Box className={css.MarkdownBtnBox} shrink="No" grow="Yes" justifyContent="End">
            <TooltipProvider
              align="End"
              tooltip={
                <BtnTooltip
                  text={
                    isMarkdown
                      ? '\u5173\u95ed Markdown'
                      : '\u5f00\u542f Markdown'
                  }
                />
              }
              delay={500}
            >
              {(triggerRef) => (
                <IconButton
                  ref={triggerRef}
                  variant="SurfaceVariant"
                  onClick={() => setIsMarkdown(!isMarkdown)}
                  aria-pressed={isMarkdown}
                  size="300"
                  radii="300"
                  disabled={disableInline || !!isAnyMarkActive(editor)}
                >
                  <Icon size="200" src={Icons.Markdown} filled={isMarkdown} />
                </IconButton>
              )}
            </TooltipProvider>
            <span />
          </Box>
        </Box>
      </Scroll>
    </Box>
  );
}
