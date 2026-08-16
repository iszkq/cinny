import { IPublicRoomsChunkRoom, MatrixClient, RoomType } from 'matrix-js-sdk';
import { isRoomAlias } from '../../utils/matrix';

export type DirectorySearchScope = 'all' | 'users' | 'rooms' | 'spaces';

type UserDirectoryResponse = Awaited<ReturnType<MatrixClient['searchUserDirectory']>>;
export type DirectoryUser = UserDirectoryResponse['results'][number];

export type DirectorySearchItem =
  | {
      type: 'user';
      user: DirectoryUser;
    }
  | {
      type: 'room';
      room: IPublicRoomsChunkRoom;
    };

export type DirectorySearchResult = {
  items: DirectorySearchItem[];
  unavailableSources: number;
};

const DIRECTORY_RESULT_LIMIT = 20;

const shouldSearchUsers = (scope: DirectorySearchScope): boolean =>
  scope === 'all' || scope === 'users';

const shouldSearchRooms = (scope: DirectorySearchScope): boolean => scope !== 'users';

const getRoomTypes = (scope: DirectorySearchScope): Array<RoomType | null> | undefined => {
  if (scope === 'rooms') return [null];
  if (scope === 'spaces') return [RoomType.Space];
  return undefined;
};

const roomMatchesScope = (room: IPublicRoomsChunkRoom, scope: DirectorySearchScope): boolean => {
  if (scope === 'rooms') return room.room_type !== RoomType.Space;
  if (scope === 'spaces') return room.room_type === RoomType.Space;
  return true;
};

const searchRoomDirectory = async (
  mx: MatrixClient,
  query: string,
  scope: DirectorySearchScope
): Promise<DirectorySearchItem[]> => {
  const { chunk } = await mx.publicRooms({
    limit: DIRECTORY_RESULT_LIMIT,
    filter: {
      generic_search_term: query,
      room_types: getRoomTypes(scope),
    },
  });

  if (
    isRoomAlias(query) &&
    !chunk.some((room) => room.canonical_alias === query || room.aliases?.includes(query))
  ) {
    try {
      const { room_id: roomId } = await mx.getRoomIdForAlias(query);
      const summary = await mx.getRoomSummary(query).catch(() => undefined);
      const exactRoom: IPublicRoomsChunkRoom = summary
        ? { ...summary, room_id: roomId, canonical_alias: query }
        : {
            room_id: roomId,
            canonical_alias: query,
            name: query,
            world_readable: false,
            guest_can_join: false,
            num_joined_members: 0,
          };

      if (roomMatchesScope(exactRoom, scope)) chunk.push(exactRoom);
    } catch {
      // A directory search should still succeed when an exact alias cannot be resolved.
    }
  }

  return chunk.map((room) => ({ type: 'room' as const, room }));
};

export const searchHomeserverDirectory = async (
  mx: MatrixClient,
  query: string,
  scope: DirectorySearchScope
): Promise<DirectorySearchResult> => {
  const requests: Array<Promise<DirectorySearchItem[]>> = [];

  if (shouldSearchUsers(scope)) {
    requests.push(
      mx
        .searchUserDirectory({ term: query, limit: DIRECTORY_RESULT_LIMIT })
        .then(({ results }) => results.map((user) => ({ type: 'user' as const, user })))
    );
  }

  if (shouldSearchRooms(scope)) {
    requests.push(searchRoomDirectory(mx, query, scope));
  }

  const settledRequests = await Promise.allSettled(requests);
  const availableResults = settledRequests.flatMap((request) =>
    request.status === 'fulfilled' ? request.value : []
  );
  const failedRequests = settledRequests.filter(
    (request): request is PromiseRejectedResult => request.status === 'rejected'
  );

  if (availableResults.length === 0 && failedRequests.length === requests.length) {
    throw failedRequests[0]?.reason ?? new Error('Homeserver directory search failed.');
  }

  return {
    items: availableResults,
    unavailableSources: failedRequests.length,
  };
};
