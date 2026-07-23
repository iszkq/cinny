import React, { useState } from 'react';
import { Box, Button, Spinner, Text } from 'folds';
import { APP_VERSION } from '../../../constants/branding';
import { AndroidUpdatePrompt } from '../../../components/AndroidUpdatePrompt';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { checkForAndroidUpdate, type PendingAndroidUpdate } from '../../../utils/androidUpdater';
import { isAndroidApp } from '../../../utils/nativePlatform';
import { SequenceCardStyle } from '../styles.css';

export function AndroidUpdater() {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('启动后会自动检查，也可以随时手动检查。');
  const [pendingUpdate, setPendingUpdate] = useState<PendingAndroidUpdate>();

  if (!isAndroidApp()) return null;

  const handleCheck = () => {
    if (checking) return;

    setChecking(true);
    setMessage('正在检查 GitHub 最新正式版本...');
    checkForAndroidUpdate()
      .then((update) => {
        if (update) {
          setPendingUpdate(update);
          setMessage(`发现新版本 v${update.version}。`);
          return;
        }
        setMessage('当前已经是最新正式版本。');
      })
      .catch(() => {
        setMessage('检查更新失败，请确认网络连接后重试。');
      })
      .finally(() => {
        setChecking(false);
      });
  };

  return (
    <>
      <Box direction="Column" gap="100">
        <Text size="L400">Android 更新</Text>
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <SettingTile title="当前版本" description={`v${APP_VERSION}`} />
          <SettingTile
            title="检查正式版更新"
            description={message}
            after={
              <Button
                variant="Secondary"
                fill="Soft"
                size="300"
                radii="300"
                onClick={handleCheck}
                disabled={checking}
                before={checking ? <Spinner size="100" variant="Secondary" /> : undefined}
              >
                <Text size="B300">{checking ? '检查中...' : '检查更新'}</Text>
              </Button>
            }
          />
        </SequenceCard>
      </Box>
      <AndroidUpdatePrompt
        update={pendingUpdate}
        requestClose={() => setPendingUpdate(undefined)}
      />
    </>
  );
}
