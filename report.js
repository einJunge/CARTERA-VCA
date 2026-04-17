/* Cartera Activa VCA — report.js */

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

    allRows = rows;
    const found    = rows.filter(r => r.encontrado !== false);
    const notFound = rows.filter(r => r.encontrado === false);
    document.getElementById('statTotal').textContent    = rows.length;
    document.getElementById('statUnique').textContent   = new Set(found.map(r=>r.referencia)).size;
    document.getElementById('statNotFound').textContent = notFound.length;

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
    const fUser   = document.getElementById('filterUser')?.value   || '';
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

  /* ══ PDF & Print ══ */
  function getFilteredOrAll() {
    // If filters active, export what's currently visible
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
      if (fTo)   { const d=new Date(r.created_at),to=new Date(fTo);     to.setHours(23,59,59,999); if(d>to) return false; }
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

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Reporte Cartera VCA</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 30px; color: #0d1f3a; }
      .header { display:flex; align-items:center; gap:20px; margin-bottom:24px; border-bottom:3px solid #0a1628; padding-bottom:16px; }
      .header img { height:60px; }
      .header-text h1 { font-size:20px; margin:0; color:#0a1628; }
      .header-text p  { font-size:12px; color:#526282; margin:3px 0 0; }
      .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
      .stat { background:#f4f7ff; border-radius:8px; padding:12px 14px; border:1px solid #e0e8f5; }
      .stat .lbl { font-size:9px; font-weight:700; color:#526282; text-transform:uppercase; letter-spacing:.8px; }
      .stat .val { font-size:22px; font-weight:700; color:#0a1628; margin-top:2px; }
      table { width:100%; border-collapse:collapse; }
      th { background:#0a1628; color:white; padding:8px 10px; font-size:10px; text-align:left; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
      tr:nth-child(even) { background:#f8f9fc; }
      .footer { margin-top:20px; font-size:10px; color:#526282; text-align:center; border-top:1px solid #e0e8f5; padding-top:10px; }
      .filter-card { background:var(--surface); border-radius:var(--r20); border:1.5px solid var(--border); padding:18px 18px 14px; box-shadow:var(--sh); }
    .filter-title { font-family:'Cormorant Garamond',serif; font-size:1rem; font-weight:700; color:var(--text); margin-bottom:14px; }
    .filter-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
    .filter-group { display:flex; flex-direction:column; gap:5px; }
    .filter-lbl { font-size:.68rem; font-weight:700; color:var(--sub); text-transform:uppercase; letter-spacing:.7px; }
    .filter-card select, .filter-card input[type="date"], .filter-card input[type="text"] {
      height:42px; padding:0 12px; font-family:'Outfit',sans-serif; font-size:.85rem; font-weight:500;
      color:var(--text); background:var(--mist); border:1.5px solid var(--border);
      border-radius:var(--r10); outline:none; -webkit-appearance:none; appearance:none; width:100%;
    }
    .filter-card select:focus, .filter-card input:focus { border-color:var(--sky); background:white; }
    .filter-count { font-size:.76rem; color:var(--sub); font-weight:600; }
    #resBuscarBtn { height:54px; width:54px; flex-shrink:0; background:linear-gradient(135deg,var(--navy),var(--sky)); color:white; border:none; border-radius:var(--r14); font-size:1.3rem; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 18px rgba(21,73,160,.35); transition:transform .1s; }
    #resBuscarBtn:active { transform:scale(.92); }
    .filter-clear-btn { background:transparent; border:1.5px solid var(--border); border-radius:var(--r10); padding:6px 14px; font-size:.76rem; font-weight:700; color:var(--sub); cursor:pointer; font-family:'Outfit',sans-serif; }
    .filter-clear-btn:active { background:var(--mist); }

    #accessToast {
      position:fixed; bottom:calc(var(--safe-bot) + 24px); left:50%; transform:translateX(-50%) translateY(20px);
      background:var(--ink); color:white; border-radius:30px; padding:11px 20px;
      font-size:.82rem; font-weight:600; white-space:nowrap; z-index:9999;
      opacity:0; transition:opacity .25s, transform .25s; pointer-events:none;
      box-shadow:0 4px 20px rgba(0,0,0,.35);
    }
    #accessToast.show { opacity:1; transform:translateX(-50%) translateY(0); }

    /* ── Excel update banner ── */
    #excelUpdateBanner {
      display:none; position:sticky; top:0; z-index:200;
      background:linear-gradient(135deg,#0f6e56,#1d9e75);
      padding:11px 16px; align-items:center; gap:10px; color:white; font-size:.82rem;
    }
    #excelUpdateBanner.show { display:flex; }
    #excelUpdateBanner span { flex:1; line-height:1.4; font-weight:500; }
    .update-reload-btn { background:white; color:#0f6e56; border:none; border-radius:8px; padding:7px 14px; font-size:.78rem; font-weight:700; cursor:pointer; font-family:'Outfit',sans-serif; flex-shrink:0; }
    .update-dismiss-btn { background:transparent; color:rgba(255,255,255,.65); border:none; font-size:1.1rem; cursor:pointer; padding:2px 6px; }

    /* ── Notes panel ── */
    .note-panel { padding:0 20px 18px; border-top:1px solid var(--border); margin-top:4px; }
    .note-panel-lbl { font-size:.65rem; font-weight:700; color:var(--sub); text-transform:uppercase; letter-spacing:.8px; margin:12px 0 7px; display:block; }
    .note-existing { background:var(--mist); border-radius:var(--r10); padding:10px 13px; font-size:.85rem; color:var(--text); line-height:1.5; border:1px solid var(--border); margin-bottom:8px; white-space:pre-wrap; }
    .note-existing .note-meta { font-size:.68rem; color:var(--sub); margin-top:6px; font-style:italic; }
    .note-root-area { display:none; flex-direction:column; gap:8px; }
    .note-root-area.show { display:flex; }
    .note-textarea { width:100%; min-height:72px; padding:10px 13px; font-family:'Outfit',sans-serif; font-size:.85rem; color:var(--text); background:var(--mist); border:1.5px solid var(--border); border-radius:var(--r10); outline:none; resize:vertical; -webkit-appearance:none; }
    .note-textarea:focus { border-color:var(--sky); background:white; }
    .note-save-btn { background:linear-gradient(135deg,var(--navy),var(--sky)); color:white; border:none; border-radius:var(--r10); padding:9px 18px; font-family:'Outfit',sans-serif; font-size:.82rem; font-weight:700; cursor:pointer; align-self:flex-end; box-shadow:0 3px 12px rgba(21,73,160,.3); }
    .note-save-btn:active { transform:scale(.96); }
    .note-toggle-btn { background:transparent; border:1.5px solid var(--border); border-radius:var(--r10); padding:7px 14px; font-family:'Outfit',sans-serif; font-size:.76rem; font-weight:600; color:var(--royal); cursor:pointer; display:flex; align-items:center; gap:6px; }
    .note-toggle-btn:active { background:var(--mist); }


    /* ── Tab nav ── */
    .tab-nav { display:flex; gap:6px; margin-bottom:2px; }
    .tab-btn {
      flex:1; padding:10px 6px; border:1.5px solid var(--border);
      border-radius:var(--r10); background:var(--surface);
      font-family:'Outfit',sans-serif; font-size:.78rem; font-weight:700;
      color:var(--sub); cursor:pointer; transition:all .15s; text-align:center;
    }
    .tab-btn.active { background:var(--navy); color:white; border-color:var(--navy); }
    .tab-btn:active { transform:scale(.97); }
    .tab-pane { display:none; flex-direction:column; gap:14px; }
    .tab-pane.active { display:flex; }

    /* ── User management ── */
    .user-card {
      background:var(--surface); border-radius:var(--r14);
      border:1.5px solid var(--border); box-shadow:0 2px 10px rgba(8,21,41,.06);
      padding:14px 16px; display:flex; align-items:center; gap:12px;
      animation: popIn .2s cubic-bezier(.22,1,.36,1) both;
    }
    .uc-avatar {
      width:42px; height:42px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-size:1.05rem; font-weight:800; color:white; flex-shrink:0;
    }
    .uc-info { flex:1; min-width:0; }
    .uc-name  { font-size:.92rem; font-weight:700; color:var(--text); }
    .uc-email { font-size:.72rem; color:var(--sub); margin-top:2px; }
    .uc-role  { font-size:.65rem; font-weight:700; padding:2px 8px; border-radius:20px; margin-top:3px; display:inline-block; }
    .uc-role.admin   { background:#fff8e6; color:#7a5800; border:1px solid #f0d080; }
    .uc-role.usuario { background:var(--light); color:var(--royal); border:1px solid #c8dbf8; }
    .uc-actions { display:flex; gap:7px; flex-shrink:0; }
    .uc-btn { background:var(--mist); border:1.5px solid var(--border); border-radius:8px; padding:7px 11px; font-size:.75rem; font-weight:700; cursor:pointer; font-family:'Outfit',sans-serif; color:var(--text); }
    .uc-btn:active { background:#dce8ff; }
    .uc-btn.del { background:#fdf1f0; border-color:#f4beb8; color:#b53326; }
    .uc-btn.del:active { background:#fce8e6; }

    /* ── User form ── */
    .user-form {
      background:var(--surface); border-radius:var(--r20);
      border:1.5px solid var(--border); box-shadow:var(--sh); padding:18px 18px 16px;
    }
    .user-form h3 { font-family:'Cormorant Garamond',serif; font-size:1.05rem; font-weight:700; color:var(--text); margin-bottom:14px; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .form-group { display:flex; flex-direction:column; gap:5px; }
    .form-group.full { grid-column:1/-1; }
    .form-group label { font-size:.68rem; font-weight:700; color:var(--sub); text-transform:uppercase; letter-spacing:.7px; }
    .form-input {
      height:44px; padding:0 13px;
      font-family:'Outfit',sans-serif; font-size:.88rem; font-weight:500; color:var(--text);
      background:var(--mist); border:1.5px solid var(--border); border-radius:var(--r10);
      outline:none; -webkit-appearance:none; transition:border-color .15s;
    }
    .form-input:focus { border-color:var(--sky); background:white; }
    .form-select { height:44px; padding:0 13px; font-family:'Outfit',sans-serif; font-size:.88rem; font-weight:500; color:var(--text); background:var(--mist); border:1.5px solid var(--border); border-radius:var(--r10); outline:none; -webkit-appearance:none; appearance:none; }
    .form-msg { font-size:.78rem; font-weight:600; padding:8px 12px; border-radius:8px; display:none; }
    .form-msg.ok   { background:#e8f5ee; color:#166842; display:block; }
    .form-msg.info { background:#e8f0fe; color:#1a4a8a; display:block; border:1px solid #c8dbf8; }
    .form-msg.err { background:#fdf1f0; color:#b53326; display:block; }
    .form-save-btn {
      background:linear-gradient(135deg,var(--navy),var(--sky));
      color:white; border:none; border-radius:var(--r10);
      padding:12px 20px; font-family:'Outfit',sans-serif;
      font-size:.88rem; font-weight:700; cursor:pointer;
      box-shadow:0 3px 12px rgba(21,73,160,.3); transition:transform .1s;
      width:100%; margin-top:4px;
    }
    .form-save-btn:active { transform:scale(.97); }

    @

/* Desktop normal layout */
@media (min-width: 900px) {
  .hero-inner, .body-scroll, .report-body, .report-hero-inner {
    max-width: 1160px;
    margin: 0 auto;
  }
  .screen {
    overflow-y: auto;
  }
}
@media (min-width: 1200px) {
  .hero-inner, .body-scroll, .report-body, .report-hero-inner {
    max-width: 1300px;
  }
}

media print { body { margin:15px; } }
    
@media (max-width: 768px) {
  #cpane-socios,
  #cpane-nuevo {
    width: 100% !important;
    min-width: 0 !important;
    overflow-x: hidden !important;
  }

  #cpane-socios .section-stack,
  #cpane-nuevo .section-stack,
  #cpane-socios .split-two,
  #cpane-nuevo .split-two,
  #cpane-socios .socios-grid,
  #cpane-nuevo .socios-grid {
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
  }

  #cpane-socios .socios-search-card,
  #cpane-socios .socios-form,
  #cpane-socios .socios-detail-card,
  #cpane-socios .socios-pay-card,
  #cpane-nuevo .socios-form,
  #cpane-nuevo .socios-search-card,
  #cpane-nuevo .socios-detail-card,
  #cpane-nuevo .socios-pay-card {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
    padding: 14px 12px 13px !important;
  }

  #cpane-socios .socios-form-grid,
  #cpane-socios .socios-pay-grid,
  #cpane-nuevo .socios-form-grid,
  #cpane-nuevo .socios-pay-grid,
  #cpane-nuevo .form-grid,
  #cpane-socios .form-grid {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 10px !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  #cpane-socios .form-group,
  #cpane-nuevo .form-group,
  #cpane-socios .filter-group,
  #cpane-nuevo .filter-group {
    width: 100% !important;
    min-width: 0 !important;
  }

  #cpane-socios .form-group.full,
  #cpane-nuevo .form-group.full {
    grid-column: 1 / -1 !important;
  }

  #cpane-socios input,
  #cpane-socios select,
  #cpane-socios textarea,
  #cpane-nuevo input,
  #cpane-nuevo select,
  #cpane-nuevo textarea {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }

  #cpane-socios .socios-toolbar,
  #cpane-socios .socios-actions,
  #cpane-nuevo .socios-actions,
  #cpane-socios .action-row,
  #cpane-nuevo .action-row,
  #cpane-socios .filter-row,
  #cpane-nuevo .filter-row,
  #cpane-socios .stats-grid,
  #cpane-nuevo .stats-grid {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 10px !important;
    width: 100% !important;
  }

  #cpane-socios .socio-card,
  #cpane-socios .user-card,
  #cpane-socios .log-item {
    width: 100% !important;
    min-width: 0 !important;
    align-items: flex-start !important;
  }

  #cpane-socios .socio-actions,
  #cpane-socios .uc-actions,
  #cpane-nuevo .socio-actions,
  #cpane-nuevo .uc-actions {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 8px !important;
  }

  #cpane-socios .socio-actions .uc-btn,
  #cpane-socios .uc-actions .uc-btn,
  #cpane-nuevo .socio-actions .uc-btn,
  #cpane-nuevo .uc-actions .uc-btn {
    width: 100% !important;
  }
}

</style></head><body>
    <div class="header">
      <img src="https://vcaofamerica.com/wp-content/uploads/2016/07/logo-png.png" onerror="this.style.display='none'" />
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
    a.href = url;
    a.download = `Reporte_VCA_${now.toISOString().slice(0,10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
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
        <td style="${nf?'color:#b53326;font-weight:600;':''}">${esc(r.socio||'—')}${nf?' ⚠':''}
        </td>
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
      .sub { font-size:10px; color:#526282; margin-bottom:16px; }
      .stats { display:flex; gap:20px; margin-bottom:14px; }
      .stat { background:#f4f7ff; border-radius:6px; padding:8px 12px; border:1px solid #e0e8f5; }
      .stat .lbl { font-size:8px; font-weight:700; color:#526282; text-transform:uppercase; }
      .stat .val { font-size:18px; font-weight:700; color:#0a1628; }
      table { width:100%; border-collapse:collapse; }
      th { background:#0a1628; color:white; padding:6px 8px; font-size:9px; text-align:left; }
      td { padding:5px 8px; border-bottom:1px solid #eee; font-size:10px; }
      tr:nth-child(even) td { background:#f8f9fc; }
      .footer { margin-top:14px; font-size:9px; color:#888; text-align:center; border-top:1px solid #eee; padding-top:8px; }
      .filter-card { background:var(--surface); border-radius:var(--r20); border:1.5px solid var(--border); padding:18px 18px 14px; box-shadow:var(--sh); }
    .filter-title { font-family:'Cormorant Garamond',serif; font-size:1rem; font-weight:700; color:var(--text); margin-bottom:14px; }
    .filter-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
    .filter-group { display:flex; flex-direction:column; gap:5px; }
    .filter-lbl { font-size:.68rem; font-weight:700; color:var(--sub); text-transform:uppercase; letter-spacing:.7px; }
    .filter-card select, .filter-card input[type="date"], .filter-card input[type="text"] {
      height:42px; padding:0 12px; font-family:'Outfit',sans-serif; font-size:.85rem; font-weight:500;
      color:var(--text); background:var(--mist); border:1.5px solid var(--border);
      border-radius:var(--r10); outline:none; -webkit-appearance:none; appearance:none; width:100%;
    }
    .filter-card select:focus, .filter-card input:focus { border-color:var(--sky); background:white; }
    .filter-count { font-size:.76rem; color:var(--sub); font-weight:600; }
    #resBuscarBtn { height:54px; width:54px; flex-shrink:0; background:linear-gradient(135deg,var(--navy),var(--sky)); color:white; border:none; border-radius:var(--r14); font-size:1.3rem; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 18px rgba(21,73,160,.35); transition:transform .1s; }
    #resBuscarBtn:active { transform:scale(.92); }
    .filter-clear-btn { background:transparent; border:1.5px solid var(--border); border-radius:var(--r10); padding:6px 14px; font-size:.76rem; font-weight:700; color:var(--sub); cursor:pointer; font-family:'Outfit',sans-serif; }
    .filter-clear-btn:active { background:var(--mist); }

    #accessToast {
      position:fixed; bottom:calc(var(--safe-bot) + 24px); left:50%; transform:translateX(-50%) translateY(20px);
      background:var(--ink); color:white; border-radius:30px; padding:11px 20px;
      font-size:.82rem; font-weight:600; white-space:nowrap; z-index:9999;
      opacity:0; transition:opacity .25s, transform .25s; pointer-events:none;
      box-shadow:0 4px 20px rgba(0,0,0,.35);
    }
    #accessToast.show { opacity:1; transform:translateX(-50%) translateY(0); }

    /* ── Excel update banner ── */
    #excelUpdateBanner {
      display:none; position:sticky; top:0; z-index:200;
      background:linear-gradient(135deg,#0f6e56,#1d9e75);
      padding:11px 16px; align-items:center; gap:10px; color:white; font-size:.82rem;
    }
    #excelUpdateBanner.show { display:flex; }
    #excelUpdateBanner span { flex:1; line-height:1.4; font-weight:500; }
    .update-reload-btn { background:white; color:#0f6e56; border:none; border-radius:8px; padding:7px 14px; font-size:.78rem; font-weight:700; cursor:pointer; font-family:'Outfit',sans-serif; flex-shrink:0; }
    .update-dismiss-btn { background:transparent; color:rgba(255,255,255,.65); border:none; font-size:1.1rem; cursor:pointer; padding:2px 6px; }

    /* ── Notes panel ── */
    .note-panel { padding:0 20px 18px; border-top:1px solid var(--border); margin-top:4px; }
    .note-panel-lbl { font-size:.65rem; font-weight:700; color:var(--sub); text-transform:uppercase; letter-spacing:.8px; margin:12px 0 7px; display:block; }
    .note-existing { background:var(--mist); border-radius:var(--r10); padding:10px 13px; font-size:.85rem; color:var(--text); line-height:1.5; border:1px solid var(--border); margin-bottom:8px; white-space:pre-wrap; }
    .note-existing .note-meta { font-size:.68rem; color:var(--sub); margin-top:6px; font-style:italic; }
    .note-root-area { display:none; flex-direction:column; gap:8px; }
    .note-root-area.show { display:flex; }
    .note-textarea { width:100%; min-height:72px; padding:10px 13px; font-family:'Outfit',sans-serif; font-size:.85rem; color:var(--text); background:var(--mist); border:1.5px solid var(--border); border-radius:var(--r10); outline:none; resize:vertical; -webkit-appearance:none; }
    .note-textarea:focus { border-color:var(--sky); background:white; }
    .note-save-btn { background:linear-gradient(135deg,var(--navy),var(--sky)); color:white; border:none; border-radius:var(--r10); padding:9px 18px; font-family:'Outfit',sans-serif; font-size:.82rem; font-weight:700; cursor:pointer; align-self:flex-end; box-shadow:0 3px 12px rgba(21,73,160,.3); }
    .note-save-btn:active { transform:scale(.96); }
    .note-toggle-btn { background:transparent; border:1.5px solid var(--border); border-radius:var(--r10); padding:7px 14px; font-family:'Outfit',sans-serif; font-size:.76rem; font-weight:600; color:var(--royal); cursor:pointer; display:flex; align-items:center; gap:6px; }
    .note-toggle-btn:active { background:var(--mist); }


    /* ── Tab nav ── */
    .tab-nav { display:flex; gap:6px; margin-bottom:2px; }
    .tab-btn {
      flex:1; padding:10px 6px; border:1.5px solid var(--border);
      border-radius:var(--r10); background:var(--surface);
      font-family:'Outfit',sans-serif; font-size:.78rem; font-weight:700;
      color:var(--sub); cursor:pointer; transition:all .15s; text-align:center;
    }
    .tab-btn.active { background:var(--navy); color:white; border-color:var(--navy); }
    .tab-btn:active { transform:scale(.97); }
    .tab-pane { display:none; flex-direction:column; gap:14px; }
    .tab-pane.active { display:flex; }

    /* ── User management ── */
    .user-card {
      background:var(--surface); border-radius:var(--r14);
      border:1.5px solid var(--border); box-shadow:0 2px 10px rgba(8,21,41,.06);
      padding:14px 16px; display:flex; align-items:center; gap:12px;
      animation: popIn .2s cubic-bezier(.22,1,.36,1) both;
    }
    .uc-avatar {
      width:42px; height:42px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-size:1.05rem; font-weight:800; color:white; flex-shrink:0;
    }
    .uc-info { flex:1; min-width:0; }
    .uc-name  { font-size:.92rem; font-weight:700; color:var(--text); }
    .uc-email { font-size:.72rem; color:var(--sub); margin-top:2px; }
    .uc-role  { font-size:.65rem; font-weight:700; padding:2px 8px; border-radius:20px; margin-top:3px; display:inline-block; }
    .uc-role.admin   { background:#fff8e6; color:#7a5800; border:1px solid #f0d080; }
    .uc-role.usuario { background:var(--light); color:var(--royal); border:1px solid #c8dbf8; }
    .uc-actions { display:flex; gap:7px; flex-shrink:0; }
    .uc-btn { background:var(--mist); border:1.5px solid var(--border); border-radius:8px; padding:7px 11px; font-size:.75rem; font-weight:700; cursor:pointer; font-family:'Outfit',sans-serif; color:var(--text); }
    .uc-btn:active { background:#dce8ff; }
    .uc-btn.del { background:#fdf1f0; border-color:#f4beb8; color:#b53326; }
    .uc-btn.del:active { background:#fce8e6; }

    /* ── User form ── */
    .user-form {
      background:var(--surface); border-radius:var(--r20);
      border:1.5px solid var(--border); box-shadow:var(--sh); padding:18px 18px 16px;
    }
    .user-form h3 { font-family:'Cormorant Garamond',serif; font-size:1.05rem; font-weight:700; color:var(--text); margin-bottom:14px; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .form-group { display:flex; flex-direction:column; gap:5px; }
    .form-group.full { grid-column:1/-1; }
    .form-group label { font-size:.68rem; font-weight:700; color:var(--sub); text-transform:uppercase; letter-spacing:.7px; }
    .form-input {
      height:44px; padding:0 13px;
      font-family:'Outfit',sans-serif; font-size:.88rem; font-weight:500; color:var(--text);
      background:var(--mist); border:1.5px solid var(--border); border-radius:var(--r10);
      outline:none; -webkit-appearance:none; transition:border-color .15s;
    }
    .form-input:focus { border-color:var(--sky); background:white; }
    .form-select { height:44px; padding:0 13px; font-family:'Outfit',sans-serif; font-size:.88rem; font-weight:500; color:var(--text); background:var(--mist); border:1.5px solid var(--border); border-radius:var(--r10); outline:none; -webkit-appearance:none; appearance:none; }
    .form-msg { font-size:.78rem; font-weight:600; padding:8px 12px; border-radius:8px; display:none; }
    .form-msg.ok   { background:#e8f5ee; color:#166842; display:block; }
    .form-msg.info { background:#e8f0fe; color:#1a4a8a; display:block; border:1px solid #c8dbf8; }
    .form-msg.err { background:#fdf1f0; color:#b53326; display:block; }
    .form-save-btn {
      background:linear-gradient(135deg,var(--navy),var(--sky));
      color:white; border:none; border-radius:var(--r10);
      padding:12px 20px; font-family:'Outfit',sans-serif;
      font-size:.88rem; font-weight:700; cursor:pointer;
      box-shadow:0 3px 12px rgba(21,73,160,.3); transition:transform .1s;
      width:100%; margin-top:4px;
    }
    .form-save-btn:active { transform:scale(.97); }

    @

/* Desktop normal layout */
@media (min-width: 900px) {
  .hero-inner, .body-scroll, .report-body, .report-hero-inner {
    max-width: 1160px;
    margin: 0 auto;
  }
  .screen {
    overflow-y: auto;
  }
}
@media (min-width: 1200px) {
  .hero-inner, .body-scroll, .report-body, .report-hero-inner {
    max-width: 1300px;
  }
}

media print { button { display:none; } }
    
@media (max-width: 768px) {
  #cpane-socios,
  #cpane-nuevo {
    width: 100% !important;
    min-width: 0 !important;
    overflow-x: hidden !important;
  }

  #cpane-socios .section-stack,
  #cpane-nuevo .section-stack,
  #cpane-socios .split-two,
  #cpane-nuevo .split-two,
  #cpane-socios .socios-grid,
  #cpane-nuevo .socios-grid {
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
  }

  #cpane-socios .socios-search-card,
  #cpane-socios .socios-form,
  #cpane-socios .socios-detail-card,
  #cpane-socios .socios-pay-card,
  #cpane-nuevo .socios-form,
  #cpane-nuevo .socios-search-card,
  #cpane-nuevo .socios-detail-card,
  #cpane-nuevo .socios-pay-card {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
    padding: 14px 12px 13px !important;
  }

  #cpane-socios .socios-form-grid,
  #cpane-socios .socios-pay-grid,
  #cpane-nuevo .socios-form-grid,
  #cpane-nuevo .socios-pay-grid,
  #cpane-nuevo .form-grid,
  #cpane-socios .form-grid {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 10px !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  #cpane-socios .form-group,
  #cpane-nuevo .form-group,
  #cpane-socios .filter-group,
  #cpane-nuevo .filter-group {
    width: 100% !important;
    min-width: 0 !important;
  }

  #cpane-socios .form-group.full,
  #cpane-nuevo .form-group.full {
    grid-column: 1 / -1 !important;
  }

  #cpane-socios input,
  #cpane-socios select,
  #cpane-socios textarea,
  #cpane-nuevo input,
  #cpane-nuevo select,
  #cpane-nuevo textarea {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }

  #cpane-socios .socios-toolbar,
  #cpane-socios .socios-actions,
  #cpane-nuevo .socios-actions,
  #cpane-socios .action-row,
  #cpane-nuevo .action-row,
  #cpane-socios .filter-row,
  #cpane-nuevo .filter-row,
  #cpane-socios .stats-grid,
  #cpane-nuevo .stats-grid {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 10px !important;
    width: 100% !important;
  }

  #cpane-socios .socio-card,
  #cpane-socios .user-card,
  #cpane-socios .log-item {
    width: 100% !important;
    min-width: 0 !important;
    align-items: flex-start !important;
  }

  #cpane-socios .socio-actions,
  #cpane-socios .uc-actions,
  #cpane-nuevo .socio-actions,
  #cpane-nuevo .uc-actions {
    width: 100% !important;
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 8px !important;
  }

  #cpane-socios .socio-actions .uc-btn,
  #cpane-socios .uc-actions .uc-btn,
  #cpane-nuevo .socio-actions .uc-btn,
  #cpane-nuevo .uc-actions .uc-btn {
    width: 100% !important;
  }
}

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

  /* ══════════════════════════════════════════
     TAB NAVIGATION
  ══════════════════════════════════════════ */
