import { Box, Icon, Icons, Text, as, color, config } from 'folds';
import React from 'react';

const warningStyle = { color: color.Warning.Main, opacity: config.opacity.P300 };
const criticalStyle = { color: color.Critical.Main, opacity: config.opacity.P300 };

export const MessageDeletedContent = as<'div', { children?: never; reason?: string }>(
  ({ reason, ...props }, ref) => (
    <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
      <Icon size="50" src={Icons.Delete} />
      {reason ? (
        <i>{'\u6b64\u6d88\u606f\u5df2\u88ab\u5220\u9664\u3002'} {reason}</i>
      ) : (
        <i>{'\u6b64\u6d88\u606f\u5df2\u88ab\u5220\u9664'}</i>
      )}
    </Box>
  )
);

export const MessageUnsupportedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={criticalStyle} {...props} ref={ref}>
    <Icon size="50" src={Icons.Warning} />
    <i>{'\u6682\u4e0d\u652f\u6301\u8be5\u6d88\u606f'}</i>
  </Box>
));

export const MessageFailedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={criticalStyle} {...props} ref={ref}>
    <Icon size="50" src={Icons.Warning} />
    <i>{'\u6d88\u606f\u52a0\u8f7d\u5931\u8d25'}</i>
  </Box>
));

export const MessageBadEncryptedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
    <Icon size="50" src={Icons.Lock} />
    <i>{'\u65e0\u6cd5\u89e3\u5bc6\u8be5\u6d88\u606f'}</i>
  </Box>
));

export const MessageNotDecryptedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
    <Icon size="50" src={Icons.Lock} />
    <i>{'\u8be5\u6d88\u606f\u5c1a\u672a\u5b8c\u6210\u89e3\u5bc6'}</i>
  </Box>
));

export const MessageBrokenContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={criticalStyle} {...props} ref={ref}>
    <Icon size="50" src={Icons.Warning} />
    <i>{'\u635f\u574f\u7684\u6d88\u606f'}</i>
  </Box>
));

export const MessageEmptyContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={criticalStyle} {...props} ref={ref}>
    <Icon size="50" src={Icons.Warning} />
    <i>{'\u7a7a\u6d88\u606f'}</i>
  </Box>
));

export const MessageEditedContent = as<'span', { children?: never }>(({ ...props }, ref) => (
  <Text as="span" size="T200" priority="300" {...props} ref={ref}>
    {'\uff08\u5df2\u7f16\u8f91\uff09'}
  </Text>
));
