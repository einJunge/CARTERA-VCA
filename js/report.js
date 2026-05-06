async function loadReport() {
  const now = new Date();
  document.getElementById('reportDate').textContent =
    `Actualizado: ${now.toLocaleDateString('es')} · ${now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}`;

  const badge  = document.getElementById('syncBadge');
  const notice = document.getElementById('configNotice');

  if (!supabaseReady) {
    badge.className = 'sync-badge warn';
    badge.innerHTML = '<span class="sync-dot"></span> Pendiente de configurar';
    notice.style.display = 'block';
    document.getElementById('statTotal').textContent = '—';
    document.getElementById('statUnique').textContent = '—';
    document.getElementById('statNotFound').textContent = '—';
    document.getElementById('logList').innerHTML = `<div class="empty-log"><div class="ei">⚙️</div><p>Configura Supabase primero.</p></div>`;
    return;
  }

  notice.style.display = 'none';
  badge.className = 'sync-badge';
  badge.innerHTML = '<span class="sync-dot"></span> Sincronizado';

  const rows = await sbFetch();
  if (!rows) {
    document.getElementById('logList').innerHTML = `<div class="empty-log"><div class="ei">⚠️</div><p>Error al conectar con Supabase.</p></div>`;
    return;
  }

  const isAdmin = currentRol === 'admin';
  allRows = isAdmin ? rows : rows.filter(r => r.usuario === currentUser);

  const titleEl = document.getElementById('reportTitle');
  if (titleEl) titleEl.innerHTML = isAdmin
    ? 'Reporte <em>Global</em>'
    : `Mis <em>Consultas</em>`;

  const found    = allRows.filter(r => r.encontrado !== false);
  const notFound = allRows.filter(r => r.encontrado === false);
  document.getElementById('statTotal').textContent    = allRows.length;
  document.getElementById('statUnique').textContent   = new Set(found.map(r=>r.referencia)).size;
  document.getElementById('statNotFound').textContent = notFound.length;

  const sub = document.getElementById('statTotalSub');
  if (sub) sub.textContent = isAdmin ? 'todos los usuarios' : `solo ${currentUser}`;

  const filterUserRow = document.getElementById('filterUserRow');
  if (filterUserRow) filterUserRow.style.display = isAdmin ? '' : 'none';

  const reportActions = document.getElementById('reportActions');
  if (reportActions) reportActions.style.display = '';
  const btnPDF = document.getElementById('btnExportPDF');
  if (btnPDF) btnPDF.style.display = isAdmin ? '' : 'none';
  const clearReportBtn = document.querySelector('.danger-btn');
  if (clearReportBtn) clearReportBtn.style.display = isAdmin ? 'block' : 'none';

  const excelRow = await sbLoadExcel();
  if (excelRow) {
    const d2 = new Date(excelRow.updated_at);
    document.getElementById('statCloud').textContent    = '✅';
    document.getElementById('statCloudSub').textContent = `${excelRow.uploaded_by} · ${d2.toLocaleDateString('es')}`;
  } else {
    document.getElementById('statCloud').textContent    = '—';
    document.getElementById('statCloudSub').textContent = 'sin archivo';
  }

  applyFilters();
}

function applyFilters() {
  if (!allRows.length) return;
  const isAdmin = currentRol === 'admin';
  const fUser   = isAdmin ? (document.getElementById('filterUser')?.value || '') : currentUser;
  const fResult = document.getElementById('filterResult')?.value || '';
  const fFrom   = document.getElementById('filterFrom')?.value   || '';
  const fTo     = document.getElementById('filterTo')?.value     || '';
  const fSearch = (document.getElementById('filterSearch')?.value || '').trim().toLowerCase();

  let filtered = allRows.filter(r => {
    if (fUser && r.usuario !== fUser) return false;
    if (fResult === 'found'    && r.encontrado === false) return false;
    if (fResult === 'notfound' && r.encontrado !== false) return false;
    if (fFrom) { const d=new Date(r.created_at),from=new Date(fFrom); from.setHours(0,0,0,0); if(d<from) return false; }
    if (fTo)   { const d=new Date(r.created_at),to=new Date(fTo); to.setHours(23,59,59,999); if(d>to) return false; }
    if (fSearch) {
      const ref=(r.referencia||'').toLowerCase(), s=(r.socio||'').toLowerCase();
      if (!ref.includes(fSearch) && !s.includes(fSearch)) return false;
    }
    return true;
  });

  const count = document.getElementById('filterCount');
  const hasFilter = fUser||fResult||fFrom||fTo||fSearch;
  count.textContent = hasFilter ? `${filtered.length} de ${allRows.length} registros` : '';
  renderLog(filtered);
}

