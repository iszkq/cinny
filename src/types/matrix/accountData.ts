export enum AccountDataEvent {
  PushRules = 'm.push_rules',
  Direct = 'm.direct',
  IgnoredUserList = 'm.ignored_user_list',

  CinnySpaces = 'in.cinny.spaces',
  CinnyFavorites = 'in.cinny.favorites',
  CinnyFavoriteNotes = 'in.cinny.favorite_notes',
  CinnyExploreSources = 'in.cinny.explore_sources',

  ElementRecentEmoji = 'io.element.recent_emoji',

  PoniesUserEmotes = 'im.ponies.user_emotes',
  PoniesEmoteRooms = 'im.ponies.emote_rooms',

  SecretStorageDefaultKey = 'm.secret_storage.default_key',

  CrossSigningMaster = 'm.cross_signing.master',
  CrossSigningSelf = 'm.cross_signing.self',
  CrossSigningUser = 'm.cross_signing.user',
  MegolmBackupV1 = 'm.megolm_backup.v1',
}

export type MDirectContent = Record<string, string[]>;

export type CinnyFavoritesContent = {
  roomId?: string;
  createdAt?: number;
  version?: number;
};

export type CinnyFavoriteNotesContent = {
  version?: number;
  updatedAt?: number;
  notes?: Record<string, string>;
};

export type CinnyExploreSourceKind = 'server' | 'web';

export type CinnyExploreSource = {
  id: string;
  kind: CinnyExploreSourceKind;
  title: string;
  value: string;
  createdAt: number;
  updatedAt: number;
};

export type CinnyExploreSourcesContent = {
  version?: number;
  updatedAt?: number;
  sources?: CinnyExploreSource[];
};

export type SecretStorageDefaultKeyContent = {
  key: string;
};

export type SecretStoragePassphraseContent = {
  algorithm: string;
  salt: string;
  iterations: number;
  bits?: number;
};

export type SecretStorageKeyContent = {
  name?: string;
  algorithm: string;
  iv?: string;
  mac?: string;
  passphrase?: SecretStoragePassphraseContent;
};

export type SecretContent = {
  iv: string;
  ciphertext: string;
  mac: string;
};

export type SecretAccountData = {
  encrypted: Record<string, SecretContent>;
};
