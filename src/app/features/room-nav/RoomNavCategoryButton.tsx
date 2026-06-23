import React, { forwardRef } from 'react';
import { Icon, Icons, Text } from 'folds';
import classNames from 'classnames';
import * as css from './styles.css';

type RoomNavCategoryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  closed?: boolean;
};

export const RoomNavCategoryButton = forwardRef<HTMLButtonElement, RoomNavCategoryButtonProps>(
  ({ className, closed, children, type = 'button', ...props }, ref) => (
    <button
      className={classNames(css.CategoryButton, className)}
      type={type}
      {...props}
      ref={ref}
    >
      <Icon
        className={css.CategoryButtonIcon}
        size="50"
        src={closed ? Icons.ChevronRight : Icons.ChevronBottom}
      />
      <Text size="O400" priority="300" truncate>
        {children}
      </Text>
    </button>
  )
);

RoomNavCategoryButton.displayName = 'RoomNavCategoryButton';
