import 'matrix-js-sdk/lib/@types/event';
import { IContent } from 'matrix-js-sdk/lib/models/event';

/**
 * Matrix allows applications to define custom account, state, and timeline event types.
 * The SDK lists only specification-owned events, so keep custom event keys open while retaining
 * the SDK's precise content types for every event it knows about.
 */
declare module 'matrix-js-sdk/lib/@types/event' {
  interface AccountDataEvents {
    [eventType: string]: unknown;
  }

  interface StateEvents {
    [eventType: string]: unknown;
  }

  interface TimelineEvents {
    [eventType: string]: IContent;
  }
}