function clearFilters() {
  ['filterUser','filterResult','filterFrom','filterTo','filterSearch'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('filterCount').textContent = '';
  renderLog(allRows);
}

function renderLog(rows) {
  const list = document.getElementById('logList');
  if (!rows.length) {
    list.innerHTML = `<div class="empty-log"><div class="ei">📋</div><p>No hay registros que coincidan.</p></div>`;
    return;
  }
  list.innerHTML = rows.map((r,i) => {
    const d  = new Date(r.created_at);
    const nf = r.encontrado === false;
    return `
    <div class="log-item ${nf?'log-nf':''}" style="animation-delay:${Math.min(i,20)*.025}s">
      <div class="log-num ${nf?'log-num-nf':''}">${nf?'✗':(i+1)}</div>
      <div class="log-info">
        <div class="log-name">${esc(r.socio||'—')}</div>
        <div class="log-ref">${esc(r.referencia||'—')} ${nf?'<span class="nf-tag">No encontrado</span>':''}</div>
      </div>
      <div class="log-meta">
        <div>${d.toLocaleDateString('es')}</div>
        <div>${d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</div>
        <div class="log-who">👤 ${esc(r.usuario||'—')}</div>
      </div>
    </div>`;
  }).join('');
}

function getFilteredOrAll() {
  const fUser   = document.getElementById('filterUser')?.value   || '';
  const fResult = document.getElementById('filterResult')?.value || '';
  const fFrom   = document.getElementById('filterFrom')?.value   || '';
  const fTo     = document.getElementById('filterTo')?.value     || '';
  const fSearch = (document.getElementById('filterSearch')?.value || '').trim().toLowerCase();
  const hasFilter = fUser || fResult || fFrom || fTo || fSearch;
  if (!hasFilter) return allRows;
  return allRows.filter(r => {
    if (fUser   && r.usuario !== fUser) return false;
    if (fResult === 'found'    && r.encontrado === false) return false;
    if (fResult === 'notfound' && r.encontrado !== false) return false;
    if (fFrom) { const d=new Date(r.created_at),from=new Date(fFrom); from.setHours(0,0,0,0); if(d<from) return false; }
    if (fTo)   { const d=new Date(r.created_at),to=new Date(fTo); to.setHours(23,59,59,999); if(d>to) return false; }
    if (fSearch) { const ref=(r.referencia||'').toLowerCase(),s=(r.socio||'').toLowerCase(); if(!ref.includes(fSearch)&&!s.includes(fSearch)) return false; }
    return true;
  });
}

async function exportPDF() {
  const rows = getFilteredOrAll();
  if (!rows.length) { alert('No hay datos para exportar.'); return; }
  const now = new Date();
  const dateStr = now.toLocaleDateString('es') + ' ' + now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
  const found    = rows.filter(r => r.encontrado !== false);
  const notFound = rows.filter(r => r.encontrado === false);

  const rowsHTML = rows.map((r,i) => {
    const d = new Date(r.created_at);
    const nf = r.encontrado === false;
    return `<tr style="${nf?'background:#fff8f7;':''}">
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;">${i+1}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;${nf?'color:#b53326;':''}">
        ${esc(r.socio||'—')} ${nf?'<span style="background:#fdf1f0;color:#b53326;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700;">No encontrado</span>':''}
      </td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;">${esc(r.referencia||'—')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;">${esc(r.usuario||'—')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;">${d.toLocaleDateString('es')} ${d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Reporte Cartera VCA</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 30px; color: #0d1f3a; }
    .header { display:flex; align-items:center; gap:20px; margin-bottom:24px; border-bottom:3px solid #0a1628; padding-bottom:16px; }
    .header img { height:60px; }
    .header-text h1 { font-size:20px; margin:0; color:#0a1628; }
    .header-text p  { font-size:12px; color:#555577; margin:3px 0 0; }
    .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
    .stat { background:#f4f7ff; border-radius:8px; padding:12px 14px; border:1px solid #dcdce8; }
    .stat .lbl { font-size:9px; font-weight:700; color:#555577; text-transform:uppercase; letter-spacing:.8px; }
    .stat .val { font-size:22px; font-weight:700; color:#0a1628; margin-top:2px; }
    table { width:100%; border-collapse:collapse; }
    th { background:#0a1628; color:white; padding:8px 10px; font-size:10px; text-align:left; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
    tr:nth-child(even) { background:#f5f5f5; }
    .footer { margin-top:20px; font-size:10px; color:#555577; text-align:center; border-top:1px solid #dcdce8; padding-top:10px; }
  </style></head><body>
  <div class="header">
    <img src="https://vcaofamerica.com/wp-content/uploads/2016/07/logo-png.png" onerror="this.style.display='none'"/>
    <div class="header-text">
      <h1>Reporte de Consultas — Cartera Activa</h1>
      <p>Vacation Club of America · Generado: ${dateStr} · Usuario: ${currentUser||'—'}</p>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="lbl">Total consultas</div><div class="val">${rows.length}</div></div>
    <div class="stat"><div class="lbl">Encontrados</div><div class="val">${found.length}</div></div>
    <div class="stat"><div class="lbl">No encontrados</div><div class="val" style="color:#b53326">${notFound.length}</div></div>
    <div class="stat"><div class="lbl">Socios únicos</div><div class="val">${new Set(found.map(r=>r.referencia)).size}</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Socio</th><th>Referencia</th><th>Usuario</th><th>Fecha y hora</th></tr></thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="footer">Vacation Club of America · Sistema Cartera Activa · ${dateStr}</div>
  </body></html>`;

  const blob = new Blob([html], {type:'text/html'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `Reporte_VCA_${now.toISOString().slice(0,10)}.html`;
  a.click(); URL.revokeObjectURL(url);
}

async function printReport() {
  const rows = getFilteredOrAll();
  if (!rows.length) { alert('No hay datos para imprimir.'); return; }
  const now = new Date();
  const dateStr = now.toLocaleDateString('es') + ' ' + now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
  const found    = rows.filter(r => r.encontrado !== false);
  const notFound = rows.filter(r => r.encontrado === false);

  const rowsHTML = rows.map((r,i) => {
    const d = new Date(r.created_at);
    const nf = r.encontrado === false;
    return `<tr>
      <td>${i+1}</td>
      <td style="${nf?'color:#b53326;font-weight:600;':''}">${esc(r.socio||'—')}${nf?' ⚠':''}</td>
      <td>${esc(r.referencia||'—')}</td>
      <td>${esc(r.usuario||'—')}</td>
      <td>${d.toLocaleDateString('es')} ${d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</td>
    </tr>`;
  }).join('');

  const w = window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Reporte VCA</title>
  <style>
    body { font-family:Arial,sans-serif; margin:20px; font-size:11px; color:#0d1f3a; }
    h1 { font-size:16px; margin:0 0 4px; }
    .sub { font-size:10px; color:#555577; margin-bottom:16px; }
    .stats { display:flex; gap:20px; margin-bottom:14px; }
    .stat { background:#f4f7ff; border-radius:6px; padding:8px 12px; border:1px solid #dcdce8; }
    .stat .lbl { font-size:8px; font-weight:700; color:#555577; text-transform:uppercase; }
    .stat .val { font-size:18px; font-weight:700; color:#0a1628; }
    table { width:100%; border-collapse:collapse; }
    th { background:#0a1628; color:white; padding:6px 8px; font-size:9px; text-align:left; }
    td { padding:5px 8px; border-bottom:1px solid #eee; font-size:10px; }
    tr:nth-child(even) td { background:#f5f5f5; }
    .footer { margin-top:14px; font-size:9px; color:#888; text-align:center; border-top:1px solid #eee; padding-top:8px; }
  </style></head><body>
  <h1>Reporte de Consultas — Cartera Activa VCA</h1>
  <div class="sub">Generado: ${dateStr} · Usuario: ${currentUser||'—'}</div>
  <div class="stats">
    <div class="stat"><div class="lbl">Total</div><div class="val">${rows.length}</div></div>
    <div class="stat"><div class="lbl">Encontrados</div><div class="val">${found.length}</div></div>
    <div class="stat"><div class="lbl">No encontrados</div><div class="val" style="color:#b53326">${notFound.length}</div></div>
    <div class="stat"><div class="lbl">Socios únicos</div><div class="val">${new Set(found.map(r=>r.referencia)).size}</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Socio</th><th>Referencia</th><th>Usuario</th><th>Fecha y hora</th></tr></thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="footer">Vacation Club of America · Sistema Cartera Activa · ${dateStr}</div>
  <script>window.onload=()=>window.print()<\/script>
  </body></html>`);
  w.document.close();
}

function switchTab(tab) {
  document.querySelectorAll('#screenReport .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#screenReport .tab-pane').forEach(p => p.classList.remove('active'));
  const btn = document.getElementById('tab-' + tab);
  const pane = document.getElementById('pane-' + tab);
  if (btn)  btn.classList.add('active');
  if (pane) pane.classList.add('active');
}
