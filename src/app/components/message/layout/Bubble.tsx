import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { Box, as } from 'folds';
import * as css from './layout.css';

type BubbleLayoutProps = {
  hideBubble?: boolean;
  before?: ReactNode;
  header?: ReactNode;
  after?: ReactNode;
  footer?: ReactNode;
  tone?: keyof typeof css.BubbleTone;
};

export const BubbleLayout = as<'div', BubbleLayoutProps>(
  ({ hideBubble, before, header, after, footer, tone = 'neutral', children, ...props }, ref) => (
    <Box gap="300" {...props} ref={ref}>
      <Box className={css.BubbleBefore} shrink="No">
        {before}
      </Box>
      <Box className={css.MessageContent} grow="Yes" direction="Column">
        {header}
        {hideBubble ? (
          <>
            {children}
            {footer}
          </>
        ) : (
          <>
            <Box className={css.BubbleStack}>
              <Box className={css.BubbleRow}>
                <Box className={css.BubbleMain}>
                  <Box>
                    <Box
                      className={classNames(
                        css.BubbleContent,
                        css.BubbleTone[tone],
                        before ? css.BubbleContentArrowLeft : undefined
                      )}
                      direction="Column"
                    >
                      {children}
                    </Box>
                  </Box>
                </Box>
              </Box>
              {after ? <Box className={css.BubbleAside}>{after}</Box> : null}
            </Box>
            {footer}
          </>
        )}
      </Box>
    </Box>
  )
);
