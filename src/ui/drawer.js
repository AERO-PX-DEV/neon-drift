// Side drawer with tabs (Esc). Later phases add Garage, World Builder, Radio, City Log, Map.
export function createDrawer() {
  const el = document.createElement('aside');
  el.id = 'drawer';
  el.innerHTML = '<nav></nav><div class="body"></div>';
  document.body.append(el);
  const nav = el.querySelector('nav'), body = el.querySelector('.body');
  const tabs = [];
  const show = (i) => tabs.forEach((t, j) => { t.btn.classList.toggle('on', i === j); t.pane.hidden = i !== j; });
  return {
    el,
    addTab(name) {
      const btn = document.createElement('button'), pane = document.createElement('section');
      btn.textContent = name;
      btn.onclick = () => show(tabs.findIndex((t) => t.btn === btn));
      nav.append(btn);
      body.append(pane);
      tabs.push({ btn, pane });
      show(0);
      return pane;
    },
    show(name) { show(tabs.findIndex((t) => t.btn.textContent === name)); },
    toggle() { el.classList.toggle('open'); },
    get open() { return el.classList.contains('open'); },
  };
}

function row(pane, label, input) {
  const l = document.createElement('label');
  l.append(Object.assign(document.createElement('span'), { textContent: label }), input);
  pane.append(l);
  return input;
}

export function slider(pane, label, { min, max, step, value }, onInput) {
  const i = Object.assign(document.createElement('input'), { type: 'range', min, max, step, value });
  i.oninput = () => onInput(Number(i.value));
  return row(pane, label, i);
}

export function select(pane, label, options, value, onChange) {
  const s = document.createElement('select');
  for (const [v, text] of options) s.append(new Option(text, v, false, v === value));
  s.onchange = () => { onChange(s.value); s.blur(); }; // a focused select keeps eating flight keys (arrows/letters change it)
  return row(pane, label, s);
}

export function check(pane, label, value, onChange) {
  const i = Object.assign(document.createElement('input'), { type: 'checkbox', checked: value });
  i.onchange = () => onChange(i.checked);
  return row(pane, label, i);
}

export function button(pane, label, onClick) {
  const b = Object.assign(document.createElement('button'), { textContent: label, className: 'act' });
  b.onclick = onClick;
  pane.append(b);
  return b;
}
