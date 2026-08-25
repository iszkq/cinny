import React, {
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from 'react';
import {
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Box,
  Header,
  config,
  Text,
  IconButton,
  Icon,
  Icons,
  Input,
  Button,
  Spinner,
  color,
  TextArea,
  Dialog,
  Menu,
  toRem,
  Scroll,
  MenuItem,
} from 'folds';
import { Room } from 'matrix-js-sdk';
import { isKeyHotkey } from 'is-hotkey';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '../../utils/keyboard';
import { useDirectUsers } from '../../hooks/useDirectUsers';
import { getMxIdLocalPart, getMxIdServer, isUserId } from '../../utils/matrix';
import { Membership } from '../../../types/matrix/room';
import { useAsyncSearch, UseAsyncSearchOptions } from '../../hooks/useAsyncSearch';
import { highlightText, makeHighlightRegex } from '../../plugins/react-custom-html-parser';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { BreakWord } from '../../styles/Text.css';
import { useAlive } from '../../hooks/useAlive';
import { DirectoryUser } from '../../features/search/directorySearch';

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  limit: 1000,
  matchOptions: {
    contain: true,
  },
};
const getUserIdString = (userId: string) => getMxIdLocalPart(userId) ?? userId;

type InviteUserProps = {
  room: Room;
  requestClose: () => void;
};
export function InviteUserPrompt({ room, requestClose }: InviteUserProps) {
  const mx = useMatrixClient();
  const alive = useAlive();

  const inputRef = useRef<HTMLInputElement>(null);
  const searchRequestRef = useRef(0);
  const directUsers = useDirectUsers();
  const [validUserId, setValidUserId] = useState<string>();
  const [query, setQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);

  const filteredUsers = useMemo(
    () =>
      directUsers.filter((userId) => {
        const membership = room.getMember(userId)?.membership;
        return membership !== Membership.Join;
      }),
    [directUsers, room]
  );
  const [result, search, resetSearch] = useAsyncSearch(
    filteredUsers,
    getUserIdString,
    SEARCH_OPTIONS
  );
  const queryHighlighRegex = result?.query
    ? makeHighlightRegex(result.query.split(' '))
    : undefined;

  // Direct-room users are useful offline, while the homeserver directory is
  // what makes display-name search work for people not already in a DM.
  useEffect(() => {
    const term = query.trim();
    if (!term || isUserId(term)) {
      setDirectoryUsers([]);
      setDirectoryLoading(false);
      return undefined;
    }
    const requestId = ++searchRequestRef.current;
    const timer = window.setTimeout(() => {
      setDirectoryLoading(true);
      mx.searchUserDirectory({ term: term.startsWith('@') ? term.slice(1) : term, limit: 20 })
        .then(({ results }) => {
          if (searchRequestRef.current === requestId) setDirectoryUsers(results);
        })
        .catch(() => {
          if (searchRequestRef.current === requestId) setDirectoryUsers([]);
        })
        .finally(() => {
          if (searchRequestRef.current === requestId) setDirectoryLoading(false);
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mx, query]);

  const [inviteState, invite] = useAsyncCallback<void, Error, [string, string | undefined]>(
    useCallback(
      async (userId, reason) => {
        await mx.invite(room.roomId, userId, reason);
      },
      [mx, room]
    )
  );

  const inviting = inviteState.status === AsyncStatus.Loading;

  const handleReset = () => {
    if (inputRef.current) inputRef.current.value = '';
    setQuery('');
    setValidUserId(undefined);
    resetSearch();
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const target = evt.target as HTMLFormElement | undefined;

    if (inviting || !validUserId) return;

    const reasonInput = target?.reasonInput as HTMLTextAreaElement | undefined;
    const reason = reasonInput?.value.trim();

    invite(validUserId, reason || undefined).then(() => {
      if (alive()) {
        handleReset();
        if (reasonInput) reasonInput.value = '';
      }
    });
  };

  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setQuery(evt.currentTarget.value);
    const value = evt.currentTarget.value.trim();
    if (isUserId(value)) {
      setValidUserId(value);
    } else {
      setValidUserId(undefined);
      const term = getMxIdLocalPart(value) ?? (value.startsWith('@') ? value.slice(1) : value);
      if (term) {
        search(term);
      } else {
        resetSearch();
      }
    }
  };

  const handleUserId = (userId: string) => {
    if (inputRef.current) {
      inputRef.current.value = userId;
      setQuery(userId);
      setValidUserId(userId);
      resetSearch();
      inputRef.current.focus();
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('escape', evt)) {
      resetSearch();
      return;
    }
    if (isKeyHotkey('tab', evt) && result && result.items.length > 0) {
      evt.preventDefault();
      const userId = result.items[0];
      handleUserId(userId);
    }
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: () => inputRef.current,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog>
            <Box grow="Yes" direction="Column">
              <Header
                size="500"
                style={{ padding: `0 ${config.space.S200} 0 ${config.space.S400}` }}
              >
                <Box grow="Yes">
                  <Text size="H4" truncate>
                    {'\u9080\u8bf7\u6210\u5458'}
                  </Text>
                </Box>
                <Box shrink="No">
                  <IconButton size="300" radii="300" onClick={requestClose}>
                    <Icon src={Icons.Cross} />
                  </IconButton>
                </Box>
              </Header>
              <Box
                as="form"
                onSubmit={handleSubmit}
                shrink="No"
                style={{ padding: config.space.S400 }}
                direction="Column"
                gap="400"
              >
                <Box direction="Column" gap="100">
                  <Text size="L400">{'\u7528\u6237 ID'}</Text>
                  <div>
                    <Input
                      size="500"
                      ref={inputRef}
                      onChange={handleSearchChange}
                      onKeyDown={handleKeyDown}
                      placeholder="@username:server"
                      name="userIdInput"
                      variant="Background"
                      disabled={inviting}
                      autoComplete="off"
                      required
                    />
                    {(directoryUsers.length > 0 || (result && result.items.length > 0)) && (
                      <FocusTrap
                        focusTrapOptions={{
                          initialFocus: false,
                          onDeactivate: resetSearch,
                          returnFocusOnDeactivate: false,
                          clickOutsideDeactivates: true,
                          allowOutsideClick: true,
                          isKeyForward: (evt: KeyboardEvent) => isKeyHotkey('arrowdown', evt),
                          isKeyBackward: (evt: KeyboardEvent) => isKeyHotkey('arrowup', evt),
                          escapeDeactivates: stopPropagation,
                        }}
                      >
                        <Box style={{ position: 'relative' }}>
                          <Menu style={{ position: 'absolute', top: 0, zIndex: 1, width: '100%' }}>
                            <Scroll size="300" style={{ maxHeight: toRem(100) }}>
                              <div style={{ padding: config.space.S100 }}>
                                {[
                                  ...directoryUsers.map((user) => user.user_id),
                                  ...(result?.items ?? []),
                                ]
                                  .filter((userId, index, users) => users.indexOf(userId) === index)
                                  .map((userId) => {
                                    const directoryUser = directoryUsers.find(
                                      (user) => user.user_id === userId
                                    );
                                    const username = `${getMxIdLocalPart(userId)}`;
                                    const userServer = getMxIdServer(userId);

                                    return (
                                      <MenuItem
                                        key={userId}
                                        type="button"
                                        size="300"
                                        variant="Surface"
                                        radii="300"
                                        onClick={() => handleUserId(userId)}
                                        after={
                                          <Text size="T200" truncate>
                                            {userServer}
                                          </Text>
                                        }
                                        disabled={inviting}
                                      >
                                        <Box grow="Yes">
                                          <Text size="T300" truncate>
                                            <b>
                                              {directoryUser?.display_name ??
                                                (queryHighlighRegex
                                                  ? highlightText(queryHighlighRegex, [
                                                      username ?? userId,
                                                    ])
                                                  : username)}
                                            </b>
                                          </Text>
                                          {directoryUser?.display_name && (
                                            <Text size="T200" truncate>
                                              {userId}
                                            </Text>
                                          )}
                                        </Box>
                                      </MenuItem>
                                    );
                                  })}
                                {directoryLoading && <Spinner size="200" variant="Secondary" />}
                              </div>
                            </Scroll>
                          </Menu>
                        </Box>
                      </FocusTrap>
                    )}
                  </div>
                </Box>
                <Box direction="Column" gap="100">
                  <Text size="L400">{'\u9080\u8bf7\u539f\u56e0\uff08\u53ef\u9009\uff09'}</Text>
                  <TextArea
                    size="500"
                    name="reasonInput"
                    variant="Background"
                    rows={4}
                    resize="None"
                  />
                </Box>
                {inviteState.status === AsyncStatus.Error && (
                  <Text size="T200" style={{ color: color.Critical.Main }} className={BreakWord}>
                    <b>{inviteState.error.message}</b>
                  </Text>
                )}
                <Button
                  type="submit"
                  disabled={!validUserId || inviting}
                  before={inviting && <Spinner size="200" variant="Primary" fill="Solid" />}
                >
                  <Text size="B400">{'\u53d1\u9001\u9080\u8bf7'}</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
