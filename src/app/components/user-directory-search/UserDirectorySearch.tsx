import { Avatar, Box, config, Menu, MenuItem, Scroll, Spinner, Text, toRem } from 'folds';
import React, { useEffect, useRef, useState } from 'react';
import { MatrixClient } from 'matrix-js-sdk';
import { RoomAvatar } from '../room-avatar';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { getMxIdLocalPart, getMxIdServer, mxcUrlToHttp } from '../../utils/matrix';
import { nameInitials } from '../../utils/common';
import { highlightText, makeHighlightRegex } from '../../plugins/react-custom-html-parser';

export type UserDirectoryResult = {
  user_id: string;
  display_name?: string;
  avatar_url?: string;
};

export const useUserDirectorySearch = (
  mx: MatrixClient,
  query: string,
  limit = 50
): { users: UserDirectoryResult[]; loading: boolean } => {
  const requestRef = useRef(0);
  const [users, setUsers] = useState<UserDirectoryResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    const requestId = ++requestRef.current;
    if (!term || term.match(/^@[^:]+:[^:]+$/)) {
      setUsers([]);
      setLoading(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      mx.searchUserDirectory({ term: term.startsWith('@') ? term.slice(1) : term, limit })
        .then(({ results }) => {
          if (requestRef.current === requestId) setUsers(results);
        })
        .catch(() => {
          if (requestRef.current === requestId) setUsers([]);
        })
        .finally(() => {
          if (requestRef.current === requestId) setLoading(false);
        });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [limit, mx, query]);

  return { users, loading };
};

type UserDirectorySearchMenuProps = {
  mx: MatrixClient;
  users: UserDirectoryResult[];
  query: string;
  loading?: boolean;
  onSelect: (userId: string) => void;
};

export function UserDirectorySearchMenu({
  mx,
  users,
  query,
  loading,
  onSelect,
}: UserDirectorySearchMenuProps) {
  const useAuthentication = useMediaAuthentication();
  const highlightRegex = query.trim() ? makeHighlightRegex(query.trim().split(/\s+/)) : undefined;
  if (!loading && users.length === 0) return null;

  return (
    <Menu
      style={{
        position: 'absolute',
        top: `calc(100% + ${config.space.S100})`,
        zIndex: 10,
        width: '100%',
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
      }}
    >
      <Scroll size="300" style={{ maxHeight: `min(${toRem(360)}, calc(100vh - ${toRem(200)}))` }}>
        <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
          {users.map((user) => {
            const displayName = user.display_name || getMxIdLocalPart(user.user_id) || user.user_id;
            const avatarUrl = user.avatar_url
              ? mxcUrlToHttp(mx, user.avatar_url, useAuthentication, 40, 40, 'crop') ?? undefined
              : undefined;
            return (
              <MenuItem
                key={user.user_id}
                as="button"
                type="button"
                size="400"
                radii="400"
                variant="Surface"
                onClick={() => onSelect(user.user_id)}
                before={
                  <Avatar size="200" radii="400">
                    <RoomAvatar
                      roomId={user.user_id}
                      src={avatarUrl}
                      alt={displayName}
                      renderFallback={() => (
                        <Text as="span" size="H6">
                          {nameInitials(displayName)}
                        </Text>
                      )}
                    />
                  </Avatar>
                }
                after={
                  <Text size="T200" priority="300" truncate>
                    {getMxIdServer(user.user_id)}
                  </Text>
                }
              >
                <Box grow="Yes" direction="Column" justifyContent="Center">
                  <Text size="T400" truncate>
                    <b>
                      {highlightRegex ? highlightText(highlightRegex, [displayName]) : displayName}
                    </b>
                  </Text>
                  <Text size="T200" priority="300" truncate>
                    {highlightRegex ? highlightText(highlightRegex, [user.user_id]) : user.user_id}
                  </Text>
                </Box>
              </MenuItem>
            );
          })}
          {loading && (
            <Box justifyContent="Center" style={{ padding: config.space.S200 }}>
              <Spinner size="200" variant="Secondary" />
            </Box>
          )}
        </Box>
      </Scroll>
    </Menu>
  );
}
