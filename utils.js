/* Cartera Activa VCA — utils.js */

  function showRootAccessDenied() {
    const toast = document.getElementById('accessToast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  /* ══ PWA ══ */
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

  /* ══ helpers ══ */
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
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Date normalizer: any input → 'yyyy-mm-dd' or null ── */
  function parseExcelDate(val) {
    if (!val && val !== 0) return null;
    
    // Si ya es un objeto Date (producido por XLSX con cellDates:true)
    if (val instanceof Date) {
      if (!isNaN(val.getTime())) return val.toISOString().slice(0, 10);
      return null;
    }

    const s = String(val).trim();
    if (!s || s === '—' || s === 'null' || s === 'undefined') return null;

    // Excel serial number (e.g. 43102)
    if (/^\d{4,5}$/.test(s)) {
      // Ajuste para zona horaria local para evitar saltos de día
      const d = new Date((Number(s) - 25569) * 86400 * 1000);
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localDate = new Date(d.getTime() + tzOffset);
      if (!isNaN(localDate.getTime())) return localDate.toISOString().slice(0, 10);
    }

    // Already ISO: yyyy-mm-dd or yyyy/mm/dd
    const isoMatch = s.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      const year = Number(y);
      const month = Number(m);
      const day = Number(d);
      if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31)
        return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }

    // dd/mm/yyyy or dd-mm-yyyy (most common in Guatemala/Latin America)
    const dmyMatch = s.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      const day = Number(d);
      const month = Number(m);
      const year = Number(y);
      
      // Validación básica de rangos
      if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      }
    }

    // Try native Date parse as last resort
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime()) && d.getFullYear() > 1900)
        return d.toISOString().slice(0, 10);
    } catch(e) {}

    return null; // unparseable
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

  /* ══ Supabase helpers ══ */
  /* ── Excel cloud sync ── */
