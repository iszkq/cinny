import { MatrixClient } from 'matrix-js-sdk';
import { getRoomCreatorsForRoomId } from '../hooks/useRoomCreators';
import { getRoomPermissionsAPI, RoomPermissionsAPI } from '../hooks/useRoomPermissions';
import { getStateEvent, getStateEvents, isSpace } from './room';
import { IPowerLevels } from '../hooks/usePowerLevels';
import { StateEvent } from '../../types/matrix/room';

const canEditSpaceChildren = (mx: MatrixClient, spaceId: string): boolean => {
  const space = mx.getRoom(spaceId);
  if (!space || !isSpace(space) || space.getMyMembership() !== 'join') return false;
  const powerEvent = getStateEvent(space, StateEvent.RoomPowerLevels);
  const powerLevels = (powerEvent?.getContent<IPowerLevels>() ?? {}) as IPowerLevels;
  const permissions: RoomPermissionsAPI = getRoomPermissionsAPI(
    getRoomCreatorsForRoomId(mx, spaceId),
    powerLevels
  );
  return permissions.stateEvent(StateEvent.SpaceChild, mx.getSafeUserId());
};

/** Remove a room from every joined parent space where the user can edit hierarchy. */
export const removeRoomFromEditableParents = async (
  mx: MatrixClient,
  roomId: string
): Promise<void> => {
  const updates = mx
    .getRooms()
    .filter((space) => isSpace(space) && canEditSpaceChildren(mx, space.roomId))
    .filter((space) =>
      getStateEvents(space, StateEvent.SpaceChild).some(
        (event) => event.getStateKey() === roomId && event.getContent().via
      )
    )
    .map((space) => mx.sendStateEvent(space.roomId, StateEvent.SpaceChild as any, {}, roomId));
  await Promise.allSettled(updates);
};
