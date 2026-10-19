import { useEffect, useState } from 'react';
import { MatrixEvent, MatrixEventEvent, Room, RoomEvent } from 'matrix-js-sdk';
import { previewText, previewTime } from './preview';
export function useRoomPreview(room: Room, enabled: boolean) {
  const [, refresh] = useState(0);
  const events = enabled ? room.getLiveTimeline().getEvents() : [];
  let latest: MatrixEvent | undefined;
  for (let index=events.length-1;index>=0;index-=1) {
    const event=events[index];
    if (['m.room.message','m.room.encrypted','m.sticker','m.poll.start','org.matrix.msc3381.poll.start'].includes(event.getType()) && !event.isRelation('m.replace')) {
      latest=event;
      break;
    }
  }
  useEffect(() => {
    if (!enabled) return undefined;
    const update = () => refresh(value => value+1);
    room.on(RoomEvent.Timeline,update);
    room.on(RoomEvent.Redaction,update);
    latest?.on(MatrixEventEvent.Decrypted,update);
    latest?.on(MatrixEventEvent.Replaced,update);
    return () => {
      room.removeListener(RoomEvent.Timeline,update);
      room.removeListener(RoomEvent.Redaction,update);
      latest?.removeListener(MatrixEventEvent.Decrypted,update);
      latest?.removeListener(MatrixEventEvent.Replaced,update);
    };
  },[room,latest,enabled]);
  if (!latest) return {text:'暂无消息',time:''};
  const body = previewText(latest.getType(),latest.getContent(),latest.isRedacted());
  const sender = latest.getSender();
  const name = sender ? room.getMember(sender)?.name ?? sender.split(':')[0].replace(/^@/,'') : '';
  return {text:body && name ? `${name}: ${body}` : body || '暂无消息',time:previewTime(latest.getTs())};
}
