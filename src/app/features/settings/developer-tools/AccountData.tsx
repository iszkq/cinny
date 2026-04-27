import React, { useCallback, useState } from 'react';
import { Box, Text, Icon, Icons, Button, MenuItem } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useAccountDataCallback } from '../../../hooks/useAccountDataCallback';
import { CutoutCard } from '../../../components/cutout-card';

type AccountDataProps = {
  expand: boolean;
  onExpandToggle: (expand: boolean) => void;
  onSelect: (type: string | null) => void;
};
export function AccountData({ expand, onExpandToggle, onSelect }: AccountDataProps) {
  const mx = useMatrixClient();
  const [accountDataTypes, setAccountDataKeys] = useState(() =>
    Array.from(mx.store.accountData.keys())
  );

  useAccountDataCallback(
    mx,
    useCallback(() => {
      setAccountDataKeys(Array.from(mx.store.accountData.keys()));
    }, [mx])
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">账号数据</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="全局"
          description="存储在全局账号数据中的内容。"
          after={
            <Button
              onClick={() => onExpandToggle(!expand)}
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              outlined
              before={
                <Icon src={expand ? Icons.ChevronTop : Icons.ChevronBottom} size="100" filled />
              }
            >
              <Text size="B300">{expand ? '收起' : '展开'}</Text>
            </Button>
          }
        />
        {expand && (
          <Box direction="Column" gap="100">
            <Box justifyContent="SpaceBetween">
              <Text size="L400">事件</Text>
              <Text size="L400">总数：{accountDataTypes.length}</Text>
            </Box>
            <CutoutCard>
              <MenuItem
                variant="Surface"
                fill="None"
                size="300"
                radii="0"
                before={<Icon size="50" src={Icons.Plus} />}
                onClick={() => onSelect(null)}
              >
                <Box grow="Yes">
                  <Text size="T200" truncate>
                    新增
                  </Text>
                </Box>
              </MenuItem>
              {accountDataTypes.sort().map((type) => (
                <MenuItem
                  key={type}
                  variant="Surface"
                  fill="None"
                  size="300"
                  radii="0"
                  after={<Icon size="50" src={Icons.ChevronRight} />}
                  onClick={() => onSelect(type)}
                >
                  <Box grow="Yes">
                    <Text size="T200" truncate>
                      {type}
                    </Text>
                  </Box>
                </MenuItem>
              ))}
            </CutoutCard>
          </Box>
        )}
      </SequenceCard>
    </Box>
  );
}
