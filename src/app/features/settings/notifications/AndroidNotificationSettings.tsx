import React, { useEffect, useState } from 'react';
import { Box, Button, Text, Switch, Modal, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { usePermissionState } from '../../../hooks/usePermission';
import {
  getNativeNotificationPermission,
  requestNativeNotificationPermission,
  openNativeNotificationSettings,
  showNativeNotification,
} from '../../../utils/nativeNotifications';
import {
  hasAndroidNotificationChoice,
  saveAndroidNotificationChoice,
} from '../../../utils/androidNotificationChoice';
import { isAndroidApp } from '../../../utils/nativePlatform';
import { SettingTile } from '../../../components/setting-tile';

export function AndroidNotificationPrompt() {
  const [, setEnabled] = useSetting(settingsAtom, 'showNotifications');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!isAndroidApp() || hasAndroidNotificationChoice()) return undefined;
    const reveal = () => {
      if (
        !hasAndroidNotificationChoice() &&
        !document.hidden &&
        document.documentElement.dataset.calculatorLocked !== 'true'
      )
        setOpen(true);
    };
    reveal();
    const observer = new MutationObserver(reveal);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-calculator-locked'],
    });
    document.addEventListener('visibilitychange', reveal);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', reveal);
    };
  }, []);
  const choose = async (enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const granted = enabled && (await requestNativeNotificationPermission()) === 'granted';
      setEnabled(granted);
      saveAndroidNotificationChoice(granted);
      setOpen(false);
    } catch {
      setStatus('暂时无法申请权限，请重试，或稍后在设置 → 通知中开启。');
    } finally {
      setBusy(false);
    }
  };
  if (!open) return null;
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <Modal size="300">
          <Box
            direction="Column"
            gap="400"
            style={{ padding: 20, maxHeight: '80dvh', overflowY: 'auto' }}
          >
            <Text as="h2" size="H4">
              是否开启消息通知？
            </Text>
            <Text>
              允许后，应用接收到新消息时可以显示手机通知。你可以随时在“设置 → 通知”中关闭。
            </Text>
            <Text size="T200">
              后台推送尚未配置；应用被系统挂起或关闭后，目前不能保证收到通知。
            </Text>
            <Button disabled={busy} onClick={() => choose(true)}>
              <Text>{busy ? '处理中…' : '开启通知'}</Text>
            </Button>
            <Button disabled={busy} onClick={() => choose(false)}>
              <Text>暂不开启</Text>
            </Button>
            <Text role="status">{status}</Text>
          </Box>
        </Modal>
      </OverlayCenter>
    </Overlay>
  );
}

export function AndroidNotificationSettings() {
  const permission = usePermissionState('notifications', 'prompt');
  const [enabled, setEnabled] = useSetting(settingsAtom, 'showNotifications');
  const [sound, setSound] = useSetting(settingsAtom, 'isNotificationSounds');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const change = async (value: boolean) => {
    if (!value) {
      setEnabled(false);
      saveAndroidNotificationChoice(false);
      setStatus('消息通知已关闭。');
      return;
    }
    setBusy(true);
    try {
      const current = await getNativeNotificationPermission();
      const granted =
        (current === 'granted' ? current : await requestNativeNotificationPermission()) ===
        'granted';
      setEnabled(granted);
      saveAndroidNotificationChoice(granted);
      setStatus(granted ? '消息通知已开启。' : '系统尚未允许通知，请点击“打开系统通知设置”开启。');
    } catch {
      setStatus('申请通知权限失败，请重试。');
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    try {
      await showNativeNotification({
        title: '计算器',
        body: '这是一条本机测试通知。',
        silent: !sound,
      });
      setStatus('测试通知已提交系统，请下拉通知栏查看。本机测试不代表后台推送已接通。');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : '通知未发出，请检查系统通知权限和通知类别。'
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box direction="Column" gap="400">
      <Text size="L400">安卓消息通知</Text>
      <SettingTile
        title="开启消息通知"
        description={
          permission === 'granted' ? '系统通知权限已允许。' : '系统通知尚未授权，或已在系统中关闭。'
        }
        after={
          <Switch
            aria-label="开启消息通知"
            disabled={busy}
            value={enabled && permission === 'granted'}
            onChange={change}
          />
        }
      />
      <SettingTile
        title="通知声音"
        after={<Switch aria-label="通知声音" value={sound} onChange={setSound} />}
      />
      <Button
        disabled={busy}
        onClick={() =>
          openNativeNotificationSettings().catch(() =>
            setStatus('无法打开系统设置，请手动进入手机设置 → 应用 → 计算器 → 通知。')
          )
        }
      >
        <Text>打开系统通知设置</Text>
      </Button>
      <Button disabled={busy || !enabled || permission !== 'granted'} onClick={test}>
        <Text>发送测试通知</Text>
      </Button>
      <Text role="status">{status}</Text>
      <Box direction="Column" gap="200">
        <Text size="L400">后台推送：尚未配置</Text>
        <Text>
          当前通知依赖应用正在接收消息。手机系统挂起、清理或关闭应用后，通知可能中断。需要配置推送项目与
          Matrix 推送网关，才能接通后台消息提醒。
        </Text>
      </Box>
    </Box>
  );
}
