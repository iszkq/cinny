import React, { ChangeEventHandler, useRef } from 'react';
import { Input, Chip, Icon, Icons, Text } from 'folds';
import { mobileOrTablet } from '../../../utils/user-agent';

type SearchInputProps = {
  query?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  allowTextCustomEmoji?: boolean;
  onTextCustomEmojiSelect?: (text: string) => void;
};
export function SearchInput({
  query,
  onChange,
  allowTextCustomEmoji,
  onTextCustomEmojiSelect,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleReact = () => {
    const textEmoji = inputRef.current?.value.trim();
    if (!textEmoji) return;
    onTextCustomEmojiSelect?.(textEmoji);
  };

  return (
    <Input
      ref={inputRef}
      variant="SurfaceVariant"
      size="400"
      placeholder={
        allowTextCustomEmoji
          ? '\u641c\u7d22\u8868\u60c5\u6216\u8f93\u5165\u6587\u5b57\u53cd\u5e94'
          : '\u641c\u7d22'
      }
      maxLength={50}
      after={
        allowTextCustomEmoji && query ? (
          <Chip
            variant="Primary"
            radii="Pill"
            after={<Icon src={Icons.ArrowRight} size="50" />}
            outlined
            onClick={handleReact}
          >
            <Text size="L400">{'\u53d1\u9001\u53cd\u5e94'}</Text>
          </Chip>
        ) : (
          <Icon src={Icons.Search} size="50" />
        )
      }
      onChange={onChange}
      autoFocus={!mobileOrTablet()}
    />
  );
}
