import {
  Box,
  Button,
  Chip,
  config,
  Icon,
  Icons,
  Input,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Scroll,
  Text,
  toRem,
} from 'folds';
import { isKeyHotkey } from 'is-hotkey';
import FocusTrap from 'focus-trap-react';
import React, {
  ChangeEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  useMemo,
  useState,
} from 'react';
import { getMxIdLocalPart, getMxIdServer, isUserId } from '../../utils/matrix';
import { useDirectUsers } from '../../hooks/useDirectUsers';
import { SettingTile } from '../setting-tile';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { stopPropagation } from '../../utils/keyboard';
import { useAsyncSearch, UseAsyncSearchOptions } from '../../hooks/useAsyncSearch';
import { highlightText, makeHighlightRegex } from '../../plugins/react-custom-html-parser';

export const useAdditionalCreators = (defaultCreators?: string[]) => {
  const mx = useMatrixClient();
  const [additionalCreators, setAdditionalCreators] = useState<string[]>(
    () => defaultCreators?.filter((id) => id !== mx.getSafeUserId()) ?? []
  );

  const addAdditionalCreator = (userId: string) => {
    if (userId === mx.getSafeUserId()) return;

    setAdditionalCreators((creators) => {
      const creatorsSet = new Set(creators);
      creatorsSet.add(userId);
      return Array.from(creatorsSet);
    });
  };

  const removeAdditionalCreator = (userId: string) => {
    setAdditionalCreators((creators) => {
      const creatorsSet = new Set(creators);
      creatorsSet.delete(userId);
      return Array.from(creatorsSet);
    });
  };

  return {
    additionalCreators,
    addAdditionalCreator,
    removeAdditionalCreator,
  };
};

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  limit: 1000,
  matchOptions: {
    contain: true,
  },
};
const getUserIdString = (userId: string) => getMxIdLocalPart(userId) ?? userId;

