async function searchSocioForRes() {
  const raw = document.getElementById('resSearchSocio').value.trim();
  if (!raw) return;

  const info = document.getElementById('resSocioInfo');
  const form = document.getElementById('resFormContainer');
  info.style.display = 'block';
  form.style.display = 'none';
  selectedSocioForRes = null;
  info.innerHTML = '<div class="res-loading"><div class="res-spinner"></div><span>Buscando en base de datos…</span></div>';

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${authToken || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  let matches = [];
  try {
    const r1 = await fetch(`${SUPABASE_URL}/rest/v1/socios?codigo=eq.${encodeURIComponent(raw)}&select=*&limit=20`, { headers });
    if (r1.ok) matches = await r1.json();

    if (!matches.length && /^\d+$/.test(raw)) {
      const r2 = await fetch(`${SUPABASE_URL}/rest/v1/socios?codigo=like.*-${encodeURIComponent(raw)}&select=*&limit=20`, { headers });
      if (r2.ok) matches = await r2.json();
    }
    if (!matches.length) {
      const r3 = await fetch(`${SUPABASE_URL}/rest/v1/socios?codigo=ilike.*${encodeURIComponent(raw)}*&select=*&limit=20`, { headers });
      if (r3.ok) matches = await r3.json();
    }
    if (!matches.length) {
      const r4 = await fetch(`${SUPABASE_URL}/rest/v1/socios?nombre_completo=ilike.*${encodeURIComponent(raw)}*&select=*&limit=20`, { headers });
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

  if (matches.length === 1) { showSocioCard(matches[0]); return; }

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
  const esActivo = socio.activo !== false && estOp !== 'inactivo';
  const enMora   = estFin === 'mora';
  const suspendido = estOp === 'suspendido';

  if (!esActivo || suspendido) {
    info.style.display = 'block';
    info.innerHTML = `
      <div style="background:#fdf1f0;border:1.5px solid #f4beb8;border-radius:16px;padding:20px;text-align:center;">
        <div style="font-size:2rem;margin-bottom:8px;">🚫</div>
        <div style="font-weight:700;color:#b53326;font-size:.95rem;margin-bottom:6px;">Socio ${suspendido ? 'suspendido' : 'inactivo'}</div>
        <div style="font-size:.82rem;color:#7a3326;line-height:1.5;">
          <strong>${esc(socio.nombre_completo || socio.socio || '—')}</strong> (${esc(socio.codigo || socio.referencia || '—')})<br>
          no puede realizar reservaciones porque su membresía está marcada como <strong>${estOp || 'inactiva'}</strong>.<br><br>
          Contacta a administración para más información.
        </div>
      </div>`;
    form.style.display = 'none';
    selectedSocioForRes = null;
    return;
  }

  if (enMora) {
    info.style.display = 'block';
    info.innerHTML = `
      <div style="background:#fffbec;border:1.5px solid #f0d880;border-radius:16px;padding:20px;text-align:center;">
        <div style="font-size:2rem;margin-bottom:8px;">⚠️</div>
        <div style="font-weight:700;color:#7a5800;font-size:.95rem;margin-bottom:6px;">Socio en mora</div>
        <div style="font-size:.82rem;color:#7a5800;line-height:1.5;">
          <strong>${esc(socio.nombre_completo || socio.socio || '—')}</strong> (${esc(socio.codigo || socio.referencia || '—')})<br>
          tiene pagos pendientes. No puede realizar nuevas reservaciones hasta regularizar su situación.<br><br>
          Contacta a administración para más información.
        </div>
      </div>`;
    form.style.display = 'none';
    selectedSocioForRes = null;
    return;
  }

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

  const minPayload = {
    socio_nombre:  resData.socio_nombre,
    socio_codigo:  resData.socio_codigo,
    hotel:         resData.hotel,
    fecha_entrada: resData.fecha_entrada,
    quien_reserva: resData.quien_reserva,
    notas:         resData.notas
  };

  const tryPayload = async (payload) => {
    return await fetch(`${SUPABASE_URL}/rest/v1/reservaciones`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Prefer': 'return=representation' },
      body: JSON.stringify(payload)
    });
  };

  let response = await tryPayload(resData);
  if (!response.ok) {
    const errText = await response.text();
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

  const saved = await response.json();
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

async function adminApproveRes(id, estatus, btn) {
  const card = document.getElementById('rescard-' + id);
  const btns = btn.closest('div');
  btns.innerHTML = '<span style="font-size:.8rem;color:var(--sub);">Guardando…</span>';

  const res = await fetch(`${SUPABASE_URL}/rest/v1/reservaciones?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Prefer': 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify({ estatus, updated_by: currentUser })
  });

  if (res.ok || res.status === 204) {
    const color  = estatus === 'aprobada' ? '#166842' : '#b53326';
    const bg     = estatus === 'aprobada' ? '#ecf8f2' : '#fdf1f0';
    const border = estatus === 'aprobada' ? '#b3dfc6' : '#f4beb8';
    const label  = estatus === 'aprobada' ? '✅ Aprobada' : '❌ Rechazada';
    btns.outerHTML = `<div style="padding:8px 16px 14px;"><span style="padding:5px 12px;border-radius:20px;font-size:.75rem;font-weight:800;background:${bg};color:${color};border:1.5px solid ${border};">${label}</span></div>`;
    checkPendingReservations();
  } else {
    btns.innerHTML = '<span style="font-size:.8rem;color:#b53326;">Error al guardar. Intenta de nuevo.</span>';
  }
}

async function checkPendingReservations() {
  if (currentRol !== 'admin') return;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/reservaciones?estatus=eq.pendiente&select=id,socio_nombre,socio_codigo,hotel,fecha_entrada,tipo,expira_en,origen,created_at&order=created_at.desc&limit=20`,
      { headers: authHeaders() }
    );
    if (!res.ok) return;
    const rows = await res.json();
    const now  = Date.now();
    const live = Array.isArray(rows) ? rows.filter(r => {
      if (!r.expira_en) return true;
      return new Date(r.expira_en).getTime() > now;
    }) : [];

    const badge = document.getElementById('pendingResBadge');
    if (badge) {
      badge.textContent = live.length > 0 ? live.length : '';
      badge.style.display = live.length > 0 ? 'inline-flex' : 'none';
    }

    const panel = document.getElementById('pendingResPanel');
    if (!panel) return;
    if (!live.length) { panel.style.display = 'none'; return; }

    panel.style.display = 'block';
    document.getElementById('pendingResPanelCount').textContent =
      `${live.length} pendiente${live.length !== 1 ? 's' : ''}`;

    document.getElementById('pendingResItems').innerHTML = live.slice(0, 5).map(r => {
      const hotelIcon = r.hotel?.includes('Amatique') ? '🏖️' : r.hotel?.includes('Clarion') ? '🏙️' : '🌊';
      const expira    = r.expira_en ? new Date(r.expira_en) : null;
      const hoursLeft = expira ? Math.max(0, Math.floor((expira.getTime() - now) / 3600000)) : null;
      const fromPortal = r.origen === 'portal_socio';
      return `
      <div style="background:var(--mist);border:1.5px solid #f0d880;border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;">
        <div style="font-size:1.4rem;flex-shrink:0;">${hotelIcon}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:.88rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(r.socio_nombre || '—')}</div>
          <div style="font-size:.75rem;color:var(--sub);margin-top:2px;">${esc(r.hotel || '—')} · ${r.fecha_entrada || '—'}${fromPortal ? ' <span style="background:#e8eaf6;color:#283593;border-radius:4px;padding:1px 5px;font-size:.65rem;font-weight:700;">Portal</span>' : ''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          ${hoursLeft !== null ? `<div style="font-size:.7rem;font-weight:700;color:${hoursLeft < 6 ? '#b53326' : '#7a5800'};">${hoursLeft}h restantes</div>` : ''}
          <div style="display:flex;gap:6px;margin-top:6px;">
            <button onclick="quickApproveRes('${r.id}','aprobada',this)" style="padding:5px 10px;background:#ecf8f2;border:1.5px solid #b3dfc6;border-radius:8px;color:#166842;font-family:'Outfit',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;">✅</button>
            <button onclick="quickApproveRes('${r.id}','rechazada',this)" style="padding:5px 10px;background:#fdf1f0;border:1.5px solid #f4beb8;border-radius:8px;color:#b53326;font-family:'Outfit',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;">❌</button>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {}
}

async function quickApproveRes(id, estatus, btn) {
  btn.disabled = true;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reservaciones?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Prefer': 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify({ estatus, updated_by: currentUser })
  });
  if (res.ok || res.status === 204) {
    const card = btn.closest('div[style*="border-radius:14px"]');
    if (card) {
      card.style.opacity = '.5';
      card.style.pointerEvents = 'none';
      const label = estatus === 'aprobada' ? '✅ Aprobada' : '❌ Rechazada';
      card.querySelector('div[style*="flex:1"]').insertAdjacentHTML('afterend',
        `<div style="font-size:.72rem;font-weight:800;color:${estatus==='aprobada'?'#166842':'#b53326'};">${label}</div>`);
    }
    setTimeout(() => checkPendingReservations(), 800);
  } else {
    btn.disabled = false;
  }
}

async function deleteReservation(id, btn) {
  if (!confirm('¿Eliminar esta reservación? Esta acción no se puede deshacer.')) return;
  const card = btn.closest('.res-hist-card');
  if (card) { card.style.opacity = '.4'; card.style.pointerEvents = 'none'; }

  const headers = {
    'apikey':        SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type':  'application/json'
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/reservaciones?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', headers
  });

  if (res.ok || res.status === 204) {
    if (card) card.remove();
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

// Todas las reservas cargadas (admin ve todas, usuario solo las suyas)
let allResRows = [];

async function loadReservations() {
  const list = document.getElementById('reservationsList');
  list.innerHTML = '<div class="empty-log">⏳ Cargando historial...</div>';

  // Mostrar filtros solo a admin
  const filtersWrap = document.getElementById('resFiltersWrap');
  if (filtersWrap) filtersWrap.style.display = currentRol === 'admin' ? 'block' : 'none';

  // Admin: carga todas. Usuario: filtra por su nombre/email
  let url = `${SUPABASE_URL}/rest/v1/reservaciones?order=created_at.desc&limit=500`;
  if (currentRol !== 'admin') {
    // El usuario solo ve las reservas donde es el socio o quien reservó
    const nombre = encodeURIComponent(currentUser || '');
    const email  = encodeURIComponent(currentEmail || '');
    url = `${SUPABASE_URL}/rest/v1/reservaciones?or=(socio_nombre.ilike.*${nombre}*,quien_reserva.ilike.*${nombre}*,socio_nombre.ilike.*${email}*)&order=created_at.desc&limit=200`;
  }

  const res = await fetch(url, {
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
  try {
    const deleted = JSON.parse(sessionStorage.getItem('vca_deleted_res') || '[]');
    if (deleted.length) rows = rows.filter(r => !deleted.includes(r.id));
  } catch(e) {}

  allResRows = rows;
  applyResFilters();
}

function applyResFilters() {
  const list = document.getElementById('reservationsList');
  let rows = [...allResRows];

  if (currentRol === 'admin') {
    const socio   = (document.getElementById('resFiltroSocio')?.value || '').trim().toLowerCase();
    const estatus = document.getElementById('resFiltroEstatus')?.value || '';
    const desde   = document.getElementById('resFiltroDesde')?.value || '';
    const hasta   = document.getElementById('resFiltroHasta')?.value || '';

    if (socio) {
      rows = rows.filter(r =>
        (r.socio_nombre || '').toLowerCase().includes(socio) ||
        (r.socio_codigo || '').toLowerCase().includes(socio) ||
        (r.quien_reserva || '').toLowerCase().includes(socio)
      );
    }
    if (estatus) rows = rows.filter(r => (r.estatus || '') === estatus);
    if (desde)   rows = rows.filter(r => r.fecha_entrada && r.fecha_entrada >= desde);
    if (hasta)   rows = rows.filter(r => r.fecha_entrada && r.fecha_entrada <= hasta);

    const countEl = document.getElementById('resFilterCount');
    if (countEl) {
      const total = allResRows.length;
      countEl.textContent = rows.length < total
        ? `${rows.length} de ${total} reservaciones`
        : `${total} reservaciones en total`;
    }
  }

  renderReservationsList(rows);
}

function clearResFilters() {
  ['resFiltroSocio'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['resFiltroEstatus'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['resFiltroDesde','resFiltroHasta'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  applyResFilters();
}

function renderReservationsList(rows) {
  const list = document.getElementById('reservationsList');

  if (!rows.length) {
    list.innerHTML = currentRol === 'admin'
      ? '<div class="empty-log">No hay reservaciones que coincidan con los filtros.</div>'
      : '<div class="empty-log">No tienes reservaciones registradas.</div>';
    return;
  }

  list.innerHTML = rows.map((r,i) => {
    const d = new Date(r.created_at);
    const hotelIcon = r.hotel?.includes('Amatique') ? '🏖️' : r.hotel?.includes('Clarion') ? '🏙️' : '🌊';
    const tipoBadge = r.tipo === 'Day Pass'
      ? '<span style="background:#fffde7;color:#5c3d00;border:1px solid #f5c518;border-radius:6px;padding:2px 8px;font-size:.68rem;font-weight:700;margin-left:6px;">☀️ Day Pass</span>'
      : '<span style="background:#e8eaf6;color:#283593;border:1px solid #c5cae9;border-radius:6px;padding:2px 8px;font-size:.68rem;font-weight:700;margin-left:6px;">🏨 Hospedaje</span>';

    const estatus  = r.estatus || '';
    const expira   = r.expira_en ? new Date(r.expira_en) : null;
    const now      = Date.now();
    const expirada = expira && expira.getTime() < now && estatus === 'pendiente';
    const fromPortal = r.origen === 'portal_socio';

    const statusMap = {
      pendiente:  { label: '⏳ Pendiente',  bg: '#fffbec', color: '#7a5800', border: '#f0d880' },
      aprobada:   { label: '✅ Aprobada',   bg: '#ecf8f2', color: '#166842', border: '#b3dfc6' },
      rechazada:  { label: '❌ Rechazada',  bg: '#fdf1f0', color: '#b53326', border: '#f4beb8' },
    };
    const st = expirada
      ? { label: '⌛ Expirada', bg: 'rgba(82,98,130,.1)', color: '#526282', border: 'rgba(82,98,130,.2)' }
      : statusMap[estatus];
    const statusBadge = st
      ? `<span style="padding:4px 10px;border-radius:20px;font-size:.7rem;font-weight:800;background:${st.bg};color:${st.color};border:1.5px solid ${st.border};">${st.label}</span>`
      : '';

    const approvalBtns = currentRol === 'admin' && estatus === 'pendiente' && !expirada ? `
      <div style="padding:0 16px 14px;display:flex;gap:8px;">
        <button onclick="adminApproveRes('${r.id}', 'aprobada', this)"
          style="flex:1;padding:10px;background:#ecf8f2;border:1.5px solid #b3dfc6;border-radius:10px;color:#166842;font-family:'Outfit',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;">
          ✅ Aprobar
        </button>
        <button onclick="adminApproveRes('${r.id}', 'rechazada', this)"
          style="flex:1;padding:10px;background:#fdf1f0;border:1.5px solid #f4beb8;border-radius:10px;color:#b53326;font-family:'Outfit',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;">
          ❌ Rechazar
        </button>
      </div>` : '';

    const expiryNote = expira && estatus === 'pendiente' && !expirada
      ? `<div class="f wide"><div class="fl">Expira</div><div class="fv" style="color:#7a5800;">${expira.toLocaleDateString('es')} ${expira.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</div></div>`
      : '';
    const origenBadge = fromPortal
      ? '<span style="background:#e8eaf6;color:#283593;border:1px solid #c5cae9;border-radius:6px;padding:2px 7px;font-size:.65rem;font-weight:700;margin-left:4px;">Portal socio</span>'
      : '';

    // Botón eliminar solo para admin
    const delBtn = currentRol === 'admin'
      ? `<button class="res-hist-del" onclick="deleteReservation('${r.id}', this)">🗑</button>`
      : '';

    return `
    <div class="res-hist-card" id="rescard-${r.id}" style="animation-delay:${Math.min(i,20)*.04}s;">
      <div class="res-hist-head">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div class="res-hist-hotel">${hotelIcon} ${esc(r.hotel||'—')}${tipoBadge}${origenBadge}</div>
          <div class="res-hist-date">📅 Entrada: ${r.fecha_entrada||'—'}${r.fecha_salida?' · Salida: '+r.fecha_salida:''}</div>
          ${statusBadge}
        </div>
        <div style="display:flex;gap:6px;align-items:flex-start;">
          <button class="res-hist-print" onclick='printRes(${JSON.stringify(r).replace(/'/g,"&#39;")})'>🖨</button>
          ${delBtn}
        </div>
      </div>
      <div class="res-hist-body">
        <div class="f"><div class="fl">Socio</div><div class="fv">${esc(r.socio_nombre||'—')}</div></div>
        <div class="f"><div class="fl">Referencia</div><div class="fv">${esc(r.socio_codigo||'—')}</div></div>
        <div class="f"><div class="fl">Reservado por</div><div class="fv">${esc(r.quien_reserva||'—')}</div></div>
        <div class="f"><div class="fl">Personas</div><div class="fv">${r.personas||'—'}</div></div>
        ${expiryNote}
        ${r.notas ? `<div class="f wide"><div class="fl">Notas</div><div class="fv">${esc(r.notas)}</div></div>` : ''}
        ${r.acompanantes ? `<div class="f wide"><div class="fl">Acompañantes</div><div class="fv">${esc(r.acompanantes)}</div></div>` : ''}
        <div class="f wide"><div class="fl">Fecha de registro</div><div class="fv" style="font-size:.75rem;">${d.toLocaleDateString('es')} · ${d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})} · 👤 ${esc(r.created_by||r.quien_reserva||'—')}</div></div>
      </div>
      ${approvalBtns}
    </div>`;
  }).join('');
}

function printRes(r) {
  const tipo = r.tipo || 'Hospedaje';
  const tipoIcon = tipo === 'Day Pass' ? '☀️' : '🏨';
  const now = new Date();
  const emision = now.toLocaleDateString('es-GT', {day:'2-digit',month:'long',year:'numeric'}) + ' · ' + now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
  const created = r.created_at ? new Date(r.created_at).toLocaleString('es') : emision;
  const folio   = r.id ? String(r.id).substring(0,8).toUpperCase() : Math.random().toString(36).substring(2,8).toUpperCase();

  // Acompañantes — leer desde columna propia o extraer del campo notas
  let guestsSection = '';
  try {
    function parseGuests(r) {
      if (r.acompanantes) {
        // Si es un string simple (nombres separados por comas)
        if (typeof r.acompanantes === 'string' && !r.acompanantes.startsWith('[') && !r.acompanantes.startsWith('{')) {
          return r.acompanantes.split(',').map(g => {
            const parts = g.trim().split(' (DPI: ');
            return { nombre: parts[0].trim(), dpi: parts[1]?.replace(')', '').trim() || '' };
          });
        }
        try { return JSON.parse(r.acompanantes); } catch(e) { return [{ nombre: r.acompanantes, dpi: '' }]; }
      }
      if (r.notas && r.notas.includes('👥 Acompañantes:')) {
        const section = r.notas.split('👥 Acompañantes:')[1].trim();
        return section.split('\n').filter(l => l.trim()).map(line => {
          const clean = line.replace(/^\d+\.\s*/, '');
          const parts = clean.split(' — DPI: ');
          return { nombre: parts[0].trim(), dpi: parts[1]?.trim() || '' };
        });
      }
      return [];
    }
    const guests = parseGuests(r);
    const totalPersonas = parseInt(r.personas) || 1;
    const rows = guests.length ? guests : Array.from({length: totalPersonas}, () => ({ nombre: '', dpi: '' }));
    guestsSection = `
      <div style="margin-bottom:18px;">
        <div style="font-size:9px;font-weight:700;color:#555577;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">👥 Personas que ingresan (${totalPersonas} persona${totalPersonas>1?'s':''})</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#f0f4fb;">
              <th style="padding:7px 10px;text-align:left;border:1px solid #dce6f5;font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#555577;width:28px;">#</th>
              <th style="padding:7px 10px;text-align:left;border:1px solid #dce6f5;font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#555577;">Nombre completo</th>
              <th style="padding:7px 10px;text-align:left;border:1px solid #dce6f5;font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#555577;width:160px;">DPI / Identificación</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((g,i) => `
              <tr style="${i%2===1?'background:#fafcff;':''}">
                <td style="padding:8px 10px;border:1px solid #dce6f5;color:#0a1628;font-weight:700;">${i+1}</td>
                <td style="padding:8px 10px;border:1px solid #dce6f5;font-weight:${g.nombre?'600':'400'};color:${g.nombre?'#0a1628':'#bbb'};">
                  ${g.nombre ? esc(g.nombre) : '&nbsp;'}
                </td>
                <td style="padding:8px 10px;border:1px solid #dce6f5;font-family:monospace;color:${g.dpi?'#0a1628':'#bbb'};">
                  ${g.dpi ? esc(g.dpi) : '&nbsp;'}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${!guests.length ? '<div style="font-size:9px;color:#aaa;margin-top:5px;font-style:italic;">* Completar al momento del check-in con identificación oficial vigente.</div>' : ''}
      </div>`; 
  } catch(e) {}

  // Estatus badge
  const statusColors = {
    pendiente:  { bg:'#fffbec', color:'#7a5800', border:'#f0d880', label:'⏳ Pendiente de aprobación' },
    aprobada:   { bg:'#ecf8f2', color:'#166842', border:'#b3dfc6', label:'✅ Aprobada' },
    rechazada:  { bg:'#fdf1f0', color:'#b53326', border:'#f4beb8', label:'❌ Rechazada' },
    confirmada: { bg:'#ecf8f2', color:'#166842', border:'#b3dfc6', label:'✅ Confirmada' },
  };
  const sc = statusColors[r.estatus] || statusColors.confirmada;
  const statusBadge = `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:${sc.bg};color:${sc.color};border:1.5px solid ${sc.border};">${sc.label}</span>`;

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>Comprobante de Reservación VCA — ${folio}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family: 'Georgia', serif; color: #0d1f3a; background: white; }
    .page { max-width: 700px; margin: 0 auto; padding: 36px 40px; }

    /* Header */
    .header { display:flex; align-items:flex-start; justify-content:space-between; padding-bottom:20px; border-bottom:3px solid #0a1628; margin-bottom:24px; }
    .header-logo img { height:64px; object-fit:contain; }
    .header-right { text-align:right; }
    .header-title { font-size:18px; font-weight:700; color:#0a1628; letter-spacing:-.3px; }
    .header-org   { font-size:11px; color:#555577; margin-top:2px; }
    .header-folio { margin-top:8px; }
    .header-folio span { background:#f0f4fb; border:1px solid #dce6f5; border-radius:4px; padding:3px 9px; font-family:monospace; font-size:11px; color:#0a1628; font-weight:700; }
    .header-emision { font-size:10px; color:#888; margin-top:5px; }

    /* Badges */
    .tipo-badge { display:inline-block; padding:5px 14px; border-radius:20px; font-size:12px; font-weight:700; margin-bottom:6px; letter-spacing:.3px; }
    .tipo-hospedaje { background:#e8eaf6; color:#283593; border:1px solid #c5cae9; }
    .tipo-daypass   { background:#fffde7; color:#5c3d00; border:1px solid #f5c518; }

    /* Socio */
    .socio-block { background:#f4f7ff; border-radius:10px; padding:16px 20px; margin-bottom:20px; border-left:5px solid #0a1628; }
    .socio-name  { font-size:20px; font-weight:700; color:#0a1628; line-height:1.2; }
    .socio-code  { font-size:12px; color:#555577; margin-top:4px; font-family:monospace; }
    .socio-status { margin-top:8px; }

    /* Info grid */
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; }
    .info-card { background:#f5f5f5; border:1px solid #dcdce8; border-radius:8px; padding:12px 14px; }
    .info-label { font-size:9px; font-weight:700; color:#555577; text-transform:uppercase; letter-spacing:.8px; margin-bottom:4px; }
    .info-value { font-size:14px; font-weight:600; color:#0a1628; line-height:1.3; }
    .info-card.dark { background:#0a1628; border-color:#0a1628; }
    .info-card.dark .info-label { color:rgba(255,255,255,.5); }
    .info-card.dark .info-value { color:white; }
    .info-card.wide { grid-column:1/-1; }

    /* Notas */
    .notas-block { border:1.5px dashed #c8d8ee; border-radius:8px; padding:14px 16px; margin-bottom:20px; background:#fafcff; }
    .notas-label { font-size:9px; font-weight:700; color:#555577; text-transform:uppercase; letter-spacing:.8px; margin-bottom:6px; }
    .notas-text  { font-size:13px; color:#0d1f3a; line-height:1.6; }

    /* Firmas */
    .sigs { display:grid; grid-template-columns:1fr 1fr; gap:60px; margin-top:40px; padding-top:10px; }
    .sig-box { text-align:center; }
    .sig-line { border-top:1.5px solid #0a1628; padding-top:6px; font-size:10px; color:#555577; margin-top:50px; }

    /* Footer */
    .footer { margin-top:28px; font-size:9px; color:#aaa; text-align:center; border-top:1px solid #dcdce8; padding-top:12px; line-height:1.7; }
    .footer strong { color:#777; }

    @media print {
      body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .page { padding:20px 24px; max-width:100%; }
      .no-print { display:none !important; }
    }
  </style></head><body>
  <div class="page">

    <!-- Botón imprimir -->
    <div class="no-print" style="text-align:right;margin-bottom:16px;">
      <button onclick="window.print()" style="padding:8px 18px;background:#0a1628;color:white;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-family:Georgia,serif;">🖨 Imprimir</button>
    </div>

    <div class="header">
      <div class="header-logo">
        <img src="https://vcaofamerica.com/wp-content/uploads/2016/07/logo-png.png"
          onerror="this.parentElement.innerHTML='<div style=\'font-family:Georgia,serif;font-size:1.1rem;font-weight:700;color:#0a1628;line-height:1.3;\'>Vacation Club<br>of America</div>'"/>
      </div>
      <div class="header-right">
        <div class="header-title">Comprobante de Reservación</div>
        <div class="header-org">Vacation Club of America</div>
        <div class="header-folio">Folio: <span>${folio}</span></div>
        <div class="header-emision">Emitido: ${emision}</div>
      </div>
    </div>

    <div style="margin-bottom:14px;">
      <span class="tipo-badge ${tipo === 'Day Pass' ? 'tipo-daypass' : 'tipo-hospedaje'}">${tipoIcon} ${tipo}</span>
      <div style="margin-top:6px;">${statusBadge}</div>
    </div>

    <div class="socio-block">
      <div class="socio-name">${esc(r.socio_nombre||'—')}</div>
      <div class="socio-code">Referencia / Código: ${esc(r.socio_codigo||'—')}</div>
    </div>

    <div class="info-grid">
      <div class="info-card dark"><div class="info-label">Hotel / Propiedad</div><div class="info-value">${esc(r.hotel||'—')}</div></div>
      <div class="info-card dark"><div class="info-label">Fecha de Entrada</div><div class="info-value">${r.fecha_entrada||'—'}</div></div>
      ${r.fecha_salida ? `<div class="info-card"><div class="info-label">Fecha de Salida</div><div class="info-value">${r.fecha_salida}</div></div>` : ''}
      <div class="info-card"><div class="info-label">N° de Personas</div><div class="info-value">${r.personas||'—'}</div></div>
      <div class="info-card"><div class="info-label">Reservado por</div><div class="info-value">${esc(r.quien_reserva||'—')}</div></div>
      <div class="info-card"><div class="info-label">Fecha de solicitud</div><div class="info-value" style="font-size:12px;">${created}</div></div>
    </div>

    ${r.notas ? `<div class="notas-block"><div class="notas-label">📝 Notas y peticiones especiales</div><div class="notas-text">${esc(r.notas)}</div></div>` : ''}

    ${guestsSection}

    <div class="sigs">
      <div class="sig-box"><div class="sig-line">Firma del Socio</div></div>
      <div class="sig-box"><div class="sig-line">Sello / Firma de Administración</div></div>
    </div>

    <div class="footer">
      Este documento es válido únicamente con la firma del socio y presentación de identificación oficial vigente.<br>
      <strong>Vacation Club of America</strong> · Sistema de Reservaciones · Folio: ${folio} · ${emision}
    </div>
  </div>
  <script>window.onload = () => { setTimeout(() => window.print(), 300); }<\/script>
  </body></html>`);
  w.document.close();
}
