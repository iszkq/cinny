import {registerPlugin} from '@capacitor/core';
const native=registerPlugin<{saveState:(options:{state:string})=>Promise<void>;acknowledgeResume:(options:{token:string})=>Promise<void>}>('CalculatorLifecycleBridge');
const KEY='calculator-android-session-v2';
export type AndroidCalculatorSession={locked:boolean;lastSeen:number;awayAt?:number;delaySeconds:number;instanceId?:string};
type Lifecycle={awayAt?:number;resumedAt?:number;foreground?:boolean;resumeToken?:string;state?:string|null;instanceId?:string};
type NativeLifecycle={read:()=>string};
const bridge=():NativeLifecycle|undefined=>(window as Window & {CalculatorLifecycle?:NativeLifecycle}).CalculatorLifecycle;
export function readAndroidLifecycle():Lifecycle {
  try{return JSON.parse(bridge()?.read()??'{}') as Lifecycle;}catch{return {};}
}
export function saveAndroidSession(state:AndroidCalculatorSession):void {
  const serialized=JSON.stringify(state);
  try{localStorage.setItem(KEY,serialized);}catch{/* Native copy remains available. */}
  try{if(bridge())void native.saveState({state:serialized}).catch(()=>undefined);}catch{/* Browser storage remains available. */}
}
export function acknowledgeAndroidResume():void {
  try{if(bridge())void native.acknowledgeResume({token:readAndroidLifecycle().resumeToken??''}).catch(()=>undefined);}catch{/* Browser-only environment. */}
}
export function resolveAndroidSession(state:AndroidCalculatorSession|undefined,delaySeconds:number,now:number,navigation:string,lifecycle:Lifecycle={}):AndroidCalculatorSession {
  if(!state || typeof state.locked!=='boolean' || !Number.isFinite(state.lastSeen))state={locked:false,lastSeen:now,delaySeconds,instanceId:lifecycle.instanceId};
  if(state.locked)return {...state,delaySeconds,instanceId:lifecycle.instanceId??state.instanceId};
  const nativeAway=Number.isFinite(lifecycle.awayAt)&&Number(lifecycle.awayAt)>0?lifecycle.awayAt:undefined;
  const awayAt=nativeAway??state.awayAt??(navigation!=='reload' && lifecycle.instanceId && lifecycle.instanceId!==state.instanceId?state.lastSeen:undefined);
  const returnedAt=lifecycle.foreground && lifecycle.resumedAt && lifecycle.resumedAt>=(awayAt??0)?Math.min(now,lifecycle.resumedAt):now;
  const expired=awayAt!==undefined && Number.isFinite(awayAt) && returnedAt-awayAt>=delaySeconds*1000;
  return {locked:expired,lastSeen:now,delaySeconds,instanceId:lifecycle.instanceId??state.instanceId,...(lifecycle.foreground===false&&awayAt!==undefined?{awayAt}:{})};
}
export function restoreAndroidSession(delaySeconds:number|undefined,navigation:string,now=Date.now()):AndroidCalculatorSession {
  const lifecycle=readAndroidLifecycle();let state:AndroidCalculatorSession|undefined;
  try{state=JSON.parse(lifecycle.state??'null') as AndroidCalculatorSession|undefined;}catch{/* Native record unavailable. */}
  try{
    const local=JSON.parse(localStorage.getItem(KEY)??'null') as AndroidCalculatorSession|undefined;
    if(local && (!state || local.lastSeen>=state.lastSeen))state=local;
  }catch{/* Device-local fallback unavailable. */}
  const delay=delaySeconds??(state && [0,30,60,300].includes(state.delaySeconds)?state.delaySeconds:30);
  return resolveAndroidSession(state,delay,now,navigation,lifecycle);
}
