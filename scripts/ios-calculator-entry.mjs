import { readFileSync } from 'node:fs';
export function calculatorEntry(html, {android=false} = {}) {
  const css = readFileSync(new URL('../src/app/components/calculator/calculator.css', import.meta.url), 'utf8');
  const keys = ['AC', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '⌫', '0', '.', '＝'];
  const buttons = keys.map((key, i) => `<button class="${i % 4 === 3 ? 'calculator-operator' : i < 3 ? 'calculator-function' : ''}">${key}</button>`).join('');
  const entry = android ? '<main aria-label="正在打开" style="position:fixed;inset:0;background:#17191e"></main>' : `<main class="calculator-shell"><div class="calculator-face"><div class="calculator-title">计算器</div><output class="calculator-display">0</output><div class="calculator-keypad">${buttons}</div></div></main>`;
  return html.replaceAll('星火', '计算器')
    .replace('<html', '<html data-calculator-locked="true"')
    .replace('</head>', `<style>${css}</style></head>`)
    .replace(/<div id="root">[\s\S]*?<div id="portalContainer"><\/div>/, `<div id="root">${entry}</div><div id="portalContainer"></div>`);
}
