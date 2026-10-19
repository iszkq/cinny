import React, { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { ClientEvent, Room, RoomEvent, SyncState } from 'matrix-js-sdk';
import { Link } from 'react-router-dom';
import { Icon, Icons } from 'folds';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSelectedRoom } from '../../hooks/router/useSelectedRoom';
import { useNavToActivePathMapper } from '../../hooks/useNavToActivePathMapper';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { mDirectAtom } from '../../state/mDirectList';
import { getCanonicalAliasOrRoomId } from '../../utils/matrix';
import { getDirectCreatePath, getDirectRoomPath, getHomeRoomPath, getSpaceLobbyPath, getSpaceRoomPath } from '../../pages/pathUtils';
import { RoomNavItem } from '../../features/room-nav/RoomNavItem';
import { CompactClientNavButton } from '../../pages/client/CompactClientNavButton';
import { useRoomName } from '../../hooks/useRoomMeta';
import { useSpace } from '../../hooks/useSpace';
import { useRecursiveChildScopeFactory, useSpaceChildren } from '../../state/hooks/roomList';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { useDirectRooms } from '../../pages/client/direct/useDirectRooms';
import { useRoomsNotificationPreferencesContext, getRoomNotificationMode } from '../../hooks/useRoomsNotificationPreferences';
import { useVirtualizerScrollMargin } from '../virtualizer';
import { useClientSyncReady } from '../../hooks/useClientSyncReady';
import './native-chat.css';

