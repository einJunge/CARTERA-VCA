async function sbSaveExcel(jsonData) {
  if (!supabaseReady) return;
  await fetch(`${SUPABASE_URL}/rest/v1/excel_data`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
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
    headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(row)
  });
}

async function sbFetch() {
  if (!supabaseReady) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/consultas?order=created_at.desc&limit=500`, { headers: authHeaders() });
  return res.ok ? await res.json() : null;
}

async function sbDelete() {
  if (!supabaseReady) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/consultas?id=gte.0`, {
    method: 'DELETE',
    headers: { ...authHeaders(), 'Prefer': 'return=minimal' }
  });
  return res.ok;
}

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
  }, 30000);
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

const notesCache = {};
