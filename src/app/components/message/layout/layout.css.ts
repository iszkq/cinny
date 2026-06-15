import { createVar, keyframes, style, styleVariants } from '@vanilla-extract/css';
import { recipe, RecipeVariants } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';
import {
  BUBBLE_OTHER_BACKDROP_VAR,
  BUBBLE_OTHER_BG_VAR,
  BUBBLE_OTHER_BORDER_VAR,
  BUBBLE_OTHER_SHADOW_VAR,
  BUBBLE_OTHER_TEXT_VAR,
  BUBBLE_SELF_BACKDROP_VAR,
  BUBBLE_SELF_BG_VAR,
  BUBBLE_SELF_BORDER_VAR,
  BUBBLE_SELF_SHADOW_VAR,
  BUBBLE_SELF_TEXT_VAR,
} from '../../../theme/appearance';

export const StickySection = style({
  position: 'sticky',
  top: config.space.S100,
});

const SpacingVar = createVar();
const SpacingVariant = styleVariants({
  '0': {
    vars: {
      [SpacingVar]: config.space.S0,
    },
  },
  '100': {
    vars: {
      [SpacingVar]: config.space.S100,
    },
  },
  '200': {
    vars: {
      [SpacingVar]: config.space.S200,
    },
  },
  '300': {
    vars: {
      [SpacingVar]: config.space.S300,
    },
  },
  '400': {
    vars: {
      [SpacingVar]: config.space.S400,
    },
  },
  '500': {
    vars: {
      [SpacingVar]: config.space.S500,
    },
  },
});

const highlightAnime = keyframes({
  '0%': {
    backgroundColor: color.Primary.Container,
  },
  '25%': {
    backgroundColor: color.Primary.ContainerActive,
  },
  '50%': {
    backgroundColor: color.Primary.Container,
  },
  '75%': {
    backgroundColor: color.Primary.ContainerActive,
  },
  '100%': {
    backgroundColor: color.Primary.Container,
  },
});
const HighlightVariant = styleVariants({
  true: {
    animation: `${highlightAnime} 2000ms ease-in-out`,
    animationIterationCount: 'infinite',
  },
});

const SelectedVariant = styleVariants({
  true: {
    backgroundColor: color.Surface.ContainerActive,
  },
});

const AutoCollapse = style({
  selectors: {
    [`&+&`]: {
      marginTop: 0,
    },
  },
});

export const MessageBase = recipe({
  base: [
    DefaultReset,
    {
      marginTop: SpacingVar,
      padding: `${config.space.S100} ${config.space.S200} ${config.space.S100} ${config.space.S400}`,
      borderRadius: `0 ${config.radii.R400} ${config.radii.R400} 0`,
      '@media': {
        'screen and (max-width: 750px)': {
          selectors: {
            'html[data-cinny-desktop-app="true"] &': {
              padding: `${config.space.S100} ${config.space.S100} ${config.space.S100} ${config.space.S200}`,
            },
          },
        },
      },
    },
  ],
  variants: {
    space: SpacingVariant,
    collapse: {
      true: {
        marginTop: 0,
      },
    },
    autoCollapse: {
      true: AutoCollapse,
    },
    highlight: HighlightVariant,
    selected: SelectedVariant,
  },
  defaultVariants: {
    space: '400',
  },
});

export type MessageBaseVariants = RecipeVariants<typeof MessageBase>;

export const CompactHeader = style([
  DefaultReset,
  StickySection,
  {
    maxWidth: toRem(170),
    width: '100%',
  },
]);

export const AvatarBase = style({
  paddingTop: toRem(4),
  transition: 'transform 200ms cubic-bezier(0, 0.8, 0.67, 0.97)',
  display: 'flex',
  alignSelf: 'start',

  selectors: {
    '&:hover': {
      transform: `translateY(${toRem(-2)})`,
    },
  },
});

export const ModernBefore = style({
  minWidth: toRem(36),
});

export const MessageContent = style({
  minWidth: 0,
  maxWidth: '100%',
});

export const BubbleBefore = style({
  minWidth: toRem(36),
});

const BubbleBackgroundVar = createVar();
const BubbleTextVar = createVar();
const BubbleBorderVar = createVar();
const BubbleShadowVar = createVar();
const BubbleBackdropVar = createVar();
const BubbleTailWidth = toRem(7);
const BubbleTailLength = toRem(6.5);

