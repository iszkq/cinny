import React, { useEffect, useRef, useState } from 'react';
import { createCalculatorPin, DEFAULT_CALCULATOR_CONFIG, readCalculatorConfig, saveCalculatorConfig } from './lock';
import { verifyRecoveryLogin } from './recovery';

export function CalculatorRecovery({ onClose }: { onClose: () => void }) {
  const [original] = useState(() => {
    try { return readCalculatorConfig(); } catch { return { ...DEFAULT_CALCULATOR_CONFIG }; }
  });
  const [saved] = useState(() => original.owner ?? (() => {
    const baseUrl = localStorage.getItem('cinny_hs_base_url');
    const userId = localStorage.getItem('cinny_user_id');
    return baseUrl && userId ? { baseUrl, userId } : undefined;
  })());
  const [server, setServer] = useState(saved?.baseUrl ?? '');
  const [user, setUser] = useState(saved?.userId ?? '');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController>();
  useEffect(() => () => { request.current?.abort(); }, []);
  const recover = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{4,8}$/.test(pin) || pin !== confirm) { setMessage('请输入一致的 4～8 位新 PIN。'); return; }
    if (!/^@[^:]+:.+$/.test(user)) { setMessage('请输入完整的账户 ID，例如 @name:example.com。'); return; }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage('');
    try {
      const identity = saved ?? { baseUrl: server.trim(), userId: user.trim() };
      await verifyRecoveryLogin(identity, password, controller.signal);
      const nextPin = await createCalculatorPin(pin);
      if (controller.signal.aborted) return;
      saveCalculatorConfig({ ...original, mode: 'pin', pin: nextPin, owner: identity });
      onClose();
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : '登录验证失败，请重试。');
    } finally {
      if (!controller.signal.aborted) { setBusy(false); setPassword(''); }
    }
  };
  return <form className="calculator-settings" onSubmit={recover}>
    <header><h2>忘记 PIN</h2><button type="button" onClick={onClose}>取消</button></header>
    <p>请重新验证原账户的登录密码，再设置新的本机 PIN。PIN 及其校验值只保存在当前设备，不上传服务器。</p>
    <label>服务器地址<input required type="url" readOnly={!!saved} value={server} onChange={(e) => setServer(e.target.value)} /></label>
    <label>账户 ID<input required autoComplete="username" readOnly={!!saved} value={user} onChange={(e) => setUser(e.target.value)} /></label>
    <label>账户登录密码<input required type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    <label>新 PIN（4～8 位）<input required type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} /></label>
    <label>再次输入 PIN<input required type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
    {message && <p role="alert">{message}</p>}
    <button className="calculator-save" type="submit" disabled={busy}>{busy ? '正在验证…' : '重新登录验证并重设 PIN'}</button>
  </form>;
}