type AdditionalCreatorInputProps = {
  additionalCreators: string[];
  onSelect: (userId: string) => void;
  onRemove: (userId: string) => void;
  disabled?: boolean;
};
export function AdditionalCreatorInput({
  additionalCreators,
  onSelect,
  onRemove,
  disabled,
}: AdditionalCreatorInputProps) {
  const mx = useMatrixClient();
  const [menuCords, setMenuCords] = useState<RectCords>();
  const directUsers = useDirectUsers();

  const [validUserId, setValidUserId] = useState<string>();
  const filteredUsers = useMemo(
    () => directUsers.filter((userId) => !additionalCreators.includes(userId)),
    [directUsers, additionalCreators]
  );
  const [result, search, resetSearch] = useAsyncSearch(
    filteredUsers,
    getUserIdString,
    SEARCH_OPTIONS
  );
  const queryHighlighRegex = result?.query ? makeHighlightRegex([result.query]) : undefined;

  const suggestionUsers = result
    ? result.items
    : filteredUsers.sort((a, b) => (a.toLocaleLowerCase() >= b.toLocaleLowerCase() ? 1 : -1));

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };
  const handleCloseMenu = () => {
    setMenuCords(undefined);
    setValidUserId(undefined);
    resetSearch();
  };

  const handleCreatorChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const creatorInput = evt.currentTarget;
    const creator = creatorInput.value.trim();
    if (isUserId(creator)) {
      setValidUserId(creator);
    } else {
      setValidUserId(undefined);
      const term =
        getMxIdLocalPart(creator) ?? (creator.startsWith('@') ? creator.slice(1) : creator);
      if (term) {
        search(term);
      } else {
        resetSearch();
      }
    }
  };

  const handleSelectUserId = (userId?: string) => {
    if (userId && isUserId(userId)) {
      onSelect(userId);
      handleCloseMenu();
    }
  };

  const handleCreatorKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('enter', evt)) {
      evt.preventDefault();
      const creator = evt.currentTarget.value.trim();
      handleSelectUserId(isUserId(creator) ? creator : suggestionUsers[0]);
    }
  };

  const handleEnterClick = () => {
    handleSelectUserId(validUserId);
  };

  return (
    <SettingTile
      title={'\u521b\u59cb\u6210\u5458'}
      description={
        '\u53ef\u5728\u521b\u5efa\u65f6\u6307\u5b9a\u5177\u6709\u7279\u6b8a\u6743\u9650\u7684\u7528\u6237\u3002\u8fd9\u4e9b\u7528\u6237\u62e5\u6709\u66f4\u9ad8\u63a7\u5236\u6743\u9650\uff0c\u4e14\u901a\u5e38\u53ea\u80fd\u5728\u5347\u7ea7\u623f\u95f4\u65f6\u8c03\u6574\u3002'
      }
    >
      <Box shrink="No" direction="Column" gap="100">
        <Box gap="200" wrap="Wrap">
          <Chip type="button" variant="Primary" radii="Pill" outlined>
            <Text size="B300">{mx.getSafeUserId()}</Text>
          </Chip>
          {additionalCreators.map((creator) => (
            <Chip
              type="button"
              key={creator}
              variant="Secondary"
              radii="Pill"
              after={<Icon size="50" src={Icons.Cross} />}
              onClick={() => onRemove(creator)}
              disabled={disabled}
            >
              <Text size="B300">{creator}</Text>
            </Chip>
          ))}
          <PopOut
            anchor={menuCords}
            position="Bottom"
            align="Center"
            content={
              <FocusTrap
                focusTrapOptions={{
                  onDeactivate: handleCloseMenu,
                  clickOutsideDeactivates: true,
                  isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                  isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Menu
                  style={{
                    width: '100vw',
                    maxWidth: toRem(300),
                    height: toRem(250),
                    display: 'flex',
                  }}
                >
                  <Box grow="Yes" direction="Column">
                    <Box shrink="No" gap="100" style={{ padding: config.space.S100 }}>
                      <Box grow="Yes" direction="Column" gap="100">
                        <Input
                          size="400"
                          variant="Background"
                          radii="300"
                          outlined
                          placeholder="@username:server"
                          onChange={handleCreatorChange}
                          onKeyDown={handleCreatorKeyDown}
                        />
                      </Box>
                      <Button
                        type="button"
                        variant="Success"
                        radii="300"
                        onClick={handleEnterClick}
                        disabled={!validUserId}
                      >
                        <Text size="B400">{'\u6dfb\u52a0'}</Text>
                      </Button>
                    </Box>
                    <Line size="300" />
                    <Box grow="Yes" direction="Column">
                      {!validUserId && suggestionUsers.length > 0 ? (
                        <Scroll size="300" hideTrack>
                          <Box
                            grow="Yes"
                            direction="Column"
                            gap="100"
                            style={{ padding: config.space.S200, paddingRight: 0 }}
                          >
                            {suggestionUsers.map((userId) => (
                              <MenuItem
                                key={userId}
                                size="300"
                                variant="Surface"
                                radii="300"
                                onClick={() => handleSelectUserId(userId)}
                                after={
                                  <Text size="T200" truncate>
                                    {getMxIdServer(userId)}
                                  </Text>
                                }
                              >
                                <Box grow="Yes">
                                  <Text size="T200" truncate>
                                    <b>
                                      {queryHighlighRegex
                                        ? highlightText(queryHighlighRegex, [
                                            getMxIdLocalPart(userId) ?? userId,
                                          ])
                                        : getMxIdLocalPart(userId)}
                                    </b>
                                  </Text>
                                </Box>
                              </MenuItem>
                            ))}
                          </Box>
                        </Scroll>
                      ) : (
                        <Box
                          grow="Yes"
                          alignItems="Center"
                          justifyContent="Center"
                          direction="Column"
                          gap="100"
                        >
                          <Text size="H6" align="Center">
                            {'\u6682\u65e0\u5efa\u8bae'}
                          </Text>
                          <Text size="T200" align="Center">
                            {'\u8bf7\u8f93\u5165\u7528\u6237 ID \u540e\u70b9\u51fb\u6dfb\u52a0\u3002'}
                          </Text>
                        </Box>
                      )}
                    </Box>
                  </Box>
                </Menu>
              </FocusTrap>
            }
          >
            <Chip
              type="button"
              variant="Secondary"
              radii="Pill"
              onClick={handleOpenMenu}
              aria-pressed={!!menuCords}
              disabled={disabled}
            >
              <Icon size="50" src={Icons.Plus} />
            </Chip>
          </PopOut>
        </Box>
      </Box>
    </SettingTile>
  );
}
