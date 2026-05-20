import React, { useCallback, useEffect } from 'react';
import { Box, Text, Switch, Button, color, Spinner } from 'folds';
import { IPusherRequest } from 'matrix-js-sdk';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { APP_DISPLAY_NAME } from '../../../constants/branding';
import { getNotificationState, usePermissionState } from '../../../hooks/usePermission';
import { useEmailNotifications } from '../../../hooks/useEmailNotifications';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { isDesktopUpdaterSupported } from '../../../utils/desktopUpdater';
import { requestNotificationPermission as requestAppNotificationPermission } from '../../../utils/notifications';

function EmailNotification() {
  const mx = useMatrixClient();
  const [result, refreshResult] = useEmailNotifications();

  const [setState, setEnable] = useAsyncCallback(
    useCallback(
      async (email: string, enable: boolean) => {
        if (enable) {
          await mx.setPusher({
            kind: 'email',
            app_id: 'm.email',
            pushkey: email,
            app_display_name: 'Email Notifications',
            device_display_name: email,
            lang: 'en',
            data: {
              brand: APP_DISPLAY_NAME,
            },
            append: true,
          });
          return;
        }
        await mx.setPusher({
          pushkey: email,
          app_id: 'm.email',
          kind: null,
        } as unknown as IPusherRequest);
      },
      [mx]
    )
  );

  const handleChange = (value: boolean) => {
    if (result && result.email) {
      setEnable(result.email, value).then(() => {
        refreshResult();
      });
    }
  };

  return (
    <SettingTile
      title={'\u90ae\u4ef6\u901a\u77e5'}
      description={
        <>
          {result && !result.email && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              {'\u5f53\u524d\u8d26\u53f7\u8fd8\u6ca1\u6709\u7ed1\u5b9a\u90ae\u7bb1\u3002'}
            </Text>
          )}
          {result && result.email && (
            <>
              {'\u5c06\u901a\u77e5\u53d1\u9001\u5230\u4f60\u7684\u90ae\u7bb1\u3002'} {`("${result.email}")`}
            </>
          )}
          {result === null && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              {'\u53d1\u751f\u4e86\u610f\u5916\u9519\u8bef\uff01'}
            </Text>
          )}
          {result === undefined && '\u5c06\u901a\u77e5\u53d1\u9001\u5230\u4f60\u7684\u90ae\u7bb1\u3002'}
        </>
      }
      after={
        <>
          {setState.status !== AsyncStatus.Loading &&
            typeof result === 'object' &&
            result?.email && <Switch value={result.enabled} onChange={handleChange} />}
          {(setState.status === AsyncStatus.Loading || result === undefined) && (
            <Spinner variant="Secondary" />
          )}
        </>
      }
    />
  );
}

export function SystemNotification() {
  const notifPermission = usePermissionState('notifications', getNotificationState());
  const [showNotifications, setShowNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [isNotificationSounds, setIsNotificationSounds] = useSetting(
    settingsAtom,
    'isNotificationSounds'
  );
  const desktopSupported = isDesktopUpdaterSupported();

  useEffect(() => {
    if (notifPermission !== 'granted' && showNotifications) {
      setShowNotifications(false);
    }
  }, [notifPermission, setShowNotifications, showNotifications]);

  const handleRequestNotificationPermission = async () => {
    const permission = await requestAppNotificationPermission();
    setShowNotifications(permission === 'granted');
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">{'\u7cfb\u7edf'}</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={'\u684c\u9762\u901a\u77e5'}
          description={
            notifPermission === 'denied' ? (
              <Text as="span" style={{ color: color.Critical.Main }} size="T200">
                {desktopSupported
                  ? '\u684c\u9762\u901a\u77e5\u6743\u9650\u5df2\u88ab\u7981\u7528\uff0c\u8bf7\u5728\u7cfb\u7edf\u901a\u77e5\u8bbe\u7f6e\u91cc\u5141\u8bb8\u661f\u706b\u684c\u9762\u7248\u53d1\u9001\u901a\u77e5\u3002'
                  : 'Notification' in window
                    ? '\u901a\u77e5\u6743\u9650\u5df2\u88ab\u7981\u7528\uff0c\u8bf7\u5728\u6d4f\u89c8\u5668\u5730\u5740\u680f\u6216\u7ad9\u70b9\u6743\u9650\u8bbe\u7f6e\u91cc\u5141\u8bb8\u901a\u77e5\u3002'
                    : '\u5f53\u524d\u7cfb\u7edf\u4e0d\u652f\u6301\u901a\u77e5\u529f\u80fd\u3002'}
              </Text>
            ) : (
              <span>
                {desktopSupported
                  ? '\u5f53\u6709\u65b0\u6d88\u606f\u5230\u8fbe\u65f6\uff0c\u663e\u793a\u684c\u9762\u901a\u77e5\u3002\u9996\u6b21\u542f\u7528\u65f6\u4f1a\u7531\u7cfb\u7edf\u5f39\u51fa\u901a\u77e5\u6743\u9650\u8bf7\u6c42\u3002'
                  : '\u5f53\u6709\u65b0\u6d88\u606f\u5230\u8fbe\u65f6\uff0c\u663e\u793a\u684c\u9762\u901a\u77e5\u3002\u9996\u6b21\u542f\u7528\u65f6\u6d4f\u89c8\u5668\u4f1a\u5f39\u51fa\u6743\u9650\u8bf7\u6c42\u3002'}
              </span>
            )
          }
          after={
            notifPermission === 'prompt' ? (
              <Button size="300" radii="300" onClick={handleRequestNotificationPermission}>
                <Text size="B300">{'\u542f\u7528'}</Text>
              </Button>
            ) : (
              <Switch
                disabled={notifPermission !== 'granted'}
                value={showNotifications}
                onChange={setShowNotifications}
              />
            )
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={'\u901a\u77e5\u58f0\u97f3'}
          description={'\u5f53\u6709\u65b0\u6d88\u606f\u5230\u8fbe\u65f6\u64ad\u653e\u63d0\u793a\u97f3\u3002'}
          after={<Switch value={isNotificationSounds} onChange={setIsNotificationSounds} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <EmailNotification />
      </SequenceCard>
    </Box>
  );
}
