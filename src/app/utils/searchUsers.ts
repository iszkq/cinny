import type { MatrixClient } from 'matrix-js-sdk';

export type SearchUser = { user_id: string; display_name?: string; avatar_url?: string };

/** Merge known contacts with the server directory and an exact federated profile lookup. */
export async function searchUsers(
  mx: MatrixClient,
  query: string,
  limit = 50
): Promise<SearchUser[]> {
  const term = query.trim();
  if (!term) return [];
  const needle = term.replace(/^@/, '').toLowerCase();
  const known: SearchUser[] = mx
    .getUsers()
    .filter((user) => `${user.userId} ${user.displayName ?? ''}`.toLowerCase().includes(needle))
    .map((user) => ({
      user_id: user.userId,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
    }));
  const exactId = /^@?[^\s:]+:[^\s]+$/.test(term)
    ? term.startsWith('@')
      ? term
      : `@${term}`
    : undefined;
  const requests: Promise<SearchUser[]>[] = [
    mx.searchUserDirectory({ term: term.replace(/^@/, ''), limit }).then(({ results }) => results),
  ];
  if (exactId)
    requests.push(
      mx.getProfileInfo(exactId).then((profile) => [
        {
          user_id: exactId,
          display_name: profile.displayname,
          avatar_url: profile.avatar_url,
        },
      ])
    );
  const settled = await Promise.allSettled(requests);
  const results = new Map(known.map((user) => [user.user_id, user]));
  settled.forEach((result) => {
    if (result.status === 'fulfilled')
      result.value.forEach((user) => results.set(user.user_id, user));
  });
  if (!results.size && settled.every((result) => result.status === 'rejected')) {
    throw new Error('用户搜索暂时不可用，请检查网络后重试，或输入完整用户 ID 发起聊天。');
  }
  return [...results.values()]
    .sort((a, b) => Number(b.user_id === exactId) - Number(a.user_id === exactId))
    .slice(0, limit);
}
