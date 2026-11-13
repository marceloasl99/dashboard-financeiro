// Generic modal with focus trap, Escape to close, and confirm() helper.
import { icon } from './icons.js';

let stack = [];

export function openModal({ title, content, footer, wide = false, onClose } = {}) {
  const root = document.getElementById('modalRoot');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="mt${stack.length}">
      <header><h2 id="mt${stack.length}"></h2><button class="btn icon ghost" type="button" data-close aria-label="Fechar">${icon('x')}</button></header>
      <div class="content"></div>
      <footer></footer>
    </div>`;
  const modal = backdrop.firstElementChild;
  modal.querySelector('h2').textContent = title || '';
  const body = modal.querySelector('.content');
  if (typeof content === 'string') body.innerHTML = content; else if (content) body.appendChild(content);
  const foot = modal.querySelector('footer');
  if (typeof footer === 'string') foot.innerHTML = footer; else if (footer) foot.appendChild(footer); else foot.remove();
  const prevFocus = document.activeElement;

  const api = {
    el: modal, body, foot,
    close() {
      backdrop.remove(); stack = stack.filter(m => m !== api);
      document.removeEventListener('keydown', onKey);
      onClose?.();
      prevFocus?.focus?.();
    },
  };
  const onKey = e => {
    if (stack[stack.length - 1] !== api) return;
    if (e.key === 'Escape') { e.preventDefault(); api.close(); }
    if (e.key === 'Tab') {
      const f = [...modal.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  backdrop.addEventListener('click', e => { if (e.target === backdrop) api.close(); });
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => api.close()));
  document.addEventListener('keydown', onKey);
  root.appendChild(backdrop);
  stack.push(api);
  requestAnimationFrame(() => (modal.querySelector('input,select,button:not([data-close])') || modal).focus());
  return api;
}

export function confirmDialog(message, { title = 'Confirmar', ok = 'Confirmar', danger = false, options } = {}) {
  return new Promise(resolve => {
    const foot = document.createElement('div');
    foot.className = 'right';
    foot.innerHTML = `<button class="btn" type="button" data-cancel>Cancelar</button>` +
      (options ? options.map((o, i) => `<button class="btn ${o.danger ? 'danger' : i === options.length - 1 ? 'primary' : ''}" type="button" data-opt="${o.value}">${o.label}</button>`).join('')
               : `<button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-ok>${ok}</button>`);
    const m = openModal({ title, content: `<p>${message}</p>`, footer: foot, onClose: () => resolve(result) });
    let result = null;
    foot.querySelector('[data-cancel]').onclick = () => m.close();
    foot.querySelector('[data-ok]')?.addEventListener('click', () => { result = true; m.close(); });
    foot.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => { result = b.dataset.opt; m.close(); }));
  });
}
