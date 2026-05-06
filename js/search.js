function formatMatches(raw) {
  return raw.map(m => ({
    referencia:        m.codigo,
    socio:             m.nombre_completo,
    departamento:      m.tipo_membresia,
    inicio:            m.fecha_inicio,
    vencimiento:       m.fecha_vencimiento,
    ultimo_pago:       m.ultimo_pago        || '—',
    ultimo_año_de_pago:m.ultimo_año_de_pago || '—',
    notas:             m.comentarios || m.notas || ''
  }));
}

function logSearch(formattedMatches, q) {
  if (formattedMatches.length > 0) {
    formattedMatches.forEach(r => sbInsert({
      socio: r.socio, referencia: r.referencia,
      departamento: r.departamento, notas: r.notas,
      usuario: currentUser || 'Desconocido', encontrado: true
    }));
  } else {
    sbInsert({
      socio: '— NO ENCONTRADO —', referencia: q, departamento: '',
      notas: 'Sin resultados en la base de datos',
      usuario: currentUser || 'Desconocido', encontrado: false
    });
  }
}

function applyNotes(formattedMatches) {
  prefetchNotes(formattedMatches.map(r => r.referencia)).then(() => {
    formattedMatches.forEach(r => {
      const panel = document.querySelector(`[data-ref-note="${r.referencia}"]`);
      if (panel) panel.innerHTML = buildNotePanel(r).replace('<div class="note-panel">','').replace('</div>','');
    });
  });
}

async function searchCartera(q) {
  const qEnc    = encodeURIComponent(q);
  const base    = `${SUPABASE_URL}/rest/v1/socios`;
  const headers = authHeaders();
  const looksLikeCode = /^[A-Z0-9\-\/]+$/i.test(q);
  const activeFilter = '&activo=eq.true';

  let step1Url;
  if (looksLikeCode) {
    step1Url = `${base}?select=*&or=(codigo.eq.${qEnc},codigo.ilike.${qEnc}*)&limit=50${activeFilter}`;
  } else {
    step1Url = `${base}?select=*&or=(nombre_completo.ilike.${qEnc}*,codigo.eq.${qEnc})&limit=50${activeFilter}`;
  }
  const r1 = await fetch(step1Url, { headers });
  const d1 = await r1.json();
  if (Array.isArray(d1) && d1.length > 0) return d1;

  const step2Url = `${base}?select=*&or=(codigo.ilike.*${qEnc}*,nombre_completo.ilike.*${qEnc}*,dpi.ilike.*${qEnc}*)&limit=50${activeFilter}`;
  const r2 = await fetch(step2Url, { headers });
  return r2.json();
}

function doSearch(q2) {
  const q = (q2 || document.getElementById('searchInput').value).trim();
  if (!q) return;

  document.getElementById('searchInput').value = q;
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('searchInput').blur();

  if (!searchHist.includes(q)) {
    searchHist.unshift(q); if (searchHist.length > 8) searchHist.pop();
  }
  searchFreq[q] = (searchFreq[q] || 0) + 1;
  renderHist();

  const resultsWrap = document.getElementById('resultsWrap');
  const cards       = document.getElementById('resultCards');
  const bar         = document.getElementById('resultBar');
  resultsWrap.style.display = 'flex';

  const cacheKey = q.toLowerCase();
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    renderResults(cached, q);
    setTimeout(() => resultsWrap.scrollIntoView({ behavior:'smooth', block:'start' }), 80);
    return;
  }

  cards.innerHTML = '<div class="socios-empty">⏳ Buscando...</div>';
  bar.textContent = 'Buscando...';

  searchCartera(q)
    .then(raw => {
      const formattedMatches = formatMatches(Array.isArray(raw) ? raw : []);
      if (searchCache.size >= SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value);
      searchCache.set(cacheKey, formattedMatches);
      logSearch(formattedMatches, q);
      renderResults(formattedMatches, q);
      applyNotes(formattedMatches);
    })
    .catch(err => {
      console.error('Search error:', err);
      cards.innerHTML = `<div class="no-result">Error al buscar en la base de datos. Verifica tu conexión.</div>`;
    });

  setTimeout(() => resultsWrap.scrollIntoView({ behavior:'smooth', block:'start' }), 80);
}

