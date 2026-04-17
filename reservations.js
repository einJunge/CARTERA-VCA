/* Cartera Activa VCA — reservations.js */

  function selectTipo(btn) {
    document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Show/hide fecha_salida based on tipo
    const isDay = btn.dataset.tipo === 'Day Pass';
    const salGroup = document.getElementById('resFechaSalidaGroup');
    if (salGroup) salGroup.style.display = isDay ? 'none' : '';
  }

  function selectHotel(btn, name) {
    document.querySelectorAll('.hotel-card').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('resHotel').value = name;
  }

  function switchResTab(tab) {
    ['nueva','lista'].forEach(t => {
      const pane = document.getElementById('pane-res-'+t);
      const hbtn = document.getElementById('htab-'+t);
      if (pane) { pane.style.display = t === tab ? 'flex' : 'none'; }
      if (hbtn) hbtn.classList.toggle('active', t === tab);
    });
    if (tab === 'lista') loadReservations();
  }

  let selectedSocioForRes = null;

  async function searchSocioForRes() {
    const raw = document.getElementById('resSearchSocio').value.trim();
    if (!raw) return;
    const q = raw.toLowerCase();

    const info = document.getElementById('resSocioInfo');
    const form = document.getElementById('resFormContainer');
    info.style.display = 'block';
    form.style.display = 'none';
    selectedSocioForRes = null;
    info.innerHTML = '<div class="res-loading"><div class="res-spinner"></div><span>Buscando en base de datos…</span></div>';

    // Search directly in Supabase socios table using ilike
    // Try by codigo first, then by nombre
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${authToken || SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    let matches = [];
    try {
      // Query 1: exact codigo match
      const r1 = await fetch(
        `${SUPABASE_URL}/rest/v1/socios?codigo=eq.${encodeURIComponent(raw)}&select=*&limit=20`,
        { headers }
      );
      if (r1.ok) matches = await r1.json();

      // Query 2: codigo ends with number (e.g. "16562" matches "1-9-16562")
      if (!matches.length && /^\d+$/.test(raw)) {
        const r2 = await fetch(
          `${SUPABASE_URL}/rest/v1/socios?codigo=like.*-${encodeURIComponent(raw)}&select=*&limit=20`,
          { headers }
        );
        if (r2.ok) matches = await r2.json();
      }

      // Query 3: codigo contains query
      if (!matches.length) {
        const r3 = await fetch(
          `${SUPABASE_URL}/rest/v1/socios?codigo=ilike.*${encodeURIComponent(raw)}*&select=*&limit=20`,
          { headers }
        );
        if (r3.ok) matches = await r3.json();
      }

      // Query 4: name search
      if (!matches.length) {
        const r4 = await fetch(
          `${SUPABASE_URL}/rest/v1/socios?nombre_completo=ilike.*${encodeURIComponent(raw)}*&select=*&limit=20`,
          { headers }
        );
        if (r4.ok) matches = await r4.json();
      }
    } catch(e) {
      info.innerHTML = '<div class="res-error-box">❌ Error de conexión. Verifica tu internet e intenta de nuevo.</div>';
      return;
    }

    if (!matches.length) {
      info.innerHTML = `<div class="res-error-box">Sin resultados para <strong>"${esc(raw)}"</strong>.<br><span style="font-weight:400;">Verifica la referencia o nombre del socio.</span></div>`;
      return;
    }

    if (matches.length === 1) {
      showSocioCard(matches[0]);
      return;
    }

    // Multiple results — show picker
    window._resMatches = matches;
    info.innerHTML = `
      <div class="res-picker">
        <div class="res-picker-title">${matches.length} resultados — selecciona el socio</div>
        <div class="res-picker-list">
          ${matches.map((r,i) => `
            <button class="res-picker-item" onclick="selectSocioForRes(${i})">
              <div class="res-picker-avatar">${(r.nombre_completo||'?')[0].toUpperCase()}</div>
              <div class="res-picker-info">
                <div class="res-picker-name">${esc(r.nombre_completo||'—')}</div>
                <div class="res-picker-code">${esc(r.codigo||'—')}</div>
              </div>
              <div class="res-picker-arrow">›</div>
            </button>`).join('')}
        </div>
      </div>`;
  }


  function selectSocioForRes(idx) {
    showSocioCard(window._resMatches[idx]);
  }

  function showSocioCard(socio) {
    selectedSocioForRes = socio;
    const info = document.getElementById('resSocioInfo');
    const form = document.getElementById('resFormContainer');

    // Support both Supabase table fields AND Excel-imported field names
    const nombre  = socio.nombre_completo || socio.socio || '—';
    const codigo  = socio.codigo || socio.referencia || '—';
    const depto   = socio.departamento || '—';
    const inicio  = socio.fecha_inicio  || socio.inicio || '';
    const vence   = socio.fecha_vencimiento || socio.vencimiento || '';
    const ultPago = socio.ultimo_pago   || '';
    const ultAnio = String(socio.ultimo_año_de_pago || socio.ultimo_anio_pago || socio['ultimo año de pago'] || '');
    const notas   = socio.notas || '';
    const estOp   = socio.estado_operativo  || '';
    const estFin  = socio.estado_financiero || '';
    const dpi     = socio.dpi || '';
    const tel     = socio.telefono || '';

    const notaTag = notas ? `<div class="socio-found-field wide"><div class="socio-found-label">Notas</div><div class="socio-found-value"><span class="note-tag">🏷 ${esc(notas)}</span></div></div>` : '';
    const statusRow = (estOp || estFin) ? `<div class="socio-status-row">${estOp?`<span class="socio-badge">${estOp.replace(/_/g,' ').toUpperCase()}</span>`:''} ${estFin?`<span class="socio-badge">${estFin.replace(/_/g,' ').toUpperCase()}</span>`:''}</div>` : '';

    info.style.display = 'block';
    info.innerHTML = `
      <div class="socio-found-card">
        <div class="socio-found-head">
          <div class="socio-found-avatar">${(nombre[0]||'?').toUpperCase()}</div>
          <div class="socio-found-text">
            <div class="socio-found-name">${esc(nombre)}</div>
            <div class="socio-found-code">${esc(codigo)}</div>
          </div>
          <div class="socio-found-check">✓</div>
        </div>
        <div class="socio-found-grid">
          <div class="socio-found-field wide">
            <div class="socio-found-label">Departamento</div>
            <div class="socio-found-value ${!depto||depto==='—'?'empty':''}">${esc(depto)}</div>
          </div>
          <div class="socio-found-field">
            <div class="socio-found-label">Inicio</div>
            <div class="socio-found-value ${!inicio?'empty':''}">${esc(inicio)||'—'}</div>
          </div>
          <div class="socio-found-field">
            <div class="socio-found-label">Vencimiento</div>
            <div class="socio-found-value ${!vence?'empty':''}">${esc(vence)||'—'}</div>
          </div>
          <div class="socio-found-field">
            <div class="socio-found-label">Último Pago</div>
            <div class="socio-found-value ${!ultPago?'empty':''}">${esc(ultPago)||'—'}</div>
          </div>
          <div class="socio-found-field">
            <div class="socio-found-label">Último Año</div>
            <div class="socio-found-value ${!ultAnio?'empty':''}">${esc(ultAnio)||'—'}</div>
          </div>
          ${tel ? `<div class="socio-found-field"><div class="socio-found-label">Teléfono</div><div class="socio-found-value">${esc(tel)}</div></div>` : ''}
          ${dpi ? `<div class="socio-found-field"><div class="socio-found-label">DPI</div><div class="socio-found-value">${esc(dpi)}</div></div>` : ''}
          ${notaTag}
        </div>
        ${statusRow}
      </div>
      <div class="res-found-banner">✅ Socio verificado — completa los datos del hospedaje</div>`;

    form.style.display = 'flex';
    document.getElementById('resFecha').valueAsDate = new Date();
    document.getElementById('resQuien').value = currentUser || '';
  }

  async function saveReservation() {
    if (!selectedSocioForRes) return;
    const hotel = document.getElementById('resHotel').value;
    const fecha = document.getElementById('resFecha').value;
    const quien = document.getElementById('resQuien').value.trim();
    const notas = document.getElementById('resNotas').value.trim();
    const msg = document.getElementById('resMsg');

    if (!fecha || !quien) {
      msg.className = 'form-msg err';
      msg.textContent = 'Por favor completa la fecha y quién reserva.';
      return;
    }

    const btn = document.getElementById('btnSaveRes');
    btn.disabled = true; btn.textContent = 'Guardando...';

    const tipoRes  = document.querySelector('.tipo-btn.active')?.dataset.tipo || 'Hospedaje';
    const fechaSal = document.getElementById('resFechaSalida')?.value || null;
    const personas = parseInt(document.getElementById('resPersonas')?.value) || 1;

    const resData = {
      socio_nombre:  selectedSocioForRes.nombre_completo || selectedSocioForRes.socio || '—',
      socio_codigo:  selectedSocioForRes.codigo || selectedSocioForRes.referencia || '—',
      hotel,
      tipo:          tipoRes,
      fecha_entrada: fecha,
      fecha_salida:  fechaSal,
      personas,
      quien_reserva: quien,
      notas:         notas || null,
      created_by:    currentUser || 'Sistema'
    };

    // Try saving — first with all fields, fallback to minimal if columns missing
    let response, saved;
    const tryPayload = async (payload) => {
      return await fetch(`${SUPABASE_URL}/rest/v1/reservaciones`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(payload)
      });
    };

    // Minimal payload — only columns guaranteed to exist based on screenshot
    const minPayload = {
      socio_nombre:  resData.socio_nombre,
      socio_codigo:  resData.socio_codigo,
      hotel:         resData.hotel,
      fecha_entrada: resData.fecha_entrada,
      quien_reserva: resData.quien_reserva,
      notas:         resData.notas
    };

    // Try full payload first, then minimal
    response = await tryPayload(resData);
    if (!response.ok) {
      const errText = await response.text();
      // If error is about unknown column, retry with minimal payload
      if (errText.includes('column') || errText.includes('does not exist') || response.status === 400) {
        response = await tryPayload(minPayload);
      }
      if (!response.ok) {
        const finalErr = await response.text();
        msg.className = 'form-msg err';
        msg.textContent = `Error ${response.status}: ${finalErr || 'No se pudo guardar.'}`;
        btn.disabled = false; btn.innerHTML = '✅ Confirmar Reserva';
        return;
      }
    }

    saved = await response.json();
    msg.className = 'form-msg ok';
    msg.textContent = '✅ Reservación guardada con éxito.';
    setTimeout(() => {
      printRes(saved[0] || resData);
      switchResTab('lista');
      document.getElementById('resSearchSocio').value = '';
      document.getElementById('resSocioInfo').style.display = 'none';
      document.getElementById('resFormContainer').style.display = 'none';
      selectedSocioForRes = null;
    }, 1000);
    btn.disabled = false; btn.innerHTML = '✅ Confirmar Reserva';
  }

  async function deleteReservation(id, btn) {
    if (!confirm('¿Eliminar esta reservación? Esta acción no se puede deshacer.')) return;
    const card = btn.closest('.res-hist-card');
    if (card) { card.style.opacity = '.4'; card.style.pointerEvents = 'none'; }

    // Use service key to bypass RLS for delete
    const headers = {
      'apikey':        SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json'
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/reservaciones?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers
    });

    if (res.ok || res.status === 204) {
      if (card) card.remove();
      // Store deleted ID so it doesn't reappear on reload
      try {
        const deleted = JSON.parse(sessionStorage.getItem('vca_deleted_res') || '[]');
        deleted.push(id);
        sessionStorage.setItem('vca_deleted_res', JSON.stringify(deleted));
      } catch(e) {}
    } else {
      const errText = await res.text();
      if (card) { card.style.opacity = '1'; card.style.pointerEvents = ''; }
      alert(`Error al eliminar (${res.status}): ${errText || 'Verifica permisos RLS en Supabase.'}`);
    }
  }

  async function loadReservations() {
    const list = document.getElementById('reservationsList');
    list.innerHTML = '<div class="empty-log">⏳ Cargando historial...</div>';

    const res = await fetch(`${SUPABASE_URL}/rest/v1/reservaciones?order=created_at.desc&limit=200`, {
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json'
      }
    });
    if (!res.ok) {
      list.innerHTML = '<div class="empty-log">❌ Error al cargar. Asegúrate de crear la tabla en Supabase.</div>';
      return;
    }
    let rows = await res.json();
    // Filter out locally-deleted entries
    try {
      const deleted = JSON.parse(sessionStorage.getItem('vca_deleted_res') || '[]');
      if (deleted.length) rows = rows.filter(r => !deleted.includes(r.id));
    } catch(e) {}
    if (!rows.length) {
      list.innerHTML = '<div class="empty-log">No hay reservaciones registradas.</div>';
      return;
    }

    list.innerHTML = rows.map((r,i) => {
      const d = new Date(r.created_at);
      const hotelIcon = r.hotel?.includes('Amatique') ? '🏖️' : r.hotel?.includes('Clarion') ? '🏙️' : '🌊';
      const tipoBadge = r.tipo === 'Day Pass'
        ? '<span style="background:#fff8e6;color:#7a5800;border:1px solid #f0d080;border-radius:6px;padding:2px 8px;font-size:.68rem;font-weight:700;margin-left:6px;">☀️ Day Pass</span>'
        : '<span style="background:#e8f0fe;color:#1a4a8a;border:1px solid #c8dbf8;border-radius:6px;padding:2px 8px;font-size:.68rem;font-weight:700;margin-left:6px;">🏨 Hospedaje</span>';
      return `
      <div class="res-hist-card" style="animation-delay:${Math.min(i,20)*.04}s;">
        <div class="res-hist-head">
          <div>
            <div class="res-hist-hotel">${hotelIcon} ${esc(r.hotel||'—')}${tipoBadge}</div>
            <div class="res-hist-date">📅 Entrada: ${r.fecha_entrada||'—'}${r.fecha_salida?' · Salida: '+r.fecha_salida:''}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="res-hist-print" onclick='printRes(${JSON.stringify(r).replace(/'/g,"&#39;")})'>🖨 Imprimir</button>
            <button class="res-hist-del" onclick="deleteReservation('${r.id}', this)">🗑</button>
          </div>
        </div>
        <div class="res-hist-body">
          <div class="f"><div class="fl">Socio</div><div class="fv">${esc(r.socio_nombre||'—')}</div></div>
          <div class="f"><div class="fl">Referencia</div><div class="fv">${esc(r.socio_codigo||'—')}</div></div>
          <div class="f"><div class="fl">Reservado por</div><div class="fv">${esc(r.quien_reserva||'—')}</div></div>
          <div class="f"><div class="fl">Personas</div><div class="fv">${r.personas||'—'}</div></div>
          ${r.notas ? `<div class="f wide"><div class="fl">Notas</div><div class="fv">${esc(r.notas)}</div></div>` : ''}
          <div class="f wide"><div class="fl">Fecha de registro</div><div class="fv" style="font-size:.75rem;">${d.toLocaleDateString('es')} · ${d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})} · 👤 ${esc(r.created_by||r.quien_reserva||'—')}</div></div>
        </div>
      </div>`;
    }).join('');
  }

  function printRes(r) {
    const tipo = r.tipo || 'Hospedaje';
    const tipoIcon = tipo === 'Day Pass' ? '☀️' : '🏨';
    const now = new Date();
    const emision = now.toLocaleDateString('es') + ' ' + now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
    const created = r.created_at ? new Date(r.created_at).toLocaleString('es') : emision;

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <title>Comprobante Reservación VCA</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family: 'Georgia', serif; color: #0d1f3a; background: white; padding: 0; }
      .page { max-width: 680px; margin: 0 auto; padding: 32px 36px; }

      /* Header */
      .header { display:flex; align-items:center; justify-content:space-between; padding-bottom:18px; border-bottom:3px solid #0a1628; margin-bottom:22px; }
      .header-logo img { height:60px; }
      .header-right { text-align:right; }
      .header-title { font-size:20px; font-weight:700; color:#0a1628; letter-spacing:-.3px; }
      .header-sub   { font-size:11px; color:#526282; margin-top:3px; }
      .folio { font-size:10px; color:#526282; margin-top:8px; }
      .folio span { background:#f0f4fb; border:1px solid #dce6f5; border-radius:4px; padding:3px 8px; font-family:monospace; }

      /* Tipo badge */
      .tipo-badge {
        display:inline-block; padding:5px 14px; border-radius:20px; font-size:12px; font-weight:700;
        margin-bottom:18px; letter-spacing:.3px;
      }
      .tipo-hospedaje { background:#e8f0fe; color:#1a4a8a; border:1px solid #c8dbf8; }
      .tipo-daypass   { background:#fff8e6; color:#7a5800; border:1px solid #f0d080; }

      /* Socio block */
      .socio-block { background:#f4f7ff; border-radius:10px; padding:16px 18px; margin-bottom:18px; border-left:4px solid #1549a0; }
      .socio-name  { font-size:18px; font-weight:700; color:#0a1628; }
      .socio-code  { font-size:12px; color:#526282; margin-top:3px; font-family:monospace; }

      /* Info grid */
      .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:18px; }
      .info-card { background:#f8f9fc; border:1px solid #e0e8f5; border-radius:8px; padding:12px 14px; }
      .info-label { font-size:9px; font-weight:700; color:#526282; text-transform:uppercase; letter-spacing:.8px; margin-bottom:4px; }
      .info-value { font-size:14px; font-weight:600; color:#0a1628; }
      .info-card.accent { background:#0a1628; border-color:#0a1628; }
      .info-card.accent .info-label { color:rgba(255,255,255,.55); }
      .info-card.accent .info-value { color:white; }

      /* Notas */
      .notas-block { border:1.5px dashed #c8d8ee; border-radius:8px; padding:12px 14px; margin-bottom:20px; }
      .notas-label { font-size:9px; font-weight:700; color:#526282; text-transform:uppercase; letter-spacing:.8px; margin-bottom:5px; }
      .notas-text  { font-size:13px; color:#0d1f3a; line-height:1.5; }

      /* Signatures */
      .sigs { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:36px; }
      .sig-line { border-top:1.5px solid #0a1628; padding-top:6px; text-align:center; font-size:10px; color:#526282; }

      /* Footer */
      .footer { margin-top:24px; font-size:9px; color:#aaa; text-align:center; border-top:1px solid #e0e8f5; padding-top:10px; line-height:1.6; }

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

media print { body { padding:0; } .page { padding:20px 24px; } button { display:none; } }
    
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
    <div class="page">

      <div class="header">
        <div class="header-logo">
          <img src="https://vcaofamerica.com/wp-content/uploads/2016/07/logo-png.png"
            onerror="this.parentElement.innerHTML='<div style=\'font-family:Georgia,serif;font-size:1.2rem;font-weight:700;color:#0a1628;\'>Vacation Club<br>of America</div>'"/>
        </div>
        <div class="header-right">
          <div class="header-title">Comprobante de Reservación</div>
          <div class="header-sub">Vacation Club of America</div>
          <div class="folio">Emisión: <span>${emision}</span></div>
        </div>
      </div>

      <div>
        <span class="tipo-badge ${tipo === 'Day Pass' ? 'tipo-daypass' : 'tipo-hospedaje'}">${tipoIcon} ${tipo}</span>
      </div>

      <div class="socio-block">
        <div class="socio-name">${esc(r.socio_nombre||'—')}</div>
        <div class="socio-code">Referencia: ${esc(r.socio_codigo||'—')}</div>
      </div>

      <div class="info-grid">
        <div class="info-card accent">
          <div class="info-label">Hotel / Propiedad</div>
          <div class="info-value">${esc(r.hotel||'—')}</div>
        </div>
        <div class="info-card accent">
          <div class="info-label">Fecha de Entrada</div>
          <div class="info-value">${r.fecha_entrada||'—'}</div>
        </div>
        ${r.fecha_salida ? `<div class="info-card"><div class="info-label">Fecha de Salida</div><div class="info-value">${r.fecha_salida}</div></div>` : ''}
        <div class="info-card">
          <div class="info-label">N° de Personas</div>
          <div class="info-value">${r.personas||'—'}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Reservado por</div>
          <div class="info-value">${esc(r.quien_reserva||'—')}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Registrado en sistema</div>
          <div class="info-value" style="font-size:11px;">${created}</div>
        </div>
      </div>

      ${r.notas ? `<div class="notas-block"><div class="notas-label">Notas y peticiones especiales</div><div class="notas-text">${esc(r.notas)}</div></div>` : ''}

      <div class="sigs">
        <div class="sig-line">Firma del Socio</div>
        <div class="sig-line">DPI / Identificación</div>
      </div>

      <div class="footer">
        Este documento es válido únicamente con la firma del socio y presentación de identificación original.<br>
        Vacation Club of America · Sistema de Reservaciones · ${emision}
      </div>

    </div>
    <script>window.onload = () => window.print();<\/script>
    </body></html>`);
    w.document.close();
  }
