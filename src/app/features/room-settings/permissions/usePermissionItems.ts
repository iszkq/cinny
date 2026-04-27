import { useMemo } from 'react';
import { MessageEvent, StateEvent } from '../../../../types/matrix/room';
import { PermissionGroup } from '../../common-settings/permissions';

export const usePermissionGroups = (isCallRoom: boolean): PermissionGroup[] => {
  const groups: PermissionGroup[] = useMemo(() => {
    const messagesGroup: PermissionGroup = {
      name: '消息',
      items: [
        {
          location: {
            key: MessageEvent.RoomMessage,
          },
          name: '发送消息',
        },
        {
          location: {
            key: MessageEvent.Sticker,
          },
          name: '发送表情贴纸',
        },
        {
          location: {
            key: MessageEvent.Reaction,
          },
          name: '发送表情回应',
        },
        {
          location: {
            notification: true,
            key: 'room',
          },
          name: '提醒 @room',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomPinnedEvents,
          },
          name: '置顶消息',
        },
        {
          location: {},
          name: '其他消息事件',
        },
      ],
    };

    const callSettingsGroup: PermissionGroup = {
      name: '通话',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.GroupCallMemberPrefix,
          },
          name: '加入通话',
        },
      ],
    };

    const moderationGroup: PermissionGroup = {
      name: '管理',
      items: [
        {
          location: {
            action: true,
            key: 'invite',
          },
          name: '邀请',
        },
        {
          location: {
            action: true,
            key: 'kick',
          },
          name: '移出',
        },
        {
          location: {
            action: true,
            key: 'ban',
          },
          name: '封禁',
        },
        {
          location: {
            action: true,
            key: 'redact',
          },
          name: '删除他人消息',
        },
        {
          location: {
            key: MessageEvent.RoomRedaction,
          },
          name: '删除自己的消息',
        },
      ],
    };

    const roomOverviewGroup: PermissionGroup = {
      name: '房间概况',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.RoomAvatar,
          },
          name: '房间头像',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomName,
          },
          name: '房间名称',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomTopic,
          },
          name: '房间主题',
        },
      ],
    };

    const roomSettingsGroup: PermissionGroup = {
      name: '设置',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.RoomJoinRules,
          },
          name: '更改房间访问权限',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomCanonicalAlias,
          },
          name: '发布地址',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomPowerLevels,
          },
          name: '修改全部权限',
        },
        {
          location: {
            state: true,
            key: StateEvent.PowerLevelTags,
          },
          name: '编辑权限等级',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomEncryption,
          },
          name: '启用加密',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomHistoryVisibility,
          },
          name: '历史可见性',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomTombstone,
          },
          name: '升级房间',
        },
        {
          location: {
            state: true,
          },
          name: '其他设置',
        },
      ],
    };

    const otherSettingsGroup: PermissionGroup = {
      name: '其他',
      items: [
        {
          location: {
            state: true,
            key: StateEvent.PoniesRoomEmotes,
          },
          name: '管理表情与分类',
        },
        {
          location: {
            state: true,
            key: StateEvent.RoomServerAcl,
          },
          name: '修改服务器 ACL',
        },
        {
          location: {
            state: true,
            key: 'im.vector.modular.widgets',
          },
          name: '修改小组件',
        },
      ],
    };

    return [
      messagesGroup,
      ...(isCallRoom ? [callSettingsGroup] : []),
      moderationGroup,
      roomOverviewGroup,
      roomSettingsGroup,
      otherSettingsGroup,
    ];
  }, [isCallRoom]);

  return groups;
};
