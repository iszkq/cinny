import { style } from '@vanilla-extract/css';
import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { DefaultReset, color, config, toRem } from 'folds';

const desktopCompactMediaAttachment = {
  '@media': {
    'screen and (max-width: 1124px)': {
      selectors: {
        'html[data-cinny-desktop-app="true"] &': {
          width: 'min(360px, 88%)',
        },
      },
    },
    'screen and (max-width: 750px)': {
      selectors: {
        'html[data-cinny-desktop-app="true"] &': {
          width: 'min(320px, 86%)',
        },
      },
    },
    'screen and (max-width: 520px)': {
      selectors: {
        'html[data-cinny-desktop-app="true"] &': {
          width: 'min(280px, 84%)',
        },
      },
    },
  },
};

export const Attachment = recipe({
  base: {
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    borderRadius: config.radii.R400,
    boxSizing: 'border-box',
    overflow: 'hidden',
    maxWidth: '100%',
    width: toRem(400),
  },
  variants: {
    outlined: {
      true: {
        boxShadow: `inset 0 0 0 ${config.borderWidth.B300} ${color.SurfaceVariant.ContainerLine}`,
      },
    },
    mediaContent: {
      true: desktopCompactMediaAttachment,
    },
  },
});

export type AttachmentVariants = RecipeVariants<typeof Attachment>;

export const AttachmentHeader = style({
  padding: config.space.S300,
});

export const AttachmentBox = style([
  DefaultReset,
  {
    maxWidth: '100%',
    maxHeight: toRem(600),
    width: toRem(400),
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
]);

export const AttachmentContent = style({
  padding: config.space.S300,
  paddingTop: 0,
});
