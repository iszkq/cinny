import { Room } from 'matrix-js-sdk';
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
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

export const useCallMembers = (room: Room, session: MatrixRTCSession): CallMembership[] => {
  relaxCallEventListenerLimit(session);

  const [memberships, setMemberships] = useState<CallMembership[]>(
    MatrixRTCSession.sessionMembershipsForRoom(room, session.sessionDescription)
  );

  useEffect(() => {
    const updateMemberships = () => {
      setMemberships(MatrixRTCSession.sessionMembershipsForRoom(room, session.sessionDescription));
    };

    updateMemberships();

    session.on(MatrixRTCSessionEvent.MembershipsChanged, updateMemberships);
    return () => {
      session.removeListener(MatrixRTCSessionEvent.MembershipsChanged, updateMemberships);
    };
  }, [session, room]);

  return memberships;
};

export const useCallMembersChange = (session: MatrixRTCSession, callback: () => void): void => {
  relaxCallEventListenerLimit(session);

  useEffect(() => {
    session.on(MatrixRTCSessionEvent.MembershipsChanged, callback);
    return () => {
      session.removeListener(MatrixRTCSessionEvent.MembershipsChanged, callback);
    };
  }, [session, callback]);
};