function membershipStatus(vencimiento) {
  if (!vencimiento || vencimiento === '\u2014') return { label: 'Sin fecha', color: '#526282', bg: 'rgba(82,98,130,.1)', border: 'rgba(82,98,130,.2)', icon: '\u2014' };
  const clean = vencimiento.toString().trim();
  const parts = clean.split(/[\/\-\.]/);
  let d;
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    d = a > 1000 ? new Date(a, b - 1, c) : new Date(c > 1000 ? c : 2000 + c, b - 1, a);
  } else {
    d = new Date(clean);
  }
  if (isNaN(d)) return { label: 'Sin fecha', color: '#526282', bg: 'rgba(82,98,130,.1)', border: 'rgba(82,98,130,.2)', icon: '\u2014' };
  const now = new Date();
  now.setHours(0,0,0,0);
  const diff = Math.floor((d - now) / 86400000);
  if (diff < 0)   return { label: 'VENCIDO',           color: '#b53326', bg: '#fdf1f0', border: '#f4beb8', icon: '\ud83d\udd34' };
  if (diff <= 30) return { label: 'PR\u00d3XIMO A VENCER', color: '#7a5800', bg: '#fffbec', border: '#f0d880', icon: '\ud83d\udfe1' };
  return               { label: 'AL D\u00cdA',          color: '#166842', bg: '#ecf8f2', border: '#b3dfc6', icon: '\ud83d\udfe2' };
}

function copyRef(ref) {
  navigator.clipboard.writeText(ref).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = ref; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  });
  const toast = document.getElementById('accessToast');
  toast.textContent = '\ud83d\udccb Referencia copiada';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function renderResults(matches, q) {
  const wrap = document.getElementById('resultsWrap');
  const bar  = document.getElementById('resultBar');
  const cards = document.getElementById('resultCards');
  wrap.style.display = 'flex';

  if (matches.length) {
    try { sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify({ matches, q })); } catch(e) {}
  }

  if (!matches.length) {
    bar.textContent = '';
    cards.innerHTML = `<div class="no-result">No se encontraron resultados para <strong>"${esc(q)}"</strong>.</div>`;
    return;
  }

  bar.textContent = `${matches.length} resultado${matches.length!==1?'s':''} para "${q}"`;
  cards.innerHTML = matches.map((r,i) => {
    const nota  = r.notas ? `<span class="note-tag">\ud83c\udff7 ${esc(r.notas)}</span>` : `<span class="fv mt">Sin notas</span>`;
    const st    = membershipStatus(r.vencimiento);
    const badge = `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:.72rem;font-weight:800;letter-spacing:.5px;background:${st.bg};color:${st.color};border:1.5px solid ${st.border};">${st.icon} ${st.label}</span>`;
    return `
    <div class="rcard" style="animation-delay:${i*.07}s">
      <div class="rcard-head">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;position:relative;z-index:1;">
          <div>
            <div class="rcard-ref">${esc(r.referencia)}</div>
            <div class="rcard-name">${esc(r.socio)||'\u2014'}</div>
          </div>
          <div style="padding-top:2px;flex-shrink:0;">${badge}</div>
        </div>
      </div>
      <div class="rcard-body">
        <div class="f wide"><div class="fl">Departamento</div><div class="fv ${!r.departamento?'mt':''}">${esc(r.departamento)||'\u2014'}</div></div>
        <div class="f"><div class="fl">Inicio</div><div class="fv ${!r.inicio?'mt':''}">${esc(r.inicio)||'\u2014'}</div></div>
        <div class="f"><div class="fl">Vencimiento</div><div class="fv ${!r.vencimiento?'mt':''}">${esc(r.vencimiento)||'\u2014'}</div></div>
        <div class="f"><div class="fl">\u00daltimo Pago</div><div class="fv ${!r.ultimo_pago?'mt':''}">${esc(r.ultimo_pago)||'\u2014'}</div></div>
        <div class="f"><div class="fl">\u00daltimo A\u00f1o</div><div class="fv ${!r.ultimo_a\u00f1o_de_pago?'mt':''}">${esc(r.ultimo_a\u00f1o_de_pago)||'\u2014'}</div></div>
        <div class="f wide"><div class="fl">Notas</div><div class="fv">${nota}</div></div>
      </div>
      <div data-ref-note="${esc(r.referencia)}"></div>
    </div>`;
  }).join('');
}

function renderHist() {
  if (!searchHist.length) { document.getElementById('histSection').style.display='none'; return; }
  document.getElementById('histSection').style.display = 'block';
  document.getElementById('histWrap').innerHTML = searchHist.map(h => {
    const freq = searchFreq[h] || 1;
    const badge = freq > 1 ? `<span style="background:var(--royal);color:white;border-radius:10px;padding:1px 6px;font-size:.62rem;font-weight:800;margin-left:5px;">${freq}</span>` : '';
    return `<button class="hist-chip" onclick="doSearch('${esc(h)}')" style="display:inline-flex;align-items:center;">${esc(h)}${badge}</button>`;
  }).join('');
}

let allRows = [];