export const NATIVE_CHAT_EDITION = import.meta.env.VITE_ANDROID_APP === 'true' || import.meta.env.VITE_IOS_APP === 'true';
function NativeChatList({title,roomIds,scope,space}: {title:string;roomIds:string[];scope:string;space?:Room}) {
  const mx = useMatrixClient();
  useNavToActivePathMapper(scope);
  const selectedRoom = useSelectedRoom();
  const direct = useAtomValue(mDirectAtom);
  const unread = useAtomValue(roomToUnreadAtom);
  const ready = useClientSyncReady(mx);
  const [slowSync, setSlowSync] = useState(false);
  useEffect(() => {
    if (ready) { setSlowSync(false); return undefined; }
    const timer = window.setTimeout(() => setSlowSync(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [ready]);
  const connectionFailed = mx.getSyncState() === SyncState.Error || mx.getSyncState() === SyncState.Reconnecting;
  const preferences = useRoomsNotificationPreferencesContext();
  const [query,setQuery] = useState('');
  const [onlyUnread,setOnlyUnread] = useState(false);
  const [,setRevision] = useState(0);
  useEffect(() => {
    let timer: number | undefined;
    const changed = () => {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {timer=undefined;setRevision(value=>value+1);},250);
    };
    mx.on(RoomEvent.Timeline,changed);
    mx.on(RoomEvent.Name,changed);
    mx.on(ClientEvent.Room,changed);
    mx.on(RoomEvent.MyMembership,changed);
    mx.on(ClientEvent.Sync,changed);
    return () => { mx.removeListener(RoomEvent.Timeline,changed);mx.removeListener(RoomEvent.Name,changed);mx.removeListener(ClientEvent.Room,changed);mx.removeListener(RoomEvent.MyMembership,changed);mx.removeListener(ClientEvent.Sync,changed);clearTimeout(timer); };
  },[mx]);
  // During store hydration, SDK rooms can arrive before the batched navigation atom.
  const ids = scope === 'home' ? [...new Set([...roomIds,...mx.getRooms().filter(room=>room.getMyMembership()==='join').map(room=>room.roomId)])] : roomIds;
  const rooms = ids.map(id=>mx.getRoom(id)).filter((room):room is Room => !!room && !room.isSpaceRoom())
    .filter(room=>(!onlyUnread || unread.has(room.roomId)) && (!query || room.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
    .sort((a,b)=>b.getLastActiveTimestamp()-a.getLastActiveTimestamp());
  const scroll = useRef<HTMLDivElement>(null);
  const {scrollMargin,virtualListRef} = useVirtualizerScrollMargin<HTMLDivElement>(scroll);
  const virtual = useVirtualizer({count:rooms.length,getScrollElement:()=>scroll.current,estimateSize:()=>88,overscan:8,scrollMargin,initialRect:{width:window.innerWidth,height:window.innerHeight}});
  useEffect(()=>{
    const measure=()=>requestAnimationFrame(()=>virtual.measure());
    window.addEventListener('calculator-native-resume',measure);
    document.addEventListener('visibilitychange',measure);
    return ()=>{window.removeEventListener('calculator-native-resume',measure);document.removeEventListener('visibilitychange',measure);};
  },[virtual]);
  const spaceKey = space && getCanonicalAliasOrRoomId(mx,space.roomId);
  const link = (room:Room) => spaceKey ? getSpaceRoomPath(spaceKey,getCanonicalAliasOrRoomId(mx,room.roomId))
    : direct.has(room.roomId) ? getDirectRoomPath(getCanonicalAliasOrRoomId(mx,room.roomId)) : getHomeRoomPath(getCanonicalAliasOrRoomId(mx,room.roomId));
  return <section className="native-chat-list" data-native-chat-list>
    <div ref={scroll} className="native-chat-scroll">
    <header className="native-chat-heading"><h1>{title}</h1>
      <div className="native-chat-search"><Icon src={Icons.Search} size="400" /><input type="search" aria-label="搜索聊天" placeholder="搜索" value={query} onChange={event=>setQuery(event.target.value)} /></div>
      <div className="native-chat-filters"><button type="button" aria-pressed={!onlyUnread} onClick={()=>setOnlyUnread(false)}>全部</button><button type="button" aria-pressed={onlyUnread} onClick={()=>setOnlyUnread(true)}>未读</button>
      {spaceKey && <Link to={getSpaceLobbyPath(spaceKey)}>大厅</Link>}</div>
    </header>
    <div role="list" aria-label={`${title}聊天列表`}>
      {rooms.length===0 && <p className="native-chat-empty">{query?'没有找到匹配的聊天':!ready?(slowSync || connectionFailed ? '连接暂时不可用，正在重试，聊天数据不会清除。' : '正在同步聊天…'):onlyUnread?'没有未读消息':'暂无聊天'}</p>}
      {rooms.length===0 && !ready && (slowSync || connectionFailed) && <button type="button" style={{minHeight:48,fontSize:18,margin:16}} onClick={()=>mx.retryImmediately()}>重试连接</button>}
      <div ref={virtualListRef} style={{height:virtual.getTotalSize(),position:'relative',width:'100%'}}>
        {virtual.getVirtualItems().map(item=>{const room=rooms[item.index];return <div key={room.roomId} ref={virtual.measureElement} data-index={item.index} role="listitem" style={{position:'absolute',top:0,left:0,width:'100%',transform:`translateY(${item.start-scrollMargin}px)`}}>
          <RoomNavItem room={room} selected={selectedRoom===room.roomId} showAvatar direct={direct.has(room.roomId)} categoryScope={scope} linkPath={link(room)} notificationMode={getRoomNotificationMode(preferences,room.roomId)} />
        </div>;})}
      </div>
    </div>
    </div>
    <footer className="native-chat-footer"><div><CompactClientNavButton /><span>空间</span></div><Link to={getDirectCreatePath()} aria-label="发起聊天"><Icon src={Icons.Pencil} size="400" /><span>发起聊天</span></Link></footer>
  </section>;
}
export function NativeHomeChats() {
  const rooms = useAtomValue(allRoomsAtom);
  return <NativeChatList title="所有聊天" roomIds={rooms} scope="home" />;
}
export function NativeDirectChats() {
  const rooms = useDirectRooms();
  return <NativeChatList title="私聊消息" roomIds={rooms} scope="direct" />;
}
export function NativeSpaceChats() {
  const mx=useMatrixClient(); const space=useSpace(); const name=useRoomName(space);
  const parents=useAtomValue(roomToParentsAtom);
  const rooms=useSpaceChildren(allRoomsAtom,space.roomId,useRecursiveChildScopeFactory(mx,parents));
  return <NativeChatList title={name} roomIds={rooms} scope={space.roomId} space={space} />;
}
