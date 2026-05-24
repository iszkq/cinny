import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { Box, as } from 'folds';
import * as css from './layout.css';

function BubbleLeftArrow() {
  return (
    <svg
      className={css.BubbleLeftArrow}
      width="9"
      height="8"
      viewBox="0 0 9 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.00004 8V0H4.82847C3.04666 0 2.15433 2.15428 3.41426 3.41421L8.00004 8H9.00004Z"
        fill="currentColor"
      />
    </svg>
  );
}

type BubbleLayoutProps = {
  hideBubble?: boolean;
  before?: ReactNode;
  header?: ReactNode;
  tone?: keyof typeof css.BubbleTone;
};

export const BubbleLayout = as<'div', BubbleLayoutProps>(
  ({ hideBubble, before, header, tone = 'neutral', children, ...props }, ref) => (
    <Box gap="300" {...props} ref={ref}>
      <Box className={css.BubbleBefore} shrink="No">
        {before}
      </Box>
      <Box className={css.MessageContent} grow="Yes" direction="Column">
        {header}
        {hideBubble ? (
          children
        ) : (
          <Box>
            <Box
              className={
                hideBubble
                  ? undefined
                  : classNames(
                      css.BubbleContent,
                      css.BubbleTone[tone],
                      before ? css.BubbleContentArrowLeft : undefined
                    )
              }
              direction="Column"
            >
              {before ? <BubbleLeftArrow /> : null}
              {children}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
);
