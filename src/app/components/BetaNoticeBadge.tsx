import React from 'react';
import { TooltipProvider, Tooltip, Box, Text, Badge, toRem } from 'folds';

export function BetaNoticeBadge() {
  return (
    <TooltipProvider
      position="Right"
      align="Center"
      tooltip={
        <Tooltip style={{ maxWidth: toRem(200) }}>
          <Box direction="Column">
            <Text size="L400">{'\u63d0\u793a'}</Text>
            <Text size="T200">
              {'\u8be5\u529f\u80fd\u4ecd\u5728\u6d4b\u8bd5\u4e2d\uff0c\u540e\u7eed\u53ef\u80fd\u7ee7\u7eed\u8c03\u6574\u3002'}
            </Text>
          </Box>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <Badge size="500" tabIndex={0} ref={triggerRef} variant="Primary" fill="Solid">
          <Text size="L400">{'\u6d4b\u8bd5\u4e2d'}</Text>
        </Badge>
      )}
    </TooltipProvider>
  );
}
