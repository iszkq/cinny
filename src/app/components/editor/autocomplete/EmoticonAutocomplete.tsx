import React, { KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo } from 'react';
import { Editor } from 'slate';
import { Box, MenuItem, Text, toRem } from 'folds';
import { Room } from 'matrix-js-sdk';

import { AutocompleteQuery } from './autocompleteQuery';
import { AutocompleteMenu } from './AutocompleteMenu';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { UseAsyncSearchOptions, useAsyncSearch } from '../../../hooks/useAsyncSearch';
import { onTabPress } from '../../../utils/keyboard';
import { createEmoticonElement, moveCursor, replaceWithElement } from '../utils';
import { useRecentEmoji } from '../../../hooks/useRecentEmoji';
import { usePersonalImagePacks, useRelevantImagePacks } from '../../../hooks/useImagePacks';
import { IEmoji, emojis } from '../../../plugins/emoji';
import { useKeyDown } from '../../../hooks/useKeyDown';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { ImageUsage, PackImageReader } from '../../../plugins/custom-emoji';
import { getEmoticonSearchStr } from '../../../plugins/utils';
import { useCachedMediaUrl } from '../../../hooks/useCachedMediaUrl';
import { getEmojiBoardMediaUrls } from '../../emoji-board/components/media';

type EmoticonCompleteHandler = (key: string, shortcode: string) => void;

type EmoticonSearchItem = PackImageReader | IEmoji;

type EmoticonAutocompleteProps = {
  imagePackRooms: Room[];
  imagePackMode?: 'contextual' | 'personal';
  editor: Editor;
  query: AutocompleteQuery<string>;
  requestClose: () => void;
};

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  matchOptions: {
    contain: true,
  },
};

function CustomEmojiOptionMedia({ src, alt }: { src: string; alt: string }) {
  const cachedMediaUrl = useCachedMediaUrl(src);

  return (
    <Box
      shrink="No"
      as="img"
      src={cachedMediaUrl ?? src}
      alt={alt}
      style={{ width: toRem(24), height: toRem(24), objectFit: 'contain' }}
    />
  );
}

export function EmoticonAutocomplete({
  imagePackRooms,
  imagePackMode = 'contextual',
  editor,
  query,
  requestClose,
}: EmoticonAutocompleteProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const contextualImagePacks = useRelevantImagePacks(ImageUsage.Emoticon, imagePackRooms);
  const personalImagePacks = usePersonalImagePacks(ImageUsage.Emoticon);
  const imagePacks = imagePackMode === 'personal' ? personalImagePacks : contextualImagePacks;
  const recentEmoji = useRecentEmoji(mx, 20);

  const searchList = useMemo(() => {
    const list: Array<EmoticonSearchItem> = [];
    return list.concat(
      imagePacks.flatMap((pack) => pack.getImages(ImageUsage.Emoticon)),
      emojis
    );
  }, [imagePacks]);

  const [result, search, resetSearch] = useAsyncSearch(
    searchList,
    getEmoticonSearchStr,
    SEARCH_OPTIONS
  );
  const autoCompleteEmoticon = result ? result.items.slice(0, 20) : recentEmoji;

  useEffect(() => {
    if (query.text) search(query.text);
    else resetSearch();
  }, [query.text, search, resetSearch]);

  const handleAutocomplete: EmoticonCompleteHandler = (key, shortcode) => {
    const emoticonEl = createEmoticonElement(key, shortcode);
    replaceWithElement(editor, query.range, emoticonEl);
    moveCursor(editor, true);
    requestClose();
  };

  useKeyDown(window, (evt: KeyboardEvent) => {
    onTabPress(evt, () => {
      if (autoCompleteEmoticon.length === 0) return;
      const emoticon = autoCompleteEmoticon[0];
      const key = 'url' in emoticon ? emoticon.url : emoticon.unicode;
      handleAutocomplete(key, emoticon.shortcode);
    });
  });

  return autoCompleteEmoticon.length === 0 ? null : (
    <AutocompleteMenu
      headerContent={<Text size="L400">{'\u8868\u60c5'}</Text>}
      requestClose={requestClose}
    >
      {autoCompleteEmoticon.map((emoticon) => {
        const isCustomEmoji = 'url' in emoticon;
        const key = isCustomEmoji ? emoticon.url : emoticon.unicode;
        const customEmojiUrl = isCustomEmoji
          ? getEmojiBoardMediaUrls({
              mx,
              mxc: key,
              useAuthentication,
              info: emoticon.info,
              width: 48,
              height: 48,
            }).primaryUrl
          : undefined;

        return (
          <MenuItem
            key={emoticon.shortcode + key}
            as="button"
            radii="300"
            onKeyDown={(evt: ReactKeyboardEvent<HTMLButtonElement>) =>
              onTabPress(evt, () => handleAutocomplete(key, emoticon.shortcode))
            }
            onClick={() => handleAutocomplete(key, emoticon.shortcode)}
            before={
              isCustomEmoji && customEmojiUrl ? (
                <CustomEmojiOptionMedia src={customEmojiUrl} alt={emoticon.shortcode} />
              ) : (
                <Box
                  shrink="No"
                  as="span"
                  display="InlineFlex"
                  style={{ fontSize: toRem(24), lineHeight: toRem(24) }}
                >
                  {key}
                </Box>
              )
            }
          >
            <Text style={{ flexGrow: 1 }} size="B400" truncate>
              :{emoticon.shortcode}:
            </Text>
          </MenuItem>
        );
      })}
    </AutocompleteMenu>
  );
}
