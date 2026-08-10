import React, { useState } from 'react';
import { Badge, color, Icon, Icons, Text } from 'folds';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '../../../components/sidebar';
import { useDeviceIds, useDeviceList, useSplitCurrentDevice } from '../../../hooks/useDeviceList';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import * as css from './UnverifiedTab.css';
import {
  useDeviceVerificationStatus,
  useUnverifiedDeviceCount,
  VerificationStatus,
} from '../../../hooks/useDeviceVerificationStatus';
import { useCrossSigningActive } from '../../../hooks/useCrossSigning';
import { Modal500 } from '../../../components/Modal500';
import { Settings, SettingsPages } from '../../../features/settings';
import { useClientSyncReady } from '../../../hooks/useClientSyncReady';

type UnverifiedIndicatorProps = {
  requestOpenSettings?: () => void;
};

function UnverifiedIndicator({ requestOpenSettings }: UnverifiedIndicatorProps) {
  const mx = useMatrixClient();

  const crypto = mx.getCrypto();
  const securitySyncReady = useClientSyncReady(mx);
  const crossSigningActive = useCrossSigningActive();
  const [devices] = useDeviceList();

  const [currentDevice, otherDevices] = useSplitCurrentDevice(devices);
  const currentDeviceId = mx.getDeviceId() ?? currentDevice?.device_id;

  const verificationStatus = useDeviceVerificationStatus(
    crypto,
    mx.getSafeUserId(),
    currentDeviceId
  );
  const unverified =
    securitySyncReady &&
    (!crossSigningActive || verificationStatus === VerificationStatus.Unverified);

  const otherDevicesId = useDeviceIds(otherDevices);
  const unverifiedDeviceCount = useUnverifiedDeviceCount(
    crypto,
    mx.getSafeUserId(),
    otherDevicesId
  );

  const [settings, setSettings] = useState(false);
  const closeSettings = () => setSettings(false);

  const hasOtherUnverified =
    securitySyncReady &&
    crossSigningActive &&
    unverifiedDeviceCount !== undefined &&
    unverifiedDeviceCount > 0;
  const hasUnverified = unverified || hasOtherUnverified;
  let tooltip = `${unverifiedDeviceCount ?? 0} 台其他设备未验证`;
  if (!crossSigningActive) {
    tooltip = '设备验证尚未启用';
  } else if (unverified) {
    tooltip = '本机尚未验证';
  }
  return (
    <>
      {hasUnverified && (
        <SidebarItem active={settings} className={css.UnverifiedTab}>
          <SidebarItemTooltip tooltip={tooltip}>
            {(triggerRef) => (
              <SidebarAvatar
                className={unverified ? css.UnverifiedAvatar : css.UnverifiedOtherAvatar}
                as="button"
                ref={triggerRef}
                aria-label={tooltip}
                outlined
                onPointerDown={(evt: React.PointerEvent<HTMLButtonElement>) =>
                  evt.stopPropagation()
                }
                onPointerUp={(evt: React.PointerEvent<HTMLButtonElement>) => evt.stopPropagation()}
                onClick={(evt: React.MouseEvent<HTMLButtonElement>) => {
                  evt.preventDefault();
                  evt.stopPropagation();
                  if (requestOpenSettings) {
                    requestOpenSettings();
                    return;
                  }
                  setSettings(true);
                }}
              >
                <Icon
                  style={{ color: unverified ? color.Critical.Main : color.Warning.Main }}
                  src={Icons.ShieldUser}
                />
              </SidebarAvatar>
            )}
          </SidebarItemTooltip>
          {unverified && (
            <SidebarItemBadge>
              <Badge variant="Critical" size="200" fill="Solid" radii="Pill" outlined={false} />
            </SidebarItemBadge>
          )}
          {!unverified && hasOtherUnverified && (
            <SidebarItemBadge hasCount>
              <Badge variant="Warning" size="400" fill="Solid" radii="Pill" outlined={false}>
                <Text as="span" size="L400">
                  {unverifiedDeviceCount}
                </Text>
              </Badge>
            </SidebarItemBadge>
          )}
        </SidebarItem>
      )}
      {settings && (
        <Modal500 requestClose={closeSettings}>
          <Settings initialPage={SettingsPages.DevicesPage} requestClose={closeSettings} />
        </Modal500>
      )}
    </>
  );
}

type UnverifiedTabProps = {
  requestOpenSettings?: () => void;
};

export function UnverifiedTab({ requestOpenSettings }: UnverifiedTabProps) {
  return <UnverifiedIndicator requestOpenSettings={requestOpenSettings} />;
}
