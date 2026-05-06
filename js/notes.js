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
    headers: { ...authHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
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
  if (area.classList.contains('show')) document.getElementById('note-ta-' + ref)?.focus();
}

function buildNotePanel(r) {
  const isRoot = currentRol === 'admin';
  const cached = notesCache[r.referencia];
  const hasNote = cached && cached.nota && cached.nota.trim();

  const existingHtml = hasNote
    ? `<div class="note-existing" id="note-disp-${esc(r.referencia)}">${esc(cached.nota)}<div class="note-meta">✏️ ${esc(cached.autor||'Root')} · ${cached.updated_at ? new Date(cached.updated_at).toLocaleDateString('es') : ''}</div></div>`
    : `<div id="note-disp-${esc(r.referencia)}" style="display:none;"></div>`;

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

  if (!isRoot && !hasNote) return '';

  return `<div class="note-panel">
    <span class="note-panel-lbl">📝 Nota interna</span>
    ${existingHtml}
    ${rootControls}
  </div>`;
}

async function prefetchNotes(refs) {
  if (!supabaseReady || !refs.length) return;
  const q = refs.map(r => `referencia=eq.${encodeURIComponent(r)}`).join(',');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notas_internas?or=(${q})`, { headers: authHeaders() });
  if (!res.ok) return;
  const rows = await res.json();
  rows.forEach(row => { notesCache[row.referencia] = row; });
}

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
      sbSaveExcel(data);
      showStatus('ok', `✅ ${data.length} registros cargados y sincronizados ☁️ — "${sh}"`);
      document.getElementById('searchBtn').disabled = false;
      setChip(data.length);
      document.getElementById('resultsWrap').style.display = 'none';
      document.getElementById('emptyState').style.display = 'block';
    } catch(err) { showStatus('err', 'Error al leer el archivo.'); }
  };
  reader.readAsArrayBuffer(file);
});
