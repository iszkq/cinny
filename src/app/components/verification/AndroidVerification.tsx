import React, {useEffect,useRef,useState} from 'react';
import {ShowQrCodeCallbacks,VerificationRequest,Verifier,VerifierEvent} from 'matrix-js-sdk/lib/crypto-api';
import {VerificationMethod} from 'matrix-js-sdk/lib/types';
import {VerificationQrCode,VerificationQrScanner} from './VerificationQr';
import {verificationFailure} from './methods';
import './verification.css';
export function AndroidVerificationMethods({request}:{request:VerificationRequest}) {
  const [view,setView]=useState<'choose'|'show'|'scan'>('choose');
  const [bytes,setBytes]=useState<Uint8ClampedArray>();
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const perform=async(action:()=>Promise<unknown>)=>{
    setError('');setBusy(true);try{await action();}catch(reason){if(alive.current)setError(verificationFailure(reason));}finally{if(alive.current)setBusy(false);}
  };
  const show=request.otherPartySupportsMethod(VerificationMethod.ScanQrCode);
  const scan=request.otherPartySupportsMethod(VerificationMethod.ShowQrCode);
  // RustVerificationRequest.methods is an unimplemented legacy getter.
  const sas=request.otherPartySupportsMethod(VerificationMethod.Sas);
  return <div className="verification-methods">
    <p>请选择验证方式。另一台设备需要已登录同一账号，并保持验证页面打开。</p>
    {view==='choose'&&<>
      {scan&&<button type="button" disabled={busy} onClick={()=>setView('scan')}>扫描另一台设备的二维码</button>}
      {show&&<button type="button" disabled={busy} onClick={()=>void perform(async()=>{const data=await request.generateQRCode();if(!data)throw new Error('对方当前无法扫描二维码，请改用表情／数字对比。');if(alive.current){setBytes(data);setView('show');}})}>出示我的验证二维码</button>}
      {sas&&<button type="button" disabled={busy} onClick={()=>void perform(()=>request.startVerification(VerificationMethod.Sas))}>表情符号／数字对比</button>}
      {!show&&!scan&&!sas&&<p role="alert">两台设备没有共同支持的验证方式，请更新另一台设备的客户端，或使用恢复密钥。</p>}
    </>}
    {view==='show'&&bytes&&<><VerificationQrCode bytes={bytes}/><button type="button" onClick={()=>setView('choose')}>更换验证方式</button></>}
    {view==='scan'&&<VerificationQrScanner onScan={async data=>{await request.scanQRCode(data);}} onClose={()=>setView('choose')}/>}
    {busy&&<p role="status">正在连接另一台设备…</p>}{error&&<p role="alert">{error}</p>}
  </div>;
}
export function AndroidQrVerification({verifier}:{verifier:Verifier}) {
  const [confirmation,setConfirmation]=useState<ShowQrCodeCallbacks|null>(()=>verifier.getReciprocateQrCodeCallbacks());
  const [error,setError]=useState('');const [confirmed,setConfirmed]=useState(false);
  useEffect(()=>{
    let alive=true;
    const show=(callbacks:ShowQrCodeCallbacks)=>setConfirmation(callbacks);
    verifier.on(VerifierEvent.ShowReciprocateQr,show);
    setConfirmation(verifier.getReciprocateQrCodeCallbacks());
    verifier.verify().catch(reason=>{if(alive)setError(verificationFailure(reason));});
    return()=>{alive=false;verifier.removeListener(VerifierEvent.ShowReciprocateQr,show);};
  },[verifier]);
  return <div className="verification-methods">{confirmation?<><p>另一台设备已经扫描了二维码。请确认这是你刚才操作的设备。</p><button type="button" disabled={confirmed} onClick={()=>{try{confirmation.confirm();setConfirmed(true);}catch(reason){setError(verificationFailure(reason));}}}>{confirmed?'已确认，等待验证完成…':'是我操作的设备，确认'}</button><button type="button" disabled={confirmed} onClick={()=>confirmation.cancel()}>不是我的操作，取消验证</button></>:<p role="status">二维码已核对，请在另一台设备上确认。正在等待验证完成…</p>}{error&&<p role="alert">{error}</p>}</div>;
}
