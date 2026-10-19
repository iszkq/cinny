import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { matrixQrBytes, verificationFailure } from './methods';

export function VerificationQrCode({bytes}: {bytes:Uint8ClampedArray}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!canvas.current)return;
    // Byte mode is essential: string conversion corrupts non-ASCII key bytes.
    QRCode.toCanvas(canvas.current,[{data:new Uint8Array(bytes),mode:'byte'}],{width:280,margin:4,errorCorrectionLevel:'M'})
      .catch(reason=>setError(verificationFailure(reason)));
  },[bytes]);
  return <div style={{textAlign:'center'}}>{error?<p role="alert">{error}</p>:<canvas ref={canvas} aria-label="本次设备验证二维码" role="img" style={{width:'100%',maxWidth:280,height:'auto',background:'#fff'}}/>}<p>请用另一台已验证设备的验证页面扫描。不要将此二维码发给其他人。</p></div>;
}

type ScannerProps={onScan:(bytes:Uint8ClampedArray)=>Promise<void>;onClose:()=>void};
export function VerificationQrScanner({onScan,onClose}:ScannerProps) {
  const video=useRef<HTMLVideoElement>(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [reading,setReading]=useState(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const scanning=useRef(false);
  const stop=useRef<()=>void>(()=>undefined);
  const accept=async(bytes:ArrayLike<number>)=>{
    if(!mounted.current || scanning.current)return;
    scanning.current=true;stop.current();setReading(true);setError('');
    try { await onScan(matrixQrBytes(bytes)); }
    catch(reason){if(mounted.current)setError(verificationFailure(reason));}
    finally {if(mounted.current)setReading(false);scanning.current=false;}
  };
  const acceptRef=useRef(accept);acceptRef.current=accept;
  useEffect(()=>{
    let disposed=false;let media:MediaStream|undefined;let timer:number|undefined;
    const release=()=>{disposed=true;clearTimeout(timer);media?.getTracks().forEach(track=>track.stop());if(video.current)video.current.srcObject=null;};
    stop.current=release;
    const pause=()=>{release();if(mounted.current)setError('扫描已暂停。回到页面后点击“重新扫描”，或改用表情／数字对比。');};
    const visibility=()=>{if(document.hidden)pause();};
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('calculator-native-background',pause);
    const canvas=document.createElement('canvas');
    const context=canvas.getContext('2d',{willReadFrequently:true});
    const tick=()=>{
      if(disposed)return;
      const element=video.current;
      if(context && element && element.readyState>=2 && element.videoWidth){
        const scale=Math.min(1,720/element.videoWidth);canvas.width=element.videoWidth*scale;canvas.height=element.videoHeight*scale;
        context.drawImage(element,0,0,canvas.width,canvas.height);
        const pixels=context.getImageData(0,0,canvas.width,canvas.height);
        const result=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});
        if(result){void acceptRef.current(result.binaryData);return;}
      }
      timer=window.setTimeout(tick,160);
    };
    const start=async()=>{
      setError('');
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前系统无法打开相机，请出示二维码或改用表情／数字对比。');
        media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:720}}});
        if(disposed){media.getTracks().forEach(track=>track.stop());return;}
        if(!video.current){release();return;}
        video.current.srcObject=media;await video.current.play();tick();
      }catch(reason){release();if(mounted.current)setError(verificationFailure(reason));}
    };
    void start();
    return()=>{release();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('calculator-native-background',pause);};
  },[attempt]);
  const file=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const selected=event.target.files?.[0];event.target.value='';if(!selected)return;
    stop.current();setError('');
    if(selected.size>12*1024*1024){setError('图片太大，请选择小于 12 MB 的二维码图片。');return;}
    const url=URL.createObjectURL(selected);
    try{
      const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,1800/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');canvas.width=image.width*scale;canvas.height=image.height*scale;
      const context=canvas.getContext('2d');if(!context)throw new Error('无法读取图片。');
      context.drawImage(image,0,0,canvas.width,canvas.height);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);
      const result=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});
      if(!result)throw new Error('没有识别到二维码，请选择另一台设备验证页面的清晰截图。');
      if(mounted.current)await accept(result.binaryData);
    }catch(reason){if(mounted.current)setError(verificationFailure(reason));}
    finally{URL.revokeObjectURL(url);}
  };
  return <div className="verification-methods"><p>将相机对准另一台已验证设备上的验证二维码。</p><video ref={video} autoPlay muted playsInline aria-label="扫描验证二维码" style={{width:'100%',maxHeight:260,objectFit:'cover',background:'#15191c',borderRadius:12}}/>
    {reading&&<p role="status">正在核对二维码，请等待另一台设备确认…</p>}{error&&<p role="alert">{error}</p>}
    {error&&<button type="button" onClick={()=>setAttempt(value=>value+1)}>重新扫描</button>}
    <label className="verification-file">从图片读取二维码<input type="file" accept="image/*" disabled={reading} onChange={file}/></label>
    <button type="button" onClick={()=>{stop.current();onClose();}}>返回验证方式</button>
  </div>;
}
