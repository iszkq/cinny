import { Room } from 'matrix-js-sdk';
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
  MatrixRTCSessionEventHandlerMap,
} from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { useEffect, useState } from 'react';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { useMatrixClient } from './useMatrixClient';

type ListenerLimitedEmitter = {
  setMaxListeners?: (maxListeners: number) => void;
};

const CALL_EVENT_MAX_LISTENERS = 200;

const relaxCallEventListenerLimit = (emitter: ListenerLimitedEmitter): void => {
  emitter.setMaxListeners?.(CALL_EVENT_MAX_LISTENERS);
};

export const useCallSession = (room: Room): MatrixRTCSession => {
  const mx = useMatrixClient();

  relaxCallEventListenerLimit(mx.matrixRTC);

  const [session, setSession] = useState(() => {
    const initialSession = mx.matrixRTC.getRoomSession(room);
    relaxCallEventListenerLimit(initialSession);
    return initialSession;
  });

  useEffect(() => {
    const start = (roomId: string) => {
      if (roomId !== room.roomId) return;
      const nextSession = mx.matrixRTC.getRoomSession(room);
      relaxCallEventListenerLimit(nextSession);
      setSession(nextSession);
    };
    const end = (roomId: string) => {
      if (roomId !== room.roomId) return;
      const nextSession = mx.matrixRTC.getRoomSession(room);
      relaxCallEventListenerLimit(nextSession);
      setSession(nextSession);
    };
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, start);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, end);
    return () => {
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, start);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, end);
    };
  }, [mx, room]);

  return session;
};

export const useCallMembersChange = (
  session: MatrixRTCSession,
  callback: (members: CallMembership[]) => void
): void => {
  relaxCallEventListenerLimit(session);

  useEffect(() => {
    const handleMembershipsChange: MatrixRTCSessionEventHandlerMap[MatrixRTCSessionEvent.MembershipsChanged] =
      (_oldestMembership, newMemberships) => {
        callback(newMemberships);
      };

    session.on(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChange);
    return () => {
      session.removeListener(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChange);
    };
  }, [session, callback]);
};

export const useCallMembers = (session: MatrixRTCSession): CallMembership[] => {
  relaxCallEventListenerLimit(session);

  const [memberships, setMemberships] = useState<CallMembership[]>(session.memberships);

  useCallMembersChange(session, setMemberships);

  return memberships;
};
