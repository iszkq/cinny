import { AndroidCalculatorGate } from './AndroidCalculatorGate';
import { clearAndroidReloadUnlock, readAndroidReloadUnlock, saveAndroidReloadUnlock } from './androidReload';
import { recordAndroidDiagnostic } from '../../../client/androidDiagnostics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { calculatorKey, initialCalculator } from './engine';
import {
  CALCULATOR_CONFIG_EVENT, CALCULATOR_LOCK_EVENT, hasLockExpired,
  readCalculatorConfig, verifyCalculatorCode,
} from './lock';
import { NativeSystemAppearance } from '../native-navigation/NativeSystemAppearance';
import { NativePrivateMenu } from '../native-navigation/NativePrivateMenu';
import { NativeNavigation } from '../native-navigation/NativeNavigation';
import { useNativeBack } from '../../hooks/useNativeBack';
import { ANDROID_BACK_BUTTON_EVENT, isAndroidApp } from '../../utils/nativePlatform';
import { CalculatorRecovery } from './CalculatorRecovery';
import { CalculatorSettings } from './CalculatorSettings';
import './calculator.css';

const KEYS = ['AC', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '⌫', '0', '.', '='];
const markCovered = (covered: boolean) => {
  document.documentElement.dataset.calculatorLocked = String(covered);
};

