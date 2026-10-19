import type { SessionIdentity } from '../app/state/sessions';

const KEY = 'cinny_native_session_failure';
export type NativeSessionFailure = { softLogout: boolean };

export function readNativeSessionFailure(
  session?: SessionIdentity
): NativeSessionFailure | undefined {
  if (!session) return undefined;
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return value &&
      value.baseUrl === session.baseUrl &&
      value.userId === session.userId &&
      value.deviceId === session.deviceId &&
      typeof value.softLogout === 'boolean'
      ? { softLogout: value.softLogout }
      : undefined;
  } catch {
    return undefined;
  }
}

export function markNativeSessionFailure(session: SessionIdentity, softLogout: boolean) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      baseUrl: session.baseUrl,
      userId: session.userId,
      deviceId: session.deviceId,
      softLogout,
    })
  );
}

export function clearNativeSessionFailure() {
  localStorage.removeItem(KEY);
}