export const BubbleContent = style({
  vars: {
    [BubbleBackgroundVar]: color.SurfaceVariant.Container,
    [BubbleTextVar]: color.SurfaceVariant.OnContainer,
    [BubbleBorderVar]: 'transparent',
    [BubbleShadowVar]: 'none',
    [BubbleBackdropVar]: 'none',
  },
  boxSizing: 'border-box',
  maxWidth: `min(${toRem(600)}, 100%)`,
  padding: config.space.S200,
  background: 'transparent',
  color: BubbleTextVar,
  border: '1px solid transparent',
  borderRadius: config.radii.R500,
  position: 'relative',
  isolation: 'isolate',
  zIndex: 0,
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      background: BubbleBackgroundVar,
      border: `1px solid ${BubbleBorderVar}`,
      borderRadius: 'inherit',
      boxShadow: BubbleShadowVar,
      backdropFilter: BubbleBackdropVar,
      WebkitBackdropFilter: BubbleBackdropVar,
      pointerEvents: 'none',
      zIndex: -1,
    },
  },
});

export const BubbleStack = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: config.space.S100,
  minWidth: 0,
  maxWidth: '100%',
});

export const BubbleRow = style({
  display: 'flex',
  minWidth: 0,
  maxWidth: '100%',
});

export const BubbleMain = style({
  minWidth: 0,
  maxWidth: '100%',
});

export const BubbleAside = style({
  alignSelf: 'flex-end',
  maxWidth: '100%',
});

export const BubbleTone = styleVariants({
  neutral: {},
  self: {
    vars: {
      [BubbleBackgroundVar]: `var(${BUBBLE_SELF_BG_VAR})`,
      [BubbleTextVar]: `var(${BUBBLE_SELF_TEXT_VAR})`,
      [BubbleBorderVar]: `var(${BUBBLE_SELF_BORDER_VAR})`,
      [BubbleShadowVar]: `var(${BUBBLE_SELF_SHADOW_VAR})`,
      [BubbleBackdropVar]: `var(${BUBBLE_SELF_BACKDROP_VAR})`,
    },
  },
  other: {
    vars: {
      [BubbleBackgroundVar]: `var(${BUBBLE_OTHER_BG_VAR})`,
      [BubbleTextVar]: `var(${BUBBLE_OTHER_TEXT_VAR})`,
      [BubbleBorderVar]: `var(${BUBBLE_OTHER_BORDER_VAR})`,
      [BubbleShadowVar]: `var(${BUBBLE_OTHER_SHADOW_VAR})`,
      [BubbleBackdropVar]: `var(${BUBBLE_OTHER_BACKDROP_VAR})`,
    },
  },
});

export const BubbleContentArrowLeft = style({
  borderLeftColor: 'transparent',
  selectors: {
    '&::before': {
      left: `-${BubbleTailLength}`,
      clipPath: `polygon(${toRem(20)} 0, 100% 0, 100% 100%, ${toRem(
        18
      )} 100%, ${toRem(14)} calc(100% - ${toRem(1)}), ${toRem(11)} calc(100% - ${toRem(
        3
      )}), ${toRem(8.8)} calc(100% - ${toRem(6)}), ${toRem(7.2)} calc(100% - ${toRem(
        10
      )}), ${toRem(6.6)} calc(100% - ${toRem(14)}), ${BubbleTailLength} ${toRem(
        24
      )}, ${toRem(5.8)} ${toRem(21.7)}, ${toRem(4.4)} ${toRem(19.8)}, ${toRem(
        2.6
      )} ${toRem(18.2)}, ${toRem(1.1)} ${toRem(16.7)}, 0 ${toRem(15.2)}, ${toRem(
        0.5
      )} ${toRem(13.8)}, ${toRem(1.9)} ${toRem(12.5)}, ${toRem(3.7)} ${toRem(
        11
      )}, ${toRem(5.1)} ${toRem(9.1)}, ${toRem(6.1)} ${toRem(7)}, ${toRem(6.6)} ${toRem(
        4.8
      )}, ${toRem(7.8)} ${toRem(2.8)}, ${toRem(9.8)} ${toRem(1.3)}, ${toRem(
        12.3
      )} ${toRem(0.4)}, ${toRem(15.2)} ${toRem(0.08)})`,
    },
  },
});

export const Username = style({
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  selectors: {
    'button&': {
      cursor: 'pointer',
    },
    'button&:hover, button&:focus-visible': {
      textDecoration: 'underline',
    },
  },
});

export const UsernameBold = style({
  fontWeight: 550,
});

export const MessageTextBody = recipe({
  base: {
    wordBreak: 'break-word',
    userSelect: 'text',
    WebkitUserSelect: 'text',
  },
  variants: {
    preWrap: {
      true: {
        whiteSpace: 'pre-wrap',
      },
    },
    jumboEmoji: {
      true: {
        fontSize: '1.504em',
        lineHeight: '1.4962em',
      },
    },
    emote: {
      true: {
        color: color.Success.Main,
        fontStyle: 'italic',
      },
    },
  },
});

export type MessageTextBodyVariants = RecipeVariants<typeof MessageTextBody>;
