/** Player handle: a name on the start card, remembered on this device and used to welcome the driver. */
const KEY = 'kano.player.handle';
const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

function install() {
  const fields = document.querySelector('#start-screen .start-fields');
  if (!fields || document.getElementById('kano-handle')) return false;
  const label = document.createElement('label');
  label.innerHTML = 'HANDLE<input id="kano-handle" type="text" maxlength="14" autocomplete="off" placeholder="e.g. Ruffneck" style="background:#141b24;color:#f4efe3;border:1px solid #2a3544;border-radius:10px;font:700 14px Arial,sans-serif;padding:0 12px;min-height:42px">';
  fields.prepend(label);
  const input = label.querySelector('input');
  input.value = read();
  input.addEventListener('input', () => write(input.value.replace(/[^\w .-]/g, '').trim().slice(0, 14)));
  document.getElementById('start-btn')?.addEventListener('click', () => {
    const name = read();
    if (name) setTimeout(() => window.kanoGame?.ui?.toast?.(`Sannu, ${name}. Allah ya ba da sa'a.`), 600);
  }, true);
  return true;
}

if (!install()) {
  let tries = 0;
  const t = setInterval(() => { if (install() || ++tries > 40) clearInterval(t); }, 250);
}
