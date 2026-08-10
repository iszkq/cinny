import { useSetAtom, WritableAtom } from 'jotai';
import { ClientEvent, MatrixClient, Room, RoomEvent, SyncState } from 'matrix-js-sdk';
import { useCallback, useEffect, useRef } from 'react';
import { Membership } from '../../../types/matrix/room';
import { useSyncState } from '../../hooks/useSyncState';
import { factoryRoomIdByActivity } from '../../utils/sort';

const INITIAL_ROOM_BATCH_SIZE = 24;
const ROOM_BATCH_SIZE = 48;
const ROOM_BATCH_INTERVAL_MS = 16;

export type RoomsAction =
  | {
      type: 'INITIALIZE';
      rooms: string[];
    }
  | {
      type: 'APPEND';
      rooms: string[];
    }
  | {
      type: 'PUT' | 'DELETE';
      roomId: string;
    };

export const useBindRoomsWithMembershipsAtom = (
  mx: MatrixClient,
  roomsAtom: WritableAtom<string[], [RoomsAction], undefined>,
  memberships: Membership[]
) => {
  const setRoomsAtom = useSetAtom(roomsAtom);
  const initializationGenerationRef = useRef(0);
  const batchTimerRef = useRef<number>();

  const cancelPendingBatches = useCallback(() => {
    initializationGenerationRef.current += 1;
    if (batchTimerRef.current !== undefined) {
      window.clearTimeout(batchTimerRef.current);
      batchTimerRef.current = undefined;
    }
  }, []);

  const initializeRooms = useCallback(() => {
    cancelPendingBatches();
    const initializationGeneration = initializationGenerationRef.current;
    const satisfyMembership = (room: Room): boolean =>
      !!memberships.find((membership) => membership === room.getMyMembership());

    const roomIds = mx
      .getRooms()
      .filter(satisfyMembership)
      .map((room) => room.roomId)
      .sort(factoryRoomIdByActivity(mx));

    setRoomsAtom({
      type: 'INITIALIZE',
      rooms: roomIds.slice(0, INITIAL_ROOM_BATCH_SIZE),
    });

    let nextRoomIndex = INITIAL_ROOM_BATCH_SIZE;
    const appendNextBatch = () => {
      if (initializationGenerationRef.current !== initializationGeneration) return;

      const batchEndIndex = nextRoomIndex + ROOM_BATCH_SIZE;
      const nextRoomIds = roomIds.slice(nextRoomIndex, batchEndIndex).filter((roomId) => {
        const room = mx.getRoom(roomId);
        return room ? satisfyMembership(room) : false;
      });
      nextRoomIndex = batchEndIndex;

      if (nextRoomIds.length > 0) {
        setRoomsAtom({ type: 'APPEND', rooms: nextRoomIds });
      }
      if (nextRoomIndex < roomIds.length) {
        batchTimerRef.current = window.setTimeout(appendNextBatch, ROOM_BATCH_INTERVAL_MS);
      } else {
        batchTimerRef.current = undefined;
      }
    };

    if (nextRoomIndex < roomIds.length) {
      batchTimerRef.current = window.setTimeout(appendNextBatch, ROOM_BATCH_INTERVAL_MS);
    }
  }, [mx, memberships, setRoomsAtom, cancelPendingBatches]);

  useSyncState(
    mx,
    useCallback(
      (state, prevState) => {
        if (
          state !== prevState &&
          (state === SyncState.Prepared ||
            state === SyncState.Syncing ||
            state === SyncState.Catchup)
        ) {
          initializeRooms();
        }
      },
      [initializeRooms]
    )
  );

  useEffect(() => {
    const satisfyMembership = (room: Room): boolean =>
      !!memberships.find((membership) => membership === room.getMyMembership());
    initializeRooms();

    const handleAddRoom = (room: Room) => {
      if (satisfyMembership(room)) {
        setRoomsAtom({ type: 'PUT', roomId: room.roomId });
      }
    };

    const handleMembershipChange = (room: Room) => {
      if (satisfyMembership(room)) {
        setRoomsAtom({ type: 'PUT', roomId: room.roomId });
      } else {
        setRoomsAtom({ type: 'DELETE', roomId: room.roomId });
      }
    };

    const handleDeleteRoom = (roomId: string) => {
      setRoomsAtom({ type: 'DELETE', roomId });
    };

    mx.on(ClientEvent.Room, handleAddRoom);
    mx.on(RoomEvent.MyMembership, handleMembershipChange);
    mx.on(ClientEvent.DeleteRoom, handleDeleteRoom);
    return () => {
      cancelPendingBatches();
      mx.removeListener(ClientEvent.Room, handleAddRoom);
      mx.removeListener(RoomEvent.MyMembership, handleMembershipChange);
      mx.removeListener(ClientEvent.DeleteRoom, handleDeleteRoom);
    };
  }, [mx, memberships, setRoomsAtom, initializeRooms, cancelPendingBatches]);
};

export const compareRoomsEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  return a.every((roomId, roomIdIndex) => roomId === b[roomIdIndex]);
};
