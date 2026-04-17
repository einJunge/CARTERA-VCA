/* Cartera Activa VCA — supabase.js */

  async function sbSaveExcel(jsonData) {
    if (!supabaseReady) return;
    // upsert into a single row with id=1
    await fetch(`${SUPABASE_URL}/rest/v1/excel_data`, {
      method: 'POST',
      headers: {
        ...authHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ id: 1, data: JSON.stringify(jsonData), updated_at: new Date().toISOString(), uploaded_by: currentUser || 'Desconocido' })
    });
  }

  async function sbLoadExcel() {
    if (!supabaseReady) return null;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/excel_data?id=eq.1`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows.length ? rows[0] : null;
  }

  async function tryAutoLoadExcel() {
    const row = await sbLoadExcel();
    if (!row) return;
    lastExcelTimestamp = row.updated_at;
    try {
      const parsed = JSON.parse(row.data);
      if (!parsed.length) return;
      data = parsed;
      try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch(e) {}
      const d = new Date(row.updated_at);
      const when = d.toLocaleDateString('es') + ' ' + d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
      showStatus('ok', `☁️ ${data.length} registros sincronizados — subido por ${row.uploaded_by} el ${when}`);
      document.getElementById('searchBtn').disabled = false;
      setChip(data.length);
    } catch(e) {}
  }

  async function sbInsert(row) {
    if (!supabaseReady) return;
    await fetch(`${SUPABASE_URL}/rest/v1/consultas`, {
      method: 'POST',
      headers: {
        ...authHeaders(), 'Prefer': 'return=minimal'
      },
      body: JSON.stringify(row)
    });
  }

  async function sbFetch() {
    if (!supabaseReady) return null;
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/consultas?order=created_at.desc&limit=500`,
      { headers: authHeaders() }
    );
    return res.ok ? await res.json() : null;
  }

  async function sbDelete() {
    if (!supabaseReady) return;
    // Delete all rows — use id=gte.0 with explicit Content-Type
    const res = await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=gte.0`, {
      method: 'DELETE',
      headers: {
        ...authHeaders(), 'Prefer': 'return=minimal'
      }
    });
    return res.ok;
  }

  /* ══════════════════════════════════════════
     EXCEL UPDATE POLLING
  ══════════════════════════════════════════ */
  let lastExcelTimestamp = null;
  let pollingInterval    = null;

  function startPolling() {
    if (!supabaseReady) return;
    pollingInterval = setInterval(async () => {
      if (document.getElementById('screenMain')?.classList.contains('active') === false) return;
      const row = await sbLoadExcel();
      if (!row) return;
      const ts = row.updated_at;
      if (lastExcelTimestamp && ts !== lastExcelTimestamp) {
        const d = new Date(ts);
        const when = d.toLocaleDateString('es') + ' ' + d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
        document.getElementById('excelUpdateMsg').textContent =
          `☁️ ${row.uploaded_by} subió un Excel nuevo el ${when}. ¿Actualizar datos?`;
        document.getElementById('excelUpdateBanner').classList.add('show');
        pendingExcelRow = row;
      }
      lastExcelTimestamp = ts;
    }, 30000); // check every 30s
  }

  let pendingExcelRow = null;

  async function reloadFromCloud() {
    const row = pendingExcelRow || await sbLoadExcel();
    if (!row) return;
    try {
      const parsed = JSON.parse(row.data);
      if (!parsed.length) return;
      data = parsed;
      try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch(e) {}
      const d = new Date(row.updated_at);
      const when = d.toLocaleDateString('es') + ' ' + d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
      showStatus('ok', `✅ Datos actualizados — ${data.length} registros (${row.uploaded_by} · ${when})`);
      document.getElementById('searchBtn').disabled = false;
      setChip(data.length);
      lastExcelTimestamp = row.updated_at;
    } catch(e) {}
    dismissUpdate();
  }

  function dismissUpdate() {
    document.getElementById('excelUpdateBanner').classList.remove('show');
    pendingExcelRow = null;
  }

  /* ══════════════════════════════════════════
     INTERNAL NOTES (Supabase table: notas_internas)
  ══════════════════════════════════════════ */
  const notesCache = {};

  async function sbGetNote(ref) {
    if (!supabaseReady) return null;
    if (notesCache[ref] !== undefined) return notesCache[ref];
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/notas_internas?referencia=eq.${encodeURIComponent(ref)}&limit=1`,
      { headers: authHeaders() }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const note = rows.length ? rows[0] : null;
    notesCache[ref] = note;
    return note;
  }

  async function sbSaveNote(ref, text) {
    if (!supabaseReady) return;
    const body = {
      referencia: ref,
      nota: text,
      autor: currentUser || 'Root',
      updated_at: new Date().toISOString()
    };
    await fetch(`${SUPABASE_URL}/rest/v1/notas_internas`, {
      method: 'POST',
      headers: {
        ...authHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(body)
    });
    notesCache[ref] = body;
  }

  async function saveNote(ref) {
    const ta  = document.getElementById('note-ta-' + ref);
    const btn = document.getElementById('note-save-' + ref);
    if (!ta) return;
    btn.textContent = 'Guardando…'; btn.disabled = true;
    await sbSaveNote(ref, ta.value.trim());
    notesCache[ref] = { nota: ta.value.trim(), autor: currentUser, updated_at: new Date().toISOString() };
    // Refresh note display in card
    const disp = document.getElementById('note-disp-' + ref);
    if (disp) {
      if (ta.value.trim()) {
        disp.innerHTML = `<div class="note-existing">${esc(ta.value.trim())}<div class="note-meta">✏️ ${currentUser} · ahora</div></div>`;
        disp.style.display = 'block';
      } else {
        disp.style.display = 'none';
      }
    }
    btn.textContent = '✅ Guardado'; btn.disabled = false;
    setTimeout(() => { btn.textContent = 'Guardar nota'; }, 2000);
  }

  function toggleNoteEdit(ref) {
    const area = document.getElementById('note-area-' + ref);
    if (!area) return;
    area.classList.toggle('show');
    if (area.classList.contains('show')) {
      document.getElementById('note-ta-' + ref)?.focus();
    }
  }

  function buildNotePanel(r) {
    const isRoot = currentRol === 'admin';
    const cached = notesCache[r.referencia];
    const hasNote = cached && cached.nota && cached.nota.trim();

    // All users see note if it exists
    const existingHtml = hasNote
      ? `<div class="note-existing" id="note-disp-${esc(r.referencia)}">${esc(cached.nota)}<div class="note-meta">✏️ ${esc(cached.autor||'Root')} · ${cached.updated_at ? new Date(cached.updated_at).toLocaleDateString('es') : ''}</div></div>`
      : `<div id="note-disp-${esc(r.referencia)}" style="display:none;"></div>`;

    // Only Root can edit/add
    const rootControls = isRoot ? `
      <button class="note-toggle-btn" onclick="toggleNoteEdit('${esc(r.referencia)}')">
        ✏️ ${hasNote ? 'Editar nota' : 'Añadir nota interna'}
      </button>
      <div class="note-root-area" id="note-area-${esc(r.referencia)}">
        <textarea class="note-textarea" id="note-ta-${esc(r.referencia)}"
          placeholder="Escribe una nota interna visible para todos los usuarios…">${hasNote ? esc(cached.nota) : ''}</textarea>
        <button class="note-save-btn" id="note-save-${esc(r.referencia)}"
          onclick="saveNote('${esc(r.referencia)}')">Guardar nota</button>
      </div>` : '';

    // Show panel only if Root OR there's a note to show
    if (!isRoot && !hasNote) return '';

    return `<div class="note-panel">
      <span class="note-panel-lbl">📝 Nota interna</span>
      ${existingHtml}
      ${rootControls}
    </div>`;
  }

  /* Pre-load notes for visible cards */
  async function prefetchNotes(refs) {
    if (!supabaseReady || !refs.length) return;
    const q = refs.map(r => `referencia=eq.${encodeURIComponent(r)}`).join(',');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/notas_internas?or=(${q})`,
      { headers: authHeaders() }
    );
    if (!res.ok) return;
    const rows = await res.json();
    rows.forEach(row => { notesCache[row.referencia] = row; });
  }


  /* ══ File parsing ══ */
  document.getElementById('fileInput').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    showStatus('ok', 'Leyendo archivo…');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
        let sh = wb.SheetNames.find(n => n.toLowerCase().includes('cartera activa')) || wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sh], { defval: '', raw: false, dateNF: 'dd/mm/yyyy' });
        if (!rows.length) { showStatus('err', 'El archivo está vacío.'); return; }
        data = rows.map(row => {
          const n = {};
          Object.keys(row).forEach(k => { n[k.toLowerCase().trim()] = row[k]; });
          return {
            referencia:         String(n['referencia']||'').trim(),
            socio:              String(n['socio']||'').trim(),
            departamento:       String(n['departamento']||'').trim(),
            inicio:             String(n['inicio']||'').trim(),
            vencimiento:        String(n['vencimiento']||'').trim(),
            ultimo_pago:        String(n['ultimo pago']||'').trim(),
            ultimo_año_de_pago: String(n['ultimo año de pago']||n['ultimo ano de pago']||'').trim(),
            notas:              String(n['notas']||n['status']||'').trim(),
          };
        }).filter(r => r.referencia);
        try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch(e) {}
        sbSaveExcel(data); // sync to cloud for all devices
        showStatus('ok', `✅ ${data.length} registros cargados y sincronizados ☁️ — "${sh}"`);
        document.getElementById('searchBtn').disabled = false;
        setChip(data.length);
        document.getElementById('resultsWrap').style.display = 'none';
        document.getElementById('emptyState').style.display = '';
      } catch(err) { showStatus('err', 'Error al leer el archivo.'); }
    };
    reader.readAsArrayBuffer(file);
  });

  /* ══ Search ══ */