// Keep the existing iOS behavior isolated. Android uses its own two-trigger
// policy in AndroidCalculatorGate (manual lock or elapsed time outside the app).
function IOSCalculatorGate({ children }: { children: React.ReactNode }) {
  const [restored] = useState(() => {
    if (!isAndroidApp()) return undefined;
    try {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      return readAndroidReloadUnlock(readCalculatorConfig(), true, navigation?.type ?? 'navigate');
    } catch { clearAndroidReloadUnlock(); return undefined; }
  });
  const [locked, setLocked] = useState(!restored);
  const [covered, setCovered] = useState(!!restored && document.hidden);
  const [opened, setOpened] = useState(!!restored);
  const [settings, setSettings] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const hold = useRef<number>();
  const cancelHold = useCallback(() => { clearTimeout(hold.current); hold.current = undefined; }, []);
  const settingsBackRef = useRef<HTMLDivElement>(null);
  const recoveryBackRef = useRef<HTMLDivElement>(null);
  useNativeBack(settingsBackRef, () => setSettings(false), settings);
  useNativeBack(recoveryBackRef, () => setRecovery(false), recovery);
  const [calculator, setCalculator] = useState(initialCalculator);
  const lockedRef = useRef(!restored);
  const away = useRef<number | undefined>(restored?.awayAt);
  const activity = useRef(performance.now() - (restored ? Date.now()-restored.idleAt : 0));
  const wallActivity = useRef(restored?.idleAt ?? Date.now());
  const generation = useRef(0);
  const attempts = useRef({ failures: 0, blockedUntil: 0 });
  const lock = useCallback((reason: string) => {
    if (isAndroidApp()) clearAndroidReloadUnlock();
    if (!lockedRef.current) recordAndroidDiagnostic('calculator_locked', { reason });
    generation.current += 1;
    lockedRef.current = true;
    markCovered(true);
    setLocked(true);
    setSettings(false);
    setRecovery(false);
    cancelHold();
    setCalculator(initialCalculator());
    // Clear focus/keyboard before the private page is hidden.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [cancelHold]);

  useEffect(() => {
    markCovered(lockedRef.current || document.hidden);
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    recordAndroidDiagnostic('calculator_document_start', { type: navigation?.type ?? 'unknown', restored: !!restored });
    let leavingDocument = false;
    const persistReload = () => {
      if (!isAndroidApp() || lockedRef.current) return;
      try { saveAndroidReloadUnlock(readCalculatorConfig(), wallActivity.current, away.current); } catch { clearAndroidReloadUnlock(); }
    };
    const pageLeaving = () => { leavingDocument = true; persistReload(); };
    if (isAndroidApp()) {
      window.addEventListener('pagehide', pageLeaving);
      persistReload();
    }
    const background = (event?: Event) => {
      if (isAndroidApp() && leavingDocument && event?.type !== 'calculator-native-background') return;
      recordAndroidDiagnostic('calculator_background', { source: event?.type ?? 'visibilitychange', hidden: document.hidden });
      generation.current += 1;
      if (away.current === undefined) away.current = Date.now();
      markCovered(true);
      setCovered(true);
      setRecovery(false);
      cancelHold();
      setCalculator(initialCalculator());
      try { if (readCalculatorConfig().backgroundSeconds === 0) lock('background-immediate'); } catch { lock('invalid-config'); }
      persistReload();
    };
    const resume = (event?: Event) => {
      // Native Android keeps its privacy shield until this live gate responds.
      event?.preventDefault();
      try {
        const config = readCalculatorConfig();
        const now = Date.now();
        if (away.current !== undefined && hasLockExpired(now - away.current, config.backgroundSeconds)) {
          lock('background-timeout');
        } else if (config.idleMinutes > 0 && hasLockExpired(performance.now() - activity.current, config.idleMinutes * 60)) {
          lock('idle-on-resume');
        }
      } catch { lock('invalid-config'); }
      away.current = undefined;
      markCovered(lockedRef.current);
      setCovered(false);
      leavingDocument = false;
      persistReload();
    };
    const hardwareBack = (event: Event) => {
      if (!lockedRef.current) return;
      event.preventDefault();
      setRecovery(false);
    };
    window.addEventListener(ANDROID_BACK_BUTTON_EVENT, hardwareBack);
    const visibility = (event: Event) => document.hidden ? background(event) : resume();
    const input = (event: Event) => {
      const reject = () => { event.preventDefault(); event.stopImmediatePropagation(); lock('idle-input'); };
      if (lockedRef.current) return;
      try {
        const minutes = readCalculatorConfig().idleMinutes;
        if (minutes && hasLockExpired(performance.now() - activity.current, minutes * 60)) { reject(); return; }
      } catch { event.preventDefault(); event.stopImmediatePropagation(); lock('invalid-config'); return; }
      activity.current = performance.now();
      wallActivity.current = Date.now();
      persistReload();
    };
    const timer = window.setInterval(() => {
      if (lockedRef.current) return;
      try {
        const minutes = readCalculatorConfig().idleMinutes;
        if (minutes && hasLockExpired(performance.now() - activity.current, minutes * 60)) lock('idle-timeout');
      } catch { lock('invalid-config'); }
    }, 1000);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('click', input, true);
    document.addEventListener('input', input, true);
    document.addEventListener('scroll', input, true);
    document.addEventListener('pointerdown', input, true);
    document.addEventListener('keydown', input, true);
    document.addEventListener('touchstart', input, { passive: false, capture: true });
    window.addEventListener('calculator-native-background', background);
    window.addEventListener('calculator-native-resume', resume);
    const manualLock = () => lock('manual');
    const configLock = () => lock('settings-changed');
    window.addEventListener(CALCULATOR_LOCK_EVENT, manualLock);
    window.addEventListener(CALCULATOR_CONFIG_EVENT, configLock);
    return () => {
      window.removeEventListener(ANDROID_BACK_BUTTON_EVENT, hardwareBack);
      window.removeEventListener('pagehide', pageLeaving);
      clearInterval(timer);
      cancelHold();
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('click', input, true);
      document.removeEventListener('input', input, true);
      document.removeEventListener('scroll', input, true);
      document.removeEventListener('pointerdown', input, true);
      document.removeEventListener('keydown', input, true);
      document.removeEventListener('touchstart', input, true);
      window.removeEventListener('calculator-native-background', background);
      window.removeEventListener('calculator-native-resume', resume);
      window.removeEventListener(CALCULATOR_LOCK_EVENT, manualLock);
      window.removeEventListener(CALCULATOR_CONFIG_EVENT, configLock);
    };
  }, [lock, cancelHold, restored]);

  const press = useCallback(async (key: string) => {
    if (document.hidden) return;
    const next = calculatorKey(calculator, key);
    setCalculator(next);
    generation.current += 1;
    const expected = generation.current;
    if (!/^\d$/.test(key) || !next.secret || Date.now() < attempts.current.blockedUntil) return;
    try {
      const config = readCalculatorConfig();
      const length = config.mode === 'time' ? 4 : config.pin?.length;
      if (length ? next.secret.length !== length : next.secret.length < 4 || next.secret.length > 8) return;
      const verified = await verifyCalculatorCode(next.secret, config);
      if (generation.current !== expected || document.hidden) return;
      if (verified) {
        attempts.current = { failures: 0, blockedUntil: 0 };
        activity.current = performance.now();
        wallActivity.current = Date.now();
        if (isAndroidApp()) saveAndroidReloadUnlock(config, wallActivity.current);
        lockedRef.current = false;
        markCovered(false);
        setOpened(true);
        setLocked(false);
        setCalculator(initialCalculator());
      } else if (config.mode === 'pin') {
        attempts.current.failures += 1;
        if (attempts.current.failures >= 10) {
          attempts.current = { failures: 0, blockedUntil: Date.now() + 30000 };
        }
      }
    } catch {
      // Invalid saved settings must leave the calculator locked.
    }
  }, [calculator]);

  useEffect(() => {
    if (recovery || (!locked && !covered)) return undefined;
    const onKey = (event: KeyboardEvent) => {
      const aliases: Record<string, string> = { Enter: '=', Escape: 'AC', Backspace: '⌫', '*': '×', '/': '÷', '-': '−' };
      const key = aliases[event.key] ?? event.key;
      if (!KEYS.includes(key)) return;
      event.preventDefault();
      void press(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, covered, press, recovery]);

  return <>
    <NativeSystemAppearance />
    {opened && <div className="calculator-private" hidden={locked || covered}>
      {children}
      {!locked && !covered && <NativeNavigation onRootBack={() => lock('root-back')} />}
      {!locked && !covered && <NativePrivateMenu onSettings={() => setSettings(true)} onLock={() => lock('manual')} />}
      {settings && <div ref={settingsBackRef} className="calculator-settings-overlay" role="dialog" aria-modal="true" aria-label="计算器与隐私">
        <CalculatorSettings onClose={() => setSettings(false)} />
      </div>}
    </div>}
    <main className="calculator-shell" hidden={!locked && !covered} aria-label="计算器">
      <div className="calculator-face">
        <div className="calculator-title">计算器</div>
        <output className="calculator-display" aria-live="polite">{calculator.display}</output>
        <div className="calculator-keypad">
          {KEYS.map((key) => <button type="button" key={key}
            className={['÷', '×', '−', '+', '='].includes(key) ? 'calculator-operator' : ['AC', '±', '%'].includes(key) ? 'calculator-function' : ''}
            aria-label={key === '⌫' ? '退格' : key === 'AC' ? '清空' : key === '=' ? '等于' : key}
            onPointerDown={key === 'AC' ? () => {
              cancelHold();
              hold.current = window.setTimeout(() => {
                try { if (readCalculatorConfig().mode !== 'pin') return; } catch { /* Allow corrupt PIN recovery. */ }
                setRecovery(true);
              }, 3000);
            } : undefined}
            onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => void press(key)}>{key === '=' ? '＝' : key}</button>)}
        </div>
      </div>
    </main>
    {recovery && !covered && <><NativeNavigation onRootBack={() => setRecovery(false)} /><div ref={recoveryBackRef} className="calculator-settings-overlay calculator-recovery" role="dialog" aria-modal="true" aria-label="忘记 PIN">
      <CalculatorRecovery onClose={() => setRecovery(false)} />
    </div></>}
  </>;
}

export function CalculatorGate({children}:{children:React.ReactNode}) {
  return isAndroidApp()?<AndroidCalculatorGate>{children}</AndroidCalculatorGate>:<IOSCalculatorGate>{children}</IOSCalculatorGate>;
}
