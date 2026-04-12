import { MatrixClient } from 'matrix-js-sdk';
import {
  AccountDataEvent,
  CinnyFavoriteNotesContent,
} from '../../../types/matrix/accountData';

export type FavoriteReference = {
  sourceRoomId: string;
  sourceEventId: string;
};

const FAVORITE_NOTES_VERSION = 1;

const trimFavoriteNote = (note?: string): string | undefined => {
  if (typeof note !== 'string') return undefined;

  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const getFavoriteReferenceId = (
  sourceRoomId: string,
  sourceEventId: string
): string => `${encodeURIComponent(sourceRoomId)}|${encodeURIComponent(sourceEventId)}`;

export const getFavoriteNotes = (
  content?: CinnyFavoriteNotesContent
): Record<string, string> => {
  if (!content?.notes || typeof content.notes !== 'object') {
    return {};
  }

  return Object.entries(content.notes).reduce<Record<string, string>>((notes, [key, value]) => {
    const trimmedValue = trimFavoriteNote(value);
    if (trimmedValue) {
      notes[key] = trimmedValue;
    }

    return notes;
  }, {});
};

export const getFavoriteNote = (
  content: CinnyFavoriteNotesContent | undefined,
  sourceRoomId: string,
  sourceEventId: string
): string | undefined => getFavoriteNotes(content)[getFavoriteReferenceId(sourceRoomId, sourceEventId)];

const getFavoriteNotesContent = (mx: MatrixClient): CinnyFavoriteNotesContent | undefined =>
  mx.getAccountData(AccountDataEvent.CinnyFavoriteNotes)?.getContent<CinnyFavoriteNotesContent>();

const writeFavoriteNotes = async (
  mx: MatrixClient,
  notes: Record<string, string>
): Promise<void> => {
  const content: CinnyFavoriteNotesContent = {
    version: FAVORITE_NOTES_VERSION,
    updatedAt: Date.now(),
    notes,
  };

  await mx.setAccountData(AccountDataEvent.CinnyFavoriteNotes, content);
};

export const setFavoriteNote = async (
  mx: MatrixClient,
  sourceRoomId: string,
  sourceEventId: string,
  note?: string
): Promise<void> => {
  const key = getFavoriteReferenceId(sourceRoomId, sourceEventId);
  const notes = {
    ...getFavoriteNotes(getFavoriteNotesContent(mx)),
  };

  const trimmedNote = trimFavoriteNote(note);
  if (trimmedNote) {
    notes[key] = trimmedNote;
  } else {
    delete notes[key];
  }

  await writeFavoriteNotes(mx, notes);
};

export const removeFavoriteNote = async (
  mx: MatrixClient,
  sourceRoomId: string,
  sourceEventId: string
): Promise<void> => {
  await setFavoriteNote(mx, sourceRoomId, sourceEventId, undefined);
};

export const removeFavoriteNotes = async (
  mx: MatrixClient,
  references: FavoriteReference[]
): Promise<void> => {
  if (references.length === 0) return;

  const notes = {
    ...getFavoriteNotes(getFavoriteNotesContent(mx)),
  };

  let changed = false;
  references.forEach(({ sourceRoomId, sourceEventId }) => {
    const key = getFavoriteReferenceId(sourceRoomId, sourceEventId);
    if (!(key in notes)) return;

    delete notes[key];
    changed = true;
  });

  if (!changed) return;

  await writeFavoriteNotes(mx, notes);
};
