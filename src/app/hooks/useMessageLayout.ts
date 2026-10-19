import { useMemo } from 'react';
import { MessageLayout } from '../state/settings';

export type MessageLayoutItem = {
  name: string;
  layout: MessageLayout;
};

export const useMessageLayoutItems = (): MessageLayoutItem[] =>
  useMemo(
    () => [
      {
        layout: MessageLayout.Modern,
        name: '现代',
      },
      {
        layout: MessageLayout.Compact,
        name: '紧凑',
      },
      {
        layout: MessageLayout.Bubble,
        name: '左右聊天（自己在右）',
      },
    ],
    []
  );
