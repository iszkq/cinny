import { MatrixClient, Method, UserEvent } from 'matrix-js-sdk';

const PROFILE_PROPAGATE_QUERY = 'org.matrix.msc4069.propagate';
const PROFILE_INHIBIT_PROPAGATION_FEATURE = 'org.matrix.msc4069';

/**
 * Update the global profile without copying the change into every joined room's
 * m.room.member state. Supporting homeservers therefore avoid creating a
 * visible "changed their avatar" membership event in other Matrix clients.
 */
export const setAvatarUrlWithoutRoomEvent = async (
  mx: MatrixClient,
  userId: string,
  avatarUrl: string
): Promise<void> => {
  const supportsSilentProfileUpdate = await mx.doesServerSupportUnstableFeature(
    PROFILE_INHIBIT_PROPAGATION_FEATURE
  );
  if (!supportsSilentProfileUpdate) {
    throw new Error(
      '当前 Matrix 服务器未启用静默头像更新（MSC4069），本次更新已取消，以免在其他客户端产生“更换头像”消息。'
    );
  }

  await mx.http.authedRequest(
    Method.Put,
    `/profile/${encodeURIComponent(userId)}/avatar_url`,
    { [PROFILE_PROPAGATE_QUERY]: false },
    { avatar_url: avatarUrl }
  );

  const user = mx.getUser(userId);
  if (user) {
    user.avatarUrl = avatarUrl;
    user.emit(UserEvent.AvatarUrl, user.events.presence, user);
  }
};
