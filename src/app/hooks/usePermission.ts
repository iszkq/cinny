import { useEffect, useState } from 'react';
import { isDesktopUpdaterSupported } from '../utils/desktopUpdater';
import { getDesktopNotificationState } from '../utils/notifications';

export { getNotificationState } from '../utils/notifications';

export function usePermissionState(name: PermissionName, initialValue: PermissionState = 'prompt') {
  const [permissionState, setPermissionState] = useState<PermissionState>(initialValue);

  useEffect(() => {
    if (name === 'notifications' && isDesktopUpdaterSupported()) {
      let cancelled = false;

      const syncDesktopPermission = () => {
        getDesktopNotificationState()
          .then((state) => {
            if (!cancelled) {
              setPermissionState(state);
            }
          })
          .catch(() => undefined);
      };

      syncDesktopPermission();

      const handleFocus = () => {
        syncDesktopPermission();
      };
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          syncDesktopPermission();
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
