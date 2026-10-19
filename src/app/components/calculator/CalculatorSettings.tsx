import { getAndroidLockDiagnostics } from '../../../client/androidDiagnostics';
import { isAndroidApp } from '../../utils/nativePlatform';
import React, { useState } from 'react';
import {
  BACKGROUND_DELAYS, IDLE_DELAYS, CalculatorConfig, createCalculatorPin,
  readCalculatorConfig, saveCalculatorConfig, verifyCalculatorCode,
} from './lock';

export function CalculatorSettings({ onClose }: { onClose?: () => void }) {
  const [original] = useState(readCalculatorConfig);
  const [mode, setMode] = useState<CalculatorConfig['mode']>(original.mode);
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [backgroundSeconds, setBackground] = useState(original.backgroundSeconds);
  const [idleMinutes, setIdle] = useState(original.idleMinutes);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [diagnostics,setDiagnostics] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      if (!(await verifyCalculatorCode(current, readCalculatorConfig()))) throw new Error('当前解锁密码不正确。');
      if (mode === 'pin' && (!/^\d{4,8}$/.test(pin) || pin !== confirm)) {
        throw new Error('请输入一致的 4～8 位数字 PIN。');
      }
      const baseUrl = localStorage.getItem('cinny_hs_base_url');
      const userId = localStorage.getItem('cinny_user_id');
      const owner = original.owner ?? (baseUrl && userId ? { baseUrl, userId } : undefined);
      const next: CalculatorConfig = { mode, backgroundSeconds, idleMinutes:isAndroidApp()?0:idleMinutes, owner };
      if (mode === 'pin') next.pin = await createCalculatorPin(pin);
      saveCalculatorConfig(next);
      onClose?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败，请重试。');
    } finally { setSaving(false); }
  };
  return (
    <form className="calculator-settings" onSubmit={save}>
      <header><h2>计算器与隐私</h2>{onClose && <button type="button" onClick={onClose}>关闭</button>}</header>
      <p>{isAndroidApp()?'只有手动锁定，或离开／关闭应用达到设定时长，才显示计算器。输入完整的解锁数字后自动进入，无需按等号。':'打开应用只显示计算器。输入完整的解锁数字后自动进入，无需按等号。'}</p>
      <label>解锁方式<select value={mode} onChange={(e) => setMode(e.target.value as CalculatorConfig['mode'])}>
        <option value="time">当前时间（默认）</option><option value="pin">固定 PIN</option>
      </select></label>
      {mode === 'time' && <p>使用本机 24 小时时间：09:05 输入 0905。跨分钟时也接受前一分钟。知道这一规则的人也能进入。</p>}
      <label>{original.mode === 'time' ? '验证当前时间（HHmm）' : '验证当前 PIN'}
        <input required type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      {mode === 'pin' && <>
        <label>新 PIN（4～8 位）<input required type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} /></label>
        <label>再次输入 PIN<input required type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <p>PIN 及其校验值只保存在当前设备，不上传云端。忘记时，在计算器长按 AC 3 秒，通过原账户重新登录验证后重设 PIN。</p>
      </>}
      <label>离开应用后锁定<select value={backgroundSeconds} onChange={(e) => setBackground(Number(e.target.value))}>
        {BACKGROUND_DELAYS.map((v) => <option key={v} value={v}>{v === 0 ? '立即' : v < 60 ? `${v} 秒` : `${v / 60} 分钟`}</option>)}
      </select></label>
      {!isAndroidApp() && <label>前台无操作后锁定<select value={idleMinutes} onChange={(e) => setIdle(Number(e.target.value))}>
        {IDLE_DELAYS.map((v) => <option key={v} value={v}>{v === 0 ? '关闭' : `${v} 分钟`}</option>)}
      </select></label>}
      <p>{isAndroidApp()?'前台使用、初次加载和刷新不会触发锁定。关闭或切走后，未达到设定时长返回会继续原页面；手动锁定后保持计算器，直到正确解锁。':'重新启动应用始终锁定。切到后台时立即遮住内容；短暂切回是否需要重输密码，由离开时长决定。'}</p>
      {isAndroidApp() && <><button type="button" onClick={()=>setDiagnostics(getAndroidLockDiagnostics())}>查看最近锁定原因</button>{diagnostics && <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:14}}>{diagnostics}</pre>}<p>原因记录只在本机保存，不包含 PIN、账号密码或聊天内容。</p></>}
      {message && <p role="alert">{message}</p>}
      <button className="calculator-save" type="submit" disabled={saving}>{saving ? '正在保存…' : isAndroidApp()?'保存设置':'保存并锁定'}</button>
    </form>
  );
}
