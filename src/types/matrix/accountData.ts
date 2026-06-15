export enum AccountDataEvent {
  PushRules = 'm.push_rules',
  Direct = 'm.direct',
  IgnoredUserList = 'm.ignored_user_list',

  CinnySpaces = 'in.cinny.spaces',
  CinnyAccountPinPolicy = 'in.cinny.account_pin_policy',
  CinnyFavorites = 'in.cinny.favorites',
  CinnyFavoriteNotes = 'in.cinny.favorite_notes',
  CinnyExploreSources = 'in.cinny.explore_sources',
  CinnyAISettings = 'in.cinny.ai_settings',
  CinnyAppearanceSettings = 'in.cinny.appearance_settings',
  CinnyRoomNavCategories = 'in.cinny.room_nav_categories',
  CinnyUserEmojiPacks = 'in.cinny.user_emoji_packs',

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
  legacyRoomIds?: string[];
};

export type CinnyAccountPinPolicyContent = {
  version?: number;
  enabled?: boolean;
  updatedAt?: number;
  salt?: string;
  hash?: string;
  iterations?: number;
};

export type CinnyFavoriteNotesContent = {
  version?: number;
  updatedAt?: number;
  notes?: Record<string, string>;
};

export type CinnyExploreSourceKind = 'server' | 'web' | 'nav';
export type CinnyExploreWebOpenMode = 'auto' | 'external';
export type CinnyExploreWebEmbedStatus = 'unknown' | 'embeddable' | 'blocked';

export type CinnyExploreNavCard = {
  id: string;
  title: string;
  url: string;
  description?: string;
  iconUrl?: string;
  tags?: string[];
};

export type CinnyExploreNavSection = {
  id: string;
  title: string;
  cards: CinnyExploreNavCard[];
};

export type CinnyExploreSource = {
  id: string;
  kind: CinnyExploreSourceKind;
  title: string;
  value: string;
  createdAt: number;
  updatedAt: number;
  webOpenMode?: CinnyExploreWebOpenMode;
  webEmbedStatus?: CinnyExploreWebEmbedStatus;
  navSections?: CinnyExploreNavSection[];
};

export type CinnyExploreSourcesContent = {
  version?: number;
  updatedAt?: number;
  sources?: CinnyExploreSource[];
};

export type CinnyAISettingsSkillContent = {
  id?: string;
  name?: string;
  command?: string;
  model?: string;
  systemPrompt?: string;
  includeRoomContext?: boolean;
  maxEvents?: number;
};

export type CinnyAISettingsContent = {
  version?: number;
  updatedAt?: number;
  provider?: 'aihubmix';
  apiKey?: string;
  baseUrl?: string;
  modelsApiUrl?: string;
  skills?: CinnyAISettingsSkillContent[];
};

export type CinnyAppearanceSettingsContent = {
  version?: number;
  updatedAt?: number;
  themeId?: string;
  useSystemTheme?: boolean;
  lightThemeId?: string;
  darkThemeId?: string;
  interfaceStyle?: 'default' | 'frosted';
  accentColorId?: string;
  accentOpacity?: number;
  outgoingBubbleColorId?: string;
  outgoingBubbleOpacity?: number;
  incomingBubbleColorId?: string;
  incomingBubbleOpacity?: number;
  chatBackgroundMediaMxc?: string;
  monochromeMode?: boolean;
};

export type CinnyRoomNavCategoryContent = {
  id?: string;
  scope?: string;
  name?: string;
  roomIds?: string[];
};

export type CinnyRoomNavCategoriesContent = {
  version?: number;
  updatedAt?: number;
  favorites?: string[];
  categories?: CinnyRoomNavCategoryContent[];
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
