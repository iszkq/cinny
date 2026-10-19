export type Operator = '+' | '−' | '×' | '÷';
export type CalculatorState = {
  display: string;
  accumulator?: number;
  operator?: Operator;
  replace: boolean;
  secret?: string;
  repeat?: { operator: Operator; operand: number };
};
export const initialCalculator = (): CalculatorState => ({ display: '0', replace: true, secret: '' });
const format = (n: number): string => Number.isFinite(n) ? String(Number(n.toPrecision(12))) : '错误';
const calculate = (a: number, b: number, op: Operator): number => {
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '×') return a * b;
  return b === 0 ? NaN : a / b;
};
export function calculatorKey(state: CalculatorState, key: string): CalculatorState {
  if (key === 'AC') return initialCalculator();
  if (/^\d$/.test(key)) {
    const display = state.replace || state.display === '错误' ? key : state.display + key;
    if (display.replace(/[-.]/g, '').length > 16) return state;
    return { ...state, display, replace: false, repeat: undefined,
      secret: state.replace && !state.operator ? key : state.secret === undefined ? undefined : state.secret + key };
  }
  if (key === '⌫') {
    if (state.replace) return initialCalculator();
    const display = state.display.slice(0, -1);
    return { ...state, display: display && display !== '-' ? display : '0',
      secret: state.secret?.slice(0, -1), replace: !display };
  }
  if (key === '.') {
    if (!state.replace && state.display.includes('.')) return state;
    return { ...state, display: state.replace ? '0.' : `${state.display}.`, replace: false, secret: undefined };
  }
  if (key === '±' || key === '%') {
    return { ...state, display: format(Number(state.display) * (key === '±' ? -1 : 0.01)), secret: undefined };
  }
  if (['+', '−', '×', '÷'].includes(key)) {
    const n = Number(state.display);
    const accumulator = state.operator && !state.replace && state.accumulator !== undefined
      ? calculate(state.accumulator, n, state.operator) : n;
    return { display: format(accumulator), accumulator, operator: key as Operator, replace: true };
  }
  if (key === '=') {
    if (state.operator && state.accumulator !== undefined) {
      const operand = Number(state.display);
      return { display: format(calculate(state.accumulator, operand, state.operator)), replace: true,
        repeat: { operator: state.operator, operand } };
    }
    if (state.repeat) {
      return { display: format(calculate(Number(state.display), state.repeat.operand, state.repeat.operator)),
        replace: true, repeat: state.repeat };
    }
    return { display: format(Number(state.display)), replace: true };
  }
  return state;
}
