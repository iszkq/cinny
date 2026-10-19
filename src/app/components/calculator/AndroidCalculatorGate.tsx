import { recordAndroidDiagnostic } from '../../../client/androidDiagnostics';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {restoreAndroidSession,saveAndroidSession,readAndroidLifecycle,acknowledgeAndroidResume,AndroidCalculatorSession} from './androidSession';
import {calculatorKey,initialCalculator} from './engine';
import {CALCULATOR_CONFIG_EVENT,CALCULATOR_LOCK_EVENT,readCalculatorConfig,verifyCalculatorCode} from './lock';
import {NativeSystemAppearance} from '../native-navigation/NativeSystemAppearance';
import {NativePrivateMenu} from '../native-navigation/NativePrivateMenu';
import {NativeNavigation} from '../native-navigation/NativeNavigation';
import {useNativeBack} from '../../hooks/useNativeBack';
import {ANDROID_BACK_BUTTON_EVENT} from '../../utils/nativePlatform';
import {CalculatorRecovery} from './CalculatorRecovery';
import {CalculatorSettings} from './CalculatorSettings';
import './calculator.css';
const KEYS=['AC','±','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','⌫','0','.','='];
const markCovered=(value:boolean)=>{document.documentElement.dataset.calculatorLocked=String(value);};
export function AndroidCalculatorGate({ children }: { children: React.ReactNode }) {
  const [initial] = useState(()=>{
    let delay:number|undefined;try{delay=readCalculatorConfig().backgroundSeconds;}catch{/* Keep the last usable policy. */}
    const navigation=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
    return restoreAndroidSession(delay,navigation?.type??'navigate');
  });
  const state=useRef<AndroidCalculatorSession>(initial);
  const [locked,setLocked]=useState(initial.locked);
  const [covered] = useState(false);
  const [opened,setOpened]=useState(!initial.locked);
  const [settings, setSettings] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const hold = useRef<number>();
  const cancelHold = useCallback(() => { clearTimeout(hold.current); hold.current = undefined; }, []);
  const settingsBackRef = useRef<HTMLDivElement>(null);
  const recoveryBackRef = useRef<HTMLDivElement>(null);
  useNativeBack(settingsBackRef, () => setSettings(false), settings);
  useNativeBack(recoveryBackRef, () => setRecovery(false), recovery);
  const [calculator, setCalculator] = useState(initialCalculator);
  const lockedRef=useRef(initial.locked);
  const persist=useCallback(()=>saveAndroidSession(state.current),[]);
  const generation = useRef(0);
  const attempts = useRef({ failures: 0, blockedUntil: 0 });
  const lock = useCallback((reason: string) => {
    state.current={...state.current,locked:true,lastSeen:Date.now(),awayAt:undefined};
    persist();
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
  }, [cancelHold,persist]);

  useEffect(()=>{
    markCovered(lockedRef.current);
    recordAndroidDiagnostic('calculator_document_start',{restored:!lockedRef.current});
    let backgrounded=initial.awayAt!==undefined;
    let leaving=false;
    const refreshDelay=()=>{try{state.current.delaySeconds=readCalculatorConfig().backgroundSeconds;}catch{recordAndroidDiagnostic('calculator_config_read_failed');}};
    const checkDeadline=(returnedAt=Date.now())=>{
      const at=state.current.awayAt;
      if(!lockedRef.current && at!==undefined && returnedAt-at>=state.current.delaySeconds*1000)lock('background-timeout');
    };
    const background=(event?:Event)=>{
      if(leaving && event?.type!=='calculator-native-background')return;
      const lifecycle=readAndroidLifecycle();
      // A queued pause can arrive after the native activity has resumed.
      if(event?.type==='calculator-native-background' && lifecycle.foreground===true)return;
      backgrounded=true;refreshDelay();
      state.current.awayAt??=lifecycle.awayAt||Date.now();
      persist();checkDeadline();
      recordAndroidDiagnostic('calculator_background',{source:event?.type??'visibilitychange'});
    };
    const resume=(event?:Event)=>{
      event?.preventDefault();refreshDelay();
      const lifecycle=readAndroidLifecycle();
      state.current.awayAt??=lifecycle.awayAt||undefined;
      checkDeadline(lifecycle.awayAt && lifecycle.resumedAt && lifecycle.resumedAt>=lifecycle.awayAt?lifecycle.resumedAt:Date.now());
      backgrounded=false;leaving=false;
      state.current.awayAt=undefined;state.current.lastSeen=Date.now();
      persist();acknowledgeAndroidResume();markCovered(lockedRef.current);
    };
    const visibility=(event:Event)=>{if(document.hidden)background(event);else resume();};
    const pagehide=()=>{leaving=true;if(!backgrounded)state.current.lastSeen=Date.now();persist();};
    const manual=()=>lock('manual');
    const configChanged=()=>{refreshDelay();persist();};
    const hardwareBack=(event:Event)=>{if(lockedRef.current){event.preventDefault();setRecovery(false);}};
    const timer=window.setInterval(()=>{
      if(backgrounded)checkDeadline();
      else {state.current.lastSeen=Date.now();persist();}
    },1000);
    const input=()=>{if(!backgrounded){state.current.lastSeen=Date.now();persist();}};
    window.addEventListener('calculator-native-background',background);
    window.addEventListener('calculator-native-resume',resume);
    document.addEventListener('visibilitychange',visibility);
    document.addEventListener('pointerdown',input,true);
    document.addEventListener('keydown',input,true);
    window.addEventListener('pagehide',pagehide);
    window.addEventListener(CALCULATOR_LOCK_EVENT,manual);
    window.addEventListener(CALCULATOR_CONFIG_EVENT,configChanged);
    window.addEventListener(ANDROID_BACK_BUTTON_EVENT,hardwareBack);
    persist();if(!backgrounded)acknowledgeAndroidResume();
    return()=>{
      clearInterval(timer);cancelHold();
      window.removeEventListener('calculator-native-background',background);
      window.removeEventListener('calculator-native-resume',resume);
      document.removeEventListener('visibilitychange',visibility);
      document.removeEventListener('pointerdown',input,true);
      document.removeEventListener('keydown',input,true);
      window.removeEventListener('pagehide',pagehide);
      window.removeEventListener(CALCULATOR_LOCK_EVENT,manual);
      window.removeEventListener(CALCULATOR_CONFIG_EVENT,configChanged);
      window.removeEventListener(ANDROID_BACK_BUTTON_EVENT,hardwareBack);
    };
  },[cancelHold,initial,persist,lock]);

  const rootBack=useCallback(()=>{void import('@capacitor/app').then(({App})=>App.minimizeApp()).catch(()=>undefined);},[]);

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
        state.current={locked:false,lastSeen:Date.now(),delaySeconds:config.backgroundSeconds,instanceId:readAndroidLifecycle().instanceId};
        persist();acknowledgeAndroidResume();
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
  }, [calculator,persist]);

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
      {!locked && !covered && <NativeNavigation onRootBack={rootBack} />}
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
