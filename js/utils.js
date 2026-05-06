function showRootAccessDenied() {
  const toast = document.getElementById('accessToast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  document.getElementById('installBanner').style.display = 'flex';
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt = null; document.getElementById('installBanner').style.display = 'none';
});
document.getElementById('closeBanner').addEventListener('click', () => {
  document.getElementById('installBanner').style.display = 'none';
});

function showStatus(type, msg) {
  const p = document.getElementById('statusPill');
  p.className = 'status-pill ' + type;
  document.getElementById('statusIcon').textContent = type === 'ok' ? '✅' : '❌';
  document.getElementById('statusText').textContent = msg;
}

function setChip(n) {
  const c = document.getElementById('recordsChip');
  c.textContent = `${n.toLocaleString('es')} registros cargados`;
  c.classList.toggle('show', n > 0);
  searchCache.clear();
  if (n > 0) computeCarteraStats();
}

function computeCarteraStats() {
  if (!data || !data.length) return;
  let alDia = 0, proximo = 0, vencido = 0, sinFecha = 0;
  data.forEach(row => {
    const raw = row.fecha_vencimiento || row.vencimiento || row['Fecha Vencimiento'] || row['FECHA VENCIMIENTO'] || '';
    const formatted = fmtDate(raw);
    const st = membershipStatus(formatted || raw);
    if (st.label === 'AL DÍA') alDia++;
    else if (st.label === 'PRÓXIMO A VENCER') proximo++;
    else if (st.label === 'VENCIDO') vencido++;
    else sinFecha++;
  });
  const panel = document.getElementById('statsPanel');
  if (!panel) return;
  panel.style.display = 'block';
  document.getElementById('stAlDia').textContent   = alDia.toLocaleString('es');
  document.getElementById('stProximo').textContent  = proximo.toLocaleString('es');
  document.getElementById('stVencido').textContent  = vencido.toLocaleString('es');
  document.getElementById('statsPanelCount').textContent = `${data.length.toLocaleString('es')} membresías`;
}

// Sanitizar string de entrada — elimina caracteres de control y limita longitud
function sanitizeInput(val, maxLen = 255) {
  if (!val) return '';
  return String(val)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '') // script tags
    .trim()
    .slice(0, maxLen);
}

function sanitizeSocioPayload(p) {
  const str = (v, n) => sanitizeInput(v, n);
  return {
    ...p,
    nombre_completo: str(p.nombre_completo, 150),
    codigo:          str(p.codigo, 50),
    dpi:             str(p.dpi, 20).replace(/[^0-9\-]/g, ''), // solo números y guiones
    telefono:        str(p.telefono, 20).replace(/[^0-9\+\-\s\(\)]/g, ''),
    email:           str(p.email, 150).toLowerCase(),
    direccion:       str(p.direccion, 300),
    tipo:            str(p.tipo, 50),
    comentarios:     str(p.comentarios, 500),
  };
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function parseExcelDate(val) {
  if (!val && val !== 0) return null;
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) return val.toISOString().slice(0, 10);
    return null;
  }
  const s = String(val).trim();
  if (!s || s === '—' || s === 'null' || s === 'undefined') return null;
  if (/^\d{4,5}$/.test(s)) {
    const d = new Date((Number(s) - 25569) * 86400 * 1000);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() + tzOffset);
    if (!isNaN(localDate.getTime())) return localDate.toISOString().slice(0, 10);
  }
  const isoMatch = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year = Number(y), month = Number(m), day = Number(d);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  const dmyMatch = s.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const day = Number(d), month = Number(m), year = Number(y);
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1900) return d.toISOString().slice(0, 10);
  } catch(e) {}
  return null;
}

function nowStr() {
  const d = new Date();
  return d.toLocaleDateString('es') + ' · ' + d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
}

function fmtDate(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('es', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch(e) { return String(val); }
}
