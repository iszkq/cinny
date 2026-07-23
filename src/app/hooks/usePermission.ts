import { useEffect, useState } from 'react';
import { getAppNotificationState } from '../utils/notifications';

export { getNotificationState } from '../utils/notifications';

export function usePermissionState(name: PermissionName, initialValue: PermissionState = 'prompt') {
  const [permissionState, setPermissionState] = useState<PermissionState>(initialValue);

  useEffect(() => {
    if (name === 'notifications') {
      let cancelled = false;

      const syncNotificationPermission = () => {
        getAppNotificationState()
          .then((state) => {
            if (!cancelled) {
              setPermissionState(state);
            }
          })
          .catch(() => undefined);
      };

      syncNotificationPermission();

      const handleFocus = () => {
        syncNotificationPermission();
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          syncNotificationPermission();
        }
      };

      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        cancelled = true;
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    if (!navigator.permissions?.query) return undefined;

    let permissionStatus: PermissionStatus;

    function handlePermissionChange(this: PermissionStatus) {
      setPermissionState(this.state);
    }

    navigator.permissions
      .query({ name })
      .then((permStatus: PermissionStatus) => {
        permissionStatus = permStatus;
        handlePermissionChange.apply(permStatus);
        permStatus.addEventListener('change', handlePermissionChange);
      })
      .catch(() => {
        // Silence error since FF doesn't support microphone permission
      });

    return () => {
      permissionStatus?.removeEventListener('change', handlePermissionChange);
    };
  }, [name]);

  return permissionState;
}
