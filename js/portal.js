function toggleMenu(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('menuDropdown');
  dropdown.classList.toggle('active');
}

function goTo(section) {
  const dropdown = document.getElementById('menuDropdown');
  dropdown.classList.remove('active');
  if (section === 'report')       goToReport();
  else if (section === 'reservations') goToReservations();
  else if (section === 'config')  goToConfig();
  else if (section === 'dashboard') toggleDashboard();
  else if (section === 'changepass') openChangePassModal();
}

let cpTargetUserId = null;

function openChangePassModal(targetId, targetName) {
  if (!currentUser) return;
  cpTargetUserId = targetId || null;
  const modal = document.getElementById('modalChangePass');
  const title = document.getElementById('cpModalTitle');
  const subtitle = document.getElementById('cpModalSubtitle');
  document.getElementById('cpNewPass').value = '';
  document.getElementById('cpConfirmPass').value = '';
  document.getElementById('cpNewPass').style.borderColor = 'var(--border)';
  document.getElementById('cpConfirmPass').style.borderColor = 'var(--border)';
  const cpMsg = document.getElementById('cpMsg');
  cpMsg.style.display = 'none';
  if (targetId && targetName) {
    title.textContent = '🔑 Cambiar contraseña';
    subtitle.textContent = `Estableciendo nueva contraseña para: ${targetName}`;
  } else {
    title.textContent = '🔑 Mi contraseña';
    subtitle.textContent = `Cambiando la contraseña de tu cuenta (${currentEmail || currentUser}).`;
  }
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('cpNewPass').focus(), 100);
}

function closeChangePassModal() {
  document.getElementById('modalChangePass').style.display = 'none';
  cpTargetUserId = null;
}

async function doChangePass() {
  const newPass = document.getElementById('cpNewPass').value;
  const confirm = document.getElementById('cpConfirmPass').value;
  const btn = document.getElementById('cpBtn');
  const msg = document.getElementById('cpMsg');

  const showMsg = (type, text) => {
    msg.style.display = 'block';
    msg.style.background = type === 'ok' ? '#e8f5ee' : '#fdf1f0';
    msg.style.color = type === 'ok' ? '#166842' : '#b53326';
    msg.style.border = type === 'ok' ? '1px solid #b3dfc6' : '1px solid #f4beb8';
    msg.textContent = text;
  };

  if (newPass.length < 6) {
    document.getElementById('cpNewPass').style.borderColor = '#e04535';
    showMsg('err', 'La contraseña debe tener al menos 6 caracteres.');
    return;
  }
  if (newPass !== confirm) {
    document.getElementById('cpConfirmPass').style.borderColor = '#e04535';
    showMsg('err', 'Las contraseñas no coinciden.');
    return;
  }

  btn.textContent = 'Actualizando…';
  btn.disabled = true;

  try {
    let res;
    if (cpTargetUserId) {
      res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${cpTargetUserId}`, {
        method: 'PUT',
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPass })
      });
    } else {
      res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPass })
      });
    }
    if (res.ok) {
      showMsg('ok', '✅ Contraseña actualizada correctamente.');
      document.getElementById('cpNewPass').value = '';
      document.getElementById('cpConfirmPass').value = '';
      setTimeout(closeChangePassModal, 1800);
    } else {
      const err = await res.json().catch(() => ({}));
      showMsg('err', err.msg || err.message || 'Error al actualizar la contraseña.');
    }
  } catch(e) {
    showMsg('err', 'Error de conexión. Intenta de nuevo.');
  }

  btn.textContent = 'Actualizar contraseña';
  btn.disabled = false;
}

document.getElementById('modalChangePass').addEventListener('click', function(e) {
  if (e.target === this) closeChangePassModal();
});

document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('menuDropdown');
  const btn = document.querySelector('.menu-btn');
  if (dropdown && dropdown.classList.contains('active')) {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.remove('active');
    }
  }
});

let clientSocio = null;
let clientResLockUntil = 0;
let clientResAttempts  = 0;
// Restaurar rate limit del portal del socio
try {
  const cl = parseInt(sessionStorage.getItem('vca_client_lock') || '0');
  if (cl > Date.now()) clientResLockUntil = cl;
  clientResAttempts = parseInt(sessionStorage.getItem('vca_client_attempts') || '0');
} catch(e) {}

async function clientLogin() {
  if (Date.now() < clientResLockUntil) {
    const s = Math.ceil((clientResLockUntil - Date.now()) / 1000);
    showClientMsg('err', `⏳ Demasiados intentos. Espera ${s}s.`); return;
  }
  const ref = document.getElementById('clientRefInput').value.trim();
  const dpi = document.getElementById('clientDpiInput').value.trim();
  if (!ref || !dpi) { showClientMsg('err', '⚠️ Ingresa tu referencia y DPI.'); return; }

  const btn = document.getElementById('clientLoginBtn');
  btn.textContent = 'Verificando…'; btn.disabled = true;

  try {
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept': 'application/json' };
    const base = `${SUPABASE_URL}/rest/v1/socios`;

    let rows = [];
    const r1 = await fetch(`${base}?select=*&codigo=eq.${encodeURIComponent(ref)}&activo=eq.true&limit=1`, { headers });
    if (r1.ok) rows = await r1.json();

    if (!rows.length) {
      const r2 = await fetch(`${base}?select=*&codigo=ilike.*${encodeURIComponent(ref)}*&activo=eq.true&limit=5`, { headers });
      if (r2.ok) rows = await r2.json();
    }

    if (!rows.length) {
      const r3 = await fetch(`${base}?select=*&codigo=ilike.*${encodeURIComponent(ref)}*&limit=5`, { headers });
      if (r3.ok) rows = await r3.json();
    }

    if (!rows.length) {
      clientResAttempts++;
      if (clientResAttempts >= 5) {
        clientResLockUntil = Date.now() + 15 * 60000;
        clientResAttempts  = 0;
        try { sessionStorage.setItem('vca_client_lock', String(clientResLockUntil)); sessionStorage.setItem('vca_client_attempts', '0'); } catch(e) {}
        showClientMsg('err', '🔒 Demasiados intentos. Espera 15 minutos.');
      } else {
        try { sessionStorage.setItem('vca_client_attempts', String(clientResAttempts)); } catch(e) {}
        showClientMsg('err', '❌ Referencia no encontrada. Verifica tu número de socio.');
      }
      btn.textContent = 'Ingresar al portal'; btn.disabled = false; return;
    }

    const socio = rows[0];
    const dpiDb = (socio.dpi || '').replace(/\s/g, '').toLowerCase();
    const dpiIn = dpi.replace(/\s/g, '').toLowerCase();

    if (dpiDb && dpiDb !== dpiIn) {
      clientResAttempts++;
      if (clientResAttempts >= 5) {
        clientResLockUntil = Date.now() + 15 * 60000;
        clientResAttempts  = 0;
        try { sessionStorage.setItem('vca_client_lock', String(clientResLockUntil)); sessionStorage.setItem('vca_client_attempts', '0'); } catch(e) {}
        showClientMsg('err', '🔒 Demasiados intentos. Espera 15 minutos.');
      } else {
        try { sessionStorage.setItem('vca_client_attempts', String(clientResAttempts)); } catch(e) {}
        showClientMsg('err', '❌ DPI no coincide con nuestros registros. Contacta a recepción.');
      }
      btn.textContent = 'Ingresar al portal'; btn.disabled = false; return;
    }

    if (!dpiDb) {
      showClientMsg('err', '⚠️ Tu DPI no está registrado en el sistema. Acércate a recepción para completar tu perfil.');
      btn.textContent = 'Ingresar al portal'; btn.disabled = false; return;
    }

    clientResAttempts = 0;
    clientResLockUntil = 0;
    try { sessionStorage.removeItem('vca_client_lock'); sessionStorage.removeItem('vca_client_attempts'); } catch(e) {}
    clientSocio = socio;
    loadClientPortal();
    showScreen('screenClientPortal');
  } catch(e) {
    showClientMsg('err', '⚠️ Error de conexión. Verifica tu internet e intenta de nuevo.');
  }
  btn.textContent = 'Ingresar al portal'; btn.disabled = false;
}

function showClientMsg(type, msg) {
  const el = document.getElementById('clientLoginMsg');
  el.style.display = 'block';
  el.style.background = type === 'err' ? '#fdf1f0' : '#ecf8f2';
  el.style.color       = type === 'err' ? '#b53326'  : '#166842';
  el.style.border      = type === 'err' ? '1px solid #f4beb8' : '1px solid #b3dfc6';
  el.textContent = msg;
}

function clientLogout() {
  clientSocio = null;
  document.getElementById('clientRefInput').value = '';
  document.getElementById('clientDpiInput').value = '';
  const el = document.getElementById('clientLoginMsg');
  if (el) el.style.display = 'none';
  showScreen('screenClientLogin');
}

function loadClientPortal() {
  if (!clientSocio) return;
  const s = clientSocio;

  document.getElementById('clientPortalName').textContent = s.nombre_completo || '—';
  document.getElementById('clientPortalRef').textContent  = s.codigo || s.referencia || '—';
  document.getElementById('clientProfileName').textContent = s.nombre_completo || '—';
  document.getElementById('clientProfileCode').textContent = s.codigo || s.referencia || '—';

  const initial = (s.nombre_completo || s.codigo || '?')[0].toUpperCase();
  document.getElementById('clientAvatarInitial').textContent = initial;

  const savedPhoto = localStorage.getItem('vca_photo_' + (s.codigo || s.referencia));
  if (savedPhoto) {
    document.getElementById('clientAvatarImg').src = savedPhoto;
    document.getElementById('clientAvatarImg').style.display = 'block';
    document.getElementById('clientAvatarInitial').style.display = 'none';
  } else {
    document.getElementById('clientAvatarImg').style.display = 'none';
    document.getElementById('clientAvatarInitial').style.display = 'block';
  }

  const st = membershipStatus(s.fecha_vencimiento || s.vencimiento || '');
  document.getElementById('clientProfileBadge').innerHTML =
    `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:20px;font-size:.72rem;font-weight:800;background:${st.bg};color:${st.color};border:1.5px solid ${st.border};">${st.icon} ${st.label}</span>`;

  const fields = [
    ['Nombre completo', s.nombre_completo],
    ['Referencia',      s.codigo],
    ['Tipo membresía',  s.tipo_membresia || s.departamento],
    ['DPI',             s.dpi],
    ['Teléfono',        s.telefono],
    ['Correo',          s.email],
    ['Fecha inicio',    s.fecha_inicio || s.inicio],
    ['Vencimiento',     s.fecha_vencimiento || s.vencimiento],
  ];
  document.getElementById('clientProfileData').innerHTML = fields.map(([l, v]) =>
    v ? `<div style="grid-column:${l==='Nombre completo'||l==='Correo'?'1/-1':'auto'};"><div style="font-size:.62rem;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">${l}</div><div style="font-size:.88rem;font-weight:600;color:var(--text);">${esc(String(v))}</div></div>` : ''
  ).join('');

  const estFin   = s.estado_financiero || '';
  const estOp    = s.estado_operativo  || '';
  const ultPago  = s.ultimo_pago || s.last_payment || '';
  const ultAnio  = String(s.ultimo_año_de_pago || s.ultimo_anio_pago || '');
  const finColor = estFin === 'mora' ? '#b53326' : estFin === 'al_dia' ? '#166842' : '#526282';
  const finBg    = estFin === 'mora' ? '#fdf1f0' : estFin === 'al_dia' ? '#ecf8f2' : 'var(--mist)';
  const finBorder= estFin === 'mora' ? '#f4beb8' : estFin === 'al_dia' ? '#b3dfc6' : 'var(--border)';
  const finLabel = estFin === 'mora' ? '⚠️ En mora' : estFin === 'al_dia' ? '✅ Al día' : estFin || '—';

  const payFields = [
    ['Estado financiero', `<span style="padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:800;background:${finBg};color:${finColor};border:1.5px solid ${finBorder};">${finLabel}</span>`],
    ['Estado membresía',  `<span style="padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:800;background:${st.bg};color:${st.color};border:1.5px solid ${st.border};">${st.icon} ${st.label}</span>`],
    ['Último pago',       ultPago  ? esc(String(ultPago))  : '<span style="color:var(--sub);font-size:.82rem;">Sin registro</span>'],
    ['Último año pagado', ultAnio  ? esc(ultAnio)           : '<span style="color:var(--sub);font-size:.82rem;">Sin registro</span>'],
    ['Estado operativo',  estOp    ? esc(estOp.replace(/_/g,' ').toUpperCase()) : '—'],
  ];
  document.getElementById('clientPaymentData').innerHTML = payFields.map(([l, v]) =>
    `<div><div style="font-size:.62rem;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">${l}</div><div style="font-size:.86rem;font-weight:600;color:var(--text);">${v}</div></div>`
  ).join('');

  document.getElementById('clientPaymentData').style.background = '';

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('clientResFecha').value = today;
  document.getElementById('clientResFechaSalida').value = today;

  const waMsg = encodeURIComponent(`Hola, soy ${s.nombre_completo || 'socio'}, referencia ${s.codigo || s.referencia || ''}. Necesito ayuda.`);
  document.getElementById('clientWaBtn').href = `https://wa.me/50241008215?text=${waMsg}`;
  const mailSubject = encodeURIComponent(`Consulta de socio — ${s.nombre_completo || ''} (${s.codigo || s.referencia || ''})`);
  const mailBody    = encodeURIComponent(`Hola,\n\nSoy ${s.nombre_completo || 'socio'}, referencia ${s.codigo || s.referencia || ''}.\n\nMe comunico porque:\n\n`);
  document.getElementById('clientEmailBtn').href = `mailto:cashrnndz@gmail.com?subject=${mailSubject}&body=${mailBody}`;

  switchClientTab('perfil');
  loadClientReservations();
  loadClientPagos();
  requestPushPermission();
  startClientResPolling();

  // Bloquear tab de reservas si el socio no puede reservar
  const _estOp  = s.estado_operativo  || '';
  const _estFin = s.estado_financiero || '';
  const _st     = membershipStatus(s.fecha_vencimiento || s.vencimiento || '');
  const canReserve = _estOp !== 'inactivo' && _estOp !== 'suspendido' && _estFin !== 'mora' && _st.label !== 'VENCIDO';
  const reservarTab = document.getElementById('ctab-reservar');
  const saveBtn     = document.getElementById('clientResSaveBtn');
  const resMsg      = document.getElementById('clientResMsg');
  if (!canReserve) {
    if (reservarTab) { reservarTab.style.opacity = '.45'; reservarTab.style.pointerEvents = 'none'; reservarTab.title = 'No disponible — contacta administración'; }
    if (saveBtn)     { saveBtn.disabled = true; saveBtn.style.opacity = '.5'; }
    const motivo = _estOp === 'inactivo'   ? '🚫 Tu membresía está <strong>inactiva</strong>.'
                 : _estOp === 'suspendido' ? '🚫 Tu membresía está <strong>suspendida</strong>.'
                 : _estFin === 'mora'      ? '⚠️ Tienes <strong>pagos pendientes</strong>.'
                 : '❌ Tu membresía está <strong>vencida</strong>.';
    if (resMsg) {
      resMsg.style.display = 'block';
      resMsg.style.background = '#fdf1f0'; resMsg.style.color = '#b53326'; resMsg.style.border = '1px solid #f4beb8';
      resMsg.innerHTML = motivo + ' No puedes generar reservas. Comunícate con administración para regularizar tu situación.';
    }
  } else {
    if (reservarTab) { reservarTab.style.opacity = ''; reservarTab.style.pointerEvents = ''; reservarTab.title = ''; }
    if (saveBtn)     { saveBtn.disabled = false; saveBtn.style.opacity = ''; }
    if (resMsg)      { resMsg.style.display = 'none'; }
  }
}

async function loadClientPagos() {
  if (!clientSocio) return;
  const wrap = document.getElementById('clientPagosList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="socios-empty" style="padding:18px 0;">⏳ Cargando pagos…</div>';

  try {
    const socioId = clientSocio.id;
    const headers = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Accept': 'application/json' };
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pagos?socio_id=eq.${encodeURIComponent(socioId)}&order=fecha_pago.desc&limit=50`,
      { headers }
    );

    if (!res.ok) { wrap.innerHTML = '<div class="socios-empty">No se pudo cargar el historial de pagos.</div>'; return; }

    const rows = await res.json();

    if (!rows.length) {
      wrap.innerHTML = '<div class="socios-empty" style="padding:18px 0;text-align:center;">📋 No tienes pagos registrados aún.</div>';
      return;
    }

    // Actualizar el campo "Último pago" en la sección de estado con datos reales
    const ultimoPago = rows[0];
    const upEl = document.querySelector('#clientPaymentData');
    if (upEl) {
      // Encontrar y actualizar el campo "Último pago"
      const divs = upEl.querySelectorAll('div > div:first-child');
      divs.forEach(labelDiv => {
        if (labelDiv.textContent.toUpperCase().includes('ÚLTIMO PAGO')) {
          labelDiv.nextElementSibling.textContent = fmtDate(ultimoPago.fecha_pago) + ' · Q ' + Number(ultimoPago.monto).toLocaleString('es', {minimumFractionDigits:2});
        }
        if (labelDiv.textContent.toUpperCase().includes('ÚLTIMO AÑO')) {
          labelDiv.nextElementSibling.textContent = new Date(ultimoPago.fecha_pago).getFullYear() || '—';
        }
      });
    }

    // Renderizar cada pago
    const statusColors = {
      aplicado:  { bg:'#ecf8f2', color:'#166842', border:'#b3dfc6' },
      pendiente: { bg:'#fffbec', color:'#7a5800', border:'#f0d880' },
      anulado:   { bg:'#fdf1f0', color:'#b53326', border:'#f4beb8' },
    };

    wrap.innerHTML = rows.map(r => {
      const sc = statusColors[r.estado_pago] || statusColors.aplicado;
      const monto = Number(r.monto || 0).toLocaleString('es', {minimumFractionDigits:2});
      return `
      <div style="background:var(--mist);border:1.5px solid var(--border);border-radius:12px;padding:12px 14px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:0;">
            <div style="font-size:.92rem;font-weight:700;color:var(--text);margin-bottom:4px;">
              Q ${monto}
              ${r.concepto ? `<span style="font-size:.75rem;font-weight:500;color:var(--sub);margin-left:6px;">· ${esc(r.concepto)}</span>` : ''}
            </div>
            <div style="font-size:.75rem;color:var(--sub);line-height:1.7;">
              📅 <strong>${fmtDate(r.fecha_pago)}</strong>
              ${r.metodo_pago ? ` · 💳 ${esc(r.metodo_pago)}` : ''}
              ${r.periodo_desde || r.periodo_hasta ? `<br>📆 Período: ${fmtDate(r.periodo_desde)} → ${fmtDate(r.periodo_hasta)}` : ''}
              ${r.comentario ? `<br>💬 ${esc(r.comentario)}` : ''}
            </div>
          </div>
          <span style="flex-shrink:0;padding:3px 10px;border-radius:20px;font-size:.68rem;font-weight:800;background:${sc.bg};color:${sc.color};border:1.5px solid ${sc.border};">
            ${esc(r.estado_pago || 'aplicado')}
          </span>
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    wrap.innerHTML = '<div class="socios-empty">Error al cargar pagos.</div>';
  }
}

function handleClientPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { alert('La imagen debe ser menor a 2MB.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    document.getElementById('clientAvatarImg').src = dataUrl;
    document.getElementById('clientAvatarImg').style.display = 'block';
    document.getElementById('clientAvatarInitial').style.display = 'none';
    try {
      const key = 'vca_photo_' + (clientSocio?.codigo || clientSocio?.referencia || 'unknown');
      localStorage.setItem(key, dataUrl);
    } catch(e) {}
  };
  reader.readAsDataURL(file);
}

function switchClientTab(tab) {
  ['perfil','reservar','misres'].forEach(t => {
    document.getElementById('cpane-' + t).style.display = t === tab ? 'flex' : 'none';
    const btn = document.getElementById('ctab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'misres') loadClientReservations();
}

function clientSelectTipo(btn) {
  document.querySelectorAll('#cpane-reservar .tipo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const isDayPass = btn.dataset.tipo === 'Day Pass';
  document.getElementById('clientResFechaSalidaGroup').style.display = isDayPass ? 'none' : 'block';
}

function clientSelectHotel(btn, hotel) {
  document.querySelectorAll('#cpane-reservar .hotel-card').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('clientResHotel').value = hotel;
}

async function clientSaveReservation() {
  if (!clientSocio) return;
  const st     = membershipStatus(clientSocio.fecha_vencimiento || clientSocio.vencimiento || '');
  const estOp  = clientSocio.estado_operativo  || '';
  const estFin = clientSocio.estado_financiero || '';

  if (estOp === 'inactivo') {
    showClientResMsg('err', '🚫 Tu membresía está <strong>inactiva</strong>. No puedes generar reservas. Regulariza tu situación contactando a administración.');
    return;
  }
  if (estOp === 'suspendido') {
    showClientResMsg('err', '🚫 Tu membresía está <strong>suspendida</strong>. No puedes generar reservas hasta que sea reactivada por administración.');
    return;
  }
  if (estFin === 'mora') {
    showClientResMsg('err', '⚠️ Tienes pagos pendientes. No puedes reservar hasta regularizar tu situación con administración.');
    return;
  }
  if (st.label === 'VENCIDO') {
    showClientResMsg('err', '❌ Tu membresía está <strong>vencida</strong>. Contacta a administración para renovarla.');
    return;
  }

  const hotel  = document.getElementById('clientResHotel').value;
  const fecha  = document.getElementById('clientResFecha').value;
  const salida = document.getElementById('clientResFechaSalida').value;
  const pers   = parseInt(document.getElementById('clientResPersonas').value) || 1;
  const notas  = document.getElementById('clientResNotas').value.trim();
  const tipo   = document.querySelector('#cpane-reservar .tipo-btn.active')?.dataset.tipo || 'Hospedaje';

  if (!fecha) { showClientResMsg('err', 'Selecciona la fecha de entrada.'); return; }

  // Recopilar acompañantes
  const guestRows = document.querySelectorAll('#guestsList .guest-row');
  const acompanantes = [];
  guestRows.forEach(row => {
    const nombre = row.querySelector('.g-nombre')?.value.trim() || '';
    const dpi    = row.querySelector('.g-dpi')?.value.trim() || '';
    if (nombre) acompanantes.push({ nombre, dpi });
  });

  // Serializar acompañantes para la columna 'acompanantes'
  // El usuario solicitó que NO se agreguen a la columna de notas.
  const guestNames = acompanantes.length ? acompanantes.map(g => g.nombre + (g.dpi ? ` (DPI: ${g.dpi})` : '')).join(', ') : null;
  
  const expira = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const payload = {
    hotel, tipo,
    fecha_entrada:  fecha,
    fecha_salida:   tipo === 'Day Pass' ? null : (salida || null),
    personas:       pers,
    notas:          notas || null,           // Solo las notas ingresadas por el usuario
    acompanantes:   guestNames,              // Nombres de acompañantes en su propia columna
    quien_reserva:  clientSocio.nombre_completo || '—',
    created_by:     clientSocio.nombre_completo || clientSocio.codigo || 'Portal Socio',
    socio_nombre:   clientSocio.nombre_completo || '—',
    socio_codigo:   clientSocio.codigo || clientSocio.referencia || '—',
  };

  const btn = document.getElementById('clientResSaveBtn');
  const editId = btn.dataset.editId;
  const isEdit = !!editId;

  if (!isEdit) {
    payload.estatus   = 'pendiente';
    payload.expira_en = expira;
    payload.origen    = 'portal_socio';
  }

  btn.disabled = true;
  btn.textContent = isEdit ? 'Guardando…' : 'Enviando…';

  const headers = {
    'apikey':        SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal'
  };

  const url    = isEdit
    ? `${SUPABASE_URL}/rest/v1/reservaciones?id=eq.${editId}`
    : `${SUPABASE_URL}/rest/v1/reservaciones`;
  const method = isEdit ? 'PATCH' : 'POST';

  // Intentar con payload completo; si falla por columna desconocida, reintentar sin las extendidas
  const tryPost = async (p) => fetch(url, { method, headers, body: JSON.stringify(p) });
  let res = await tryPost(payload);

  if (!res.ok) {
    const errText = await res.text();
    if (errText.includes('column') || errText.includes('schema cache') || errText.includes('42703')) {
      // Reintentar sin columnas opcionales que pueden no existir en BD
      // Si la columna 'acompanantes' no existe, los ponemos en notas como fallback
      const guestLines = acompanantes.length ? acompanantes.map((g,i) => `${i+1}. ${g.nombre}${g.dpi ? ' — DPI: '+g.dpi : ''}`).join('\n') : '';
      const fallbackNotas = (notas ? notas + '\n\n' : '') + (guestLines ? '👥 Acompañantes:\n' + guestLines : '');

      const minPayload = {
        hotel, tipo,
        fecha_entrada:  payload.fecha_entrada,
        fecha_salida:   payload.fecha_salida,
        personas:       pers,
        notas:          fallbackNotas || null,
        quien_reserva:  payload.quien_reserva,
        created_by:     payload.created_by,
        socio_nombre:   payload.socio_nombre,
        socio_codigo:   payload.socio_codigo,
      };
      if (!isEdit) { minPayload.estatus = 'pendiente'; }
      res = await tryPost(minPayload);
    }
    if (!res.ok) {
      showClientResMsg('err', '❌ Error al enviar. Intenta de nuevo o contacta a administración.');
      btn.disabled = false;
      btn.textContent = isEdit ? '✏️ Guardar cambios' : '📨 Enviar solicitud de reserva';
      return;
    }
  }

  showClientResMsg('ok', isEdit ? '✅ Reserva modificada exitosamente.' : '✅ Solicitud enviada. Recibirás confirmación en 48 horas.');
  document.getElementById('clientResNotas').value = '';
  document.getElementById('guestsList').innerHTML = '';
  delete btn.dataset.editId;
  btn.textContent = '📨 Enviar solicitud de reserva';
  btn.disabled = false;
  setTimeout(() => switchClientTab('misres'), 1600);
}

function addGuestRow() {
  const list = document.getElementById('guestsList');
  const idx  = list.children.length + 1;
  const div  = document.createElement('div');
  div.className = 'guest-row';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;';
  div.innerHTML = `
    <input class="g-nombre res-form-input" placeholder="Nombre completo" style="width:100%;font-size:.82rem;"/>
    <input class="g-dpi res-form-input" placeholder="DPI (opcional)" inputmode="numeric" style="width:100%;font-size:.82rem;"/>
    <button type="button" onclick="this.closest('.guest-row').remove()"
      style="width:32px;height:32px;border-radius:8px;border:1.5px solid #f4beb8;background:#fdf1f0;color:#b53326;font-size:1rem;cursor:pointer;flex-shrink:0;">✕</button>`;
  list.appendChild(div);
  div.querySelector('.g-nombre').focus();
}

function showClientResMsg(type, msg) {
  const el = document.getElementById('clientResMsg');
  if (!el) return;
  el.style.display = 'block';
  if (type === 'ok')   { el.style.background='#ecf8f2'; el.style.color='#166842'; el.style.border='1px solid #b3dfc6'; }
  else if (type==='info') { el.style.background='#e8eaf6'; el.style.color='#283593'; el.style.border='1px solid #c5cae9'; }
  else                 { el.style.background='#fdf1f0'; el.style.color='#b53326'; el.style.border='1px solid #f4beb8'; }
  el.textContent = msg;
}

async function loadClientReservations() {
  if (!clientSocio) return;
  const list = document.getElementById('clientResList');
  list.innerHTML = '<div class="empty-log"><div class="ei">⏳</div><p>Cargando…</p></div>';
  const codigo = encodeURIComponent(clientSocio.codigo || clientSocio.referencia || '');
  const headers = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Accept': 'application/json' };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reservaciones?socio_codigo=eq.${codigo}&order=created_at.desc&limit=100`, { headers });
  if (!res.ok) { list.innerHTML = '<div class="empty-log"><div class="ei">❌</div><p>Error al cargar reservas.</p></div>'; return; }
  const rows = await res.json();
  if (!rows.length) { list.innerHTML = '<div class="empty-log"><div class="ei">📋</div><p>Aún no tienes reservas registradas.</p></div>'; return; }
  const now = Date.now();
  list.innerHTML = rows.map(r => {
    const estatus  = r.estatus || 'confirmada';
    const expira   = r.expira_en ? new Date(r.expira_en) : null;
    const expirada = expira && expira.getTime() < now && estatus === 'pendiente';
    const pendiente = estatus === 'pendiente' && !expirada;
    const statusMap = {
      pendiente:  { label: '⏳ Pendiente',  bg: '#fffbec', color: '#7a5800', border: '#f0d880' },
      aprobada:   { label: '✅ Aprobada',   bg: '#ecf8f2', color: '#166842', border: '#b3dfc6' },
      rechazada:  { label: '❌ Rechazada',  bg: '#fdf1f0', color: '#b53326', border: '#f4beb8' },
      confirmada: { label: '✅ Confirmada', bg: '#ecf8f2', color: '#166842', border: '#b3dfc6' },
    };
    const st = expirada
      ? { label: '⌛ Expirada', bg: 'rgba(82,98,130,.1)', color: '#526282', border: 'rgba(82,98,130,.2)' }
      : (statusMap[estatus] || statusMap.confirmada);
    const badge = `<span style="padding:4px 10px;border-radius:20px;font-size:.7rem;font-weight:800;background:${st.bg};color:${st.color};border:1.5px solid ${st.border};">${st.label}</span>`;
    const hotelIcon = r.hotel?.includes('Amatique') ? '🏖️' : r.hotel?.includes('Clarion') ? '🏙️' : '🌊';
    const d = new Date(r.created_at);

    // Acompañantes guardados — leer desde columna propia o desde notas (compatibilidad)
    let guestsHtml = '';
    try {
      let guests = [];
      if (r.acompanantes) {
        // Si es un string simple (nombres separados por comas)
        if (typeof r.acompanantes === 'string' && !r.acompanantes.startsWith('[') && !r.acompanantes.startsWith('{')) {
          guests = r.acompanantes.split(',').map(g => ({ nombre: g.trim() }));
        } else {
          try { guests = JSON.parse(r.acompanantes); } catch(e) { guests = [{ nombre: r.acompanantes }]; }
        }
      }
      
      // Fallback para registros antiguos donde estaban en notas
      if (!guests.length && r.notas && r.notas.includes('👥 Acompañantes:')) {
        const section = r.notas.split('👥 Acompañantes:')[1].trim();
        guests = section.split('\n').filter(l => l.trim()).map(line => {
          const clean = line.replace(/^\d+\.\s*/, '');
          const parts = clean.split(' — DPI: ');
          return { nombre: parts[0].trim(), dpi: parts[1]?.trim() || '' };
        });
      }

      if (guests.length) {
        guestsHtml = `<div style="grid-column:1/-1;margin-top:4px;">
          <div style="font-size:.62rem;font-weight:700;color:var(--sub);text-transform:uppercase;margin-bottom:5px;">👥 Acompañantes</div>
          ${guests.map(g => `<div style="font-size:.78rem;padding:5px 8px;background:var(--mist);border-radius:7px;margin-bottom:4px;">
            ${esc(g.nombre||'—')} ${g.dpi ? `<span style="color:var(--sub);font-size:.7rem;">· DPI: ${esc(g.dpi)}</span>` : ''}
          </div>`).join('')}
        </div>`;
      }
    } catch(e) {}

    // Acciones según estatus
    const actionBtns = pendiente ? `
      <div style="padding:10px 14px 14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button onclick="clientEditRes('${r.id}')"
          style="flex:1;min-width:100px;padding:9px 12px;background:var(--mist);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-family:'Outfit',sans-serif;font-size:.8rem;font-weight:700;cursor:pointer;">
          ✏️ Modificar
        </button>
        <button onclick="clientCancelRes('${r.id}', this)"
          style="flex:1;min-width:100px;padding:9px 12px;background:#fdf1f0;border:1.5px solid #f4beb8;border-radius:10px;color:#b53326;font-family:'Outfit',sans-serif;font-size:.8rem;font-weight:700;cursor:pointer;">
          🚫 Cancelar
        </button>
      </div>` : `
      <div style="padding:10px 14px 14px;display:flex;gap:8px;">
        <button onclick="clientDeleteRes('${r.id}', this)"
          style="padding:9px 14px;background:rgba(82,98,130,.08);border:1.5px solid rgba(82,98,130,.2);border-radius:10px;color:#526282;font-family:'Outfit',sans-serif;font-size:.8rem;font-weight:700;cursor:pointer;">
          🗑 Eliminar del historial
        </button>
        <button onclick='printRes(${JSON.stringify(r).replace(/'/g,"&#39;")})'
          style="padding:9px 14px;background:var(--mist);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-family:'Outfit',sans-serif;font-size:.8rem;font-weight:700;cursor:pointer;">
          🖨 Imprimir
        </button>
      </div>`;

    return `
    <div id="cres-${r.id}" style="background:var(--surface);border-radius:var(--r20);border:1.5px solid var(--border);box-shadow:var(--sh2);overflow:hidden;">
      <div style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);">
        <div style="font-weight:700;font-size:.9rem;">${hotelIcon} ${esc(r.hotel||'—')}</div>
        ${badge}
      </div>
      <div style="padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.82rem;">
        <div><div style="font-size:.62rem;font-weight:700;color:var(--sub);text-transform:uppercase;margin-bottom:2px;">Entrada</div>${esc(r.fecha_entrada||'—')}</div>
        <div><div style="font-size:.62rem;font-weight:700;color:var(--sub);text-transform:uppercase;margin-bottom:2px;">${r.fecha_salida ? 'Salida' : 'Tipo'}</div>${r.fecha_salida ? esc(r.fecha_salida) : esc(r.tipo||'Hospedaje')}</div>
        <div style="grid-column:1/-1;font-size:.72rem;color:var(--sub);">Solicitada el ${d.toLocaleDateString('es')} a las ${d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</div>
        ${r.notas && !r.notas.includes('👥 Acompañantes:') ? `<div style="grid-column:1/-1;font-size:.78rem;color:var(--sub);background:var(--mist);border-radius:8px;padding:8px 10px;">${esc(r.notas)}</div>` : ''}
        ${r.notas && r.notas.includes('👥 Acompañantes:') && r.notas.split('👥')[0].trim() ? `<div style="grid-column:1/-1;font-size:.78rem;color:var(--sub);background:var(--mist);border-radius:8px;padding:8px 10px;">${esc(r.notas.split('👥')[0].trim())}</div>` : ''}
        ${expira && pendiente ? `<div style="grid-column:1/-1;font-size:.72rem;color:#7a5800;background:#fffbec;border-radius:8px;padding:6px 10px;">⏳ Expira el ${expira.toLocaleDateString('es')} a las ${expira.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</div>` : ''}
        ${r.nota_admin ? `<div style="grid-column:1/-1;font-size:.78rem;color:var(--sub);background:var(--mist);border-radius:8px;padding:8px 10px;"><strong>Nota:</strong> ${esc(r.nota_admin)}</div>` : ''}
        ${guestsHtml}
      </div>
      ${actionBtns}
    </div>`;
  }).join('');
}

async function clientCancelRes(id, btn) {
  if (!confirm('¿Cancelar esta reserva? Esta acción no se puede deshacer.')) return;
  btn.disabled = true; btn.textContent = 'Cancelando…';
  const headers = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reservaciones?id=eq.${id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ estatus: 'rechazada', notas: (document.querySelector(`#cres-${id}`)?.dataset?.notas || '') + ' [Cancelada por el socio]' })
  });
  if (res.ok) {
    document.getElementById(`cres-${id}`)?.remove();
    loadClientReservations();
  } else {
    btn.disabled = false; btn.textContent = '🚫 Cancelar';
    alert('Error al cancelar. Intenta de nuevo.');
  }
}

async function clientDeleteRes(id, btn) {
  if (!confirm('¿Eliminar esta reserva de tu historial?')) return;
  btn.disabled = true; btn.textContent = 'Eliminando…';
  const headers = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Prefer': 'return=minimal' };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reservaciones?id=eq.${id}`, { method: 'DELETE', headers });
  if (res.ok) {
    document.getElementById(`cres-${id}`)?.remove();
  } else {
    btn.disabled = false; btn.textContent = '🗑 Eliminar del historial';
    alert('Error al eliminar. Intenta de nuevo.');
  }
}

function clientEditRes(id) {
  // Pre-cargar datos de la reserva en el formulario y cambiar a tab reservar
  const card = document.getElementById(`cres-${id}`);
  if (!card) return;
  switchClientTab('reservar');
  // Guardar id para edición
  document.getElementById('clientResSaveBtn').dataset.editId = id;
  document.getElementById('clientResSaveBtn').textContent = '✏️ Guardar cambios';
  showClientResMsg('info', '✏️ Modifica los datos y presiona "Guardar cambios".');
}

let sociosFiltered = [];
let selectedSocioId = null;
let editingSocioId = null;
let pagosRows = [];

function socioCanEdit() { return currentRol === 'admin'; }

async function fetchSocios() {
  const tryFetch = async (hdrs) => {
    let all = [];
    let from = 0;
    const size = 1000;
    while (true) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/socios?select=*&order=nombre_completo.asc`,
        { headers: { ...hdrs, 'Range-Unit':'items', 'Range':`${from}-${from+size-1}`, 'Prefer':'count=none' } }
      );
      const txt = await res.text();
      if (!res.ok) throw Object.assign(new Error(txt), { status: res.status, body: txt });
      const page = JSON.parse(txt);
      all = all.concat(page);
      if (page.length < size) break;
      from += size;
    }
    return all;
  };

  try {
    return await tryFetch(authHeaders());
  } catch (e1) {
    try {
      const svcHdrs = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      return await tryFetch(svcHdrs);
    } catch (e2) {
      throw new Error(`HTTP ${e2.status}: ${e2.body}`);
    }
  }
}

async function fetchPagos(socioId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pagos?select=*&socio_id=eq.${encodeURIComponent(socioId)}&order=created_at.desc`, { headers: authHeaders() });
  const txt = await res.text();
  if (!res.ok) throw new Error(txt || `fetchPagos failed: ${res.status}`);
  return JSON.parse(txt);
}

function updateSociosStats(rows) {
  const now = new Date(); now.setHours(0,0,0,0);
  function isVencido(r) {
    const raw = r.fecha_vencimiento || r.vencimiento || '';
    if (!raw) return false;
    const d = new Date(raw);
    return !isNaN(d.getTime()) && d < now;
  }
  const activos = rows.filter(r => (r.estado_operativo || '') === 'activo').length;
  const mora    = rows.filter(r => (r.estado_financiero || '') === 'mora' || isVencido(r)).length;
  const vencer  = rows.filter(r => {
    if ((r.estado_financiero || '') === 'mora' || isVencido(r)) return false;
    const raw = r.fecha_vencimiento || r.vencimiento || '';
    if (!raw) return false;
    const d = new Date(raw); if (isNaN(d.getTime())) return false;
    const diff = Math.floor((d - now) / 86400000);
    return diff >= 0 && diff <= 30;
  }).length;
  const enBD    = rows.filter(r => !r._source).length;
  const enExcel = rows.filter(r =>  r._source === 'excel').length;
  document.getElementById('socStatTotal').textContent    = rows.length;
  document.getElementById('socStatActivos').textContent  = activos;
  document.getElementById('socStatMora').textContent     = mora;
  document.getElementById('socStatVencer').textContent   = vencer;
  const breakdown = document.getElementById('socStatBreakdown');
  if (breakdown) breakdown.textContent = `${enBD} en BD · ${enExcel} del Excel`;
}

function socioBadgeClass(type, val) {
  const v = (val || '').toLowerCase();
  if (['activo','al_dia'].includes(v)) return 'ok';
  if (['proximo_vencer','mantenimiento'].includes(v)) return 'warn';
  if (['mora','vencido','suspendido','inactivo'].includes(v)) return 'err';
  return 'info';
}

function renderSocios(rows) {
  const list = document.getElementById('sociosList');
  document.getElementById('socCount').textContent = `${rows.length} socio(s) visibles`;
  if (!rows.length) {
    list.innerHTML = '<div class="socios-empty">No hay socios que coincidan con los filtros.</div>';
    updateSociosStats(sociosRows);
    return;
  }
  list.innerHTML = rows.map((r, i) => {
    const isExcel  = r._source === 'excel';
    const srcBadge = isExcel
      ? '<span class="source-badge excel">📊 Excel</span>'
      : '<span class="source-badge db">🗄 BD</span>';
    const extraMeta = isExcel && r.notas_excel
      ? `<br>Notas: ${esc(r.notas_excel)}`
      : (r.telefono || r.email ? `<br>Tel: ${esc(r.telefono||'—')} · Email: ${esc(r.email||'—')}` : '');
    const actions = `<button class="uc-btn" onclick="selectSocio('${r.id}')">👁</button>
         ${socioCanEdit() ? `<button class="uc-btn" title="${isExcel?'Editar / guardar en BD':'Editar'}" onclick="editSocio('${r.id}')">✏️</button><button class="uc-btn del" onclick="deleteSocio('${r.id}','${esc(r.nombre_completo||'')}')">🗑</button>` : ''}`;
    return `
    <div class="socio-card ${selectedSocioId===r.id?'selected':''}" id="socio-${r.id}">
      <div class="socio-avatar" style="${isExcel?'background:linear-gradient(135deg,#2e7d32,#43a047)':''}">${esc((r.nombre_completo||'?')[0].toUpperCase())}</div>
      <div class="socio-main" onclick="selectSocio('${r.id}')" style="cursor:pointer;">
        <div class="socio-name">${esc(r.nombre_completo||'—')} ${srcBadge}</div>
        <div class="socio-meta">
          Ref/Código: <strong>${esc(r.codigo||'—')}</strong> · ${esc(r.tipo_membresia||'—')}<br>
          Vence: ${fmtDate(r.fecha_vencimiento)}${extraMeta}
        </div>
        <div class="badge-row">
          <span class="mini-badge ${socioBadgeClass('op', r.estado_operativo)}">${esc(r.estado_operativo||'—')}</span>
          <span class="mini-badge ${socioBadgeClass('fin', r.estado_financiero)}">${esc(r.estado_financiero||'—')}</span>
          ${r.activo ? '<span class="mini-badge ok">activo</span>' : '<span class="mini-badge err">inactivo</span>'}
        </div>
      </div>
      <div class="socio-actions">${actions}</div>
    </div>`;
  }).join('');
  updateSociosStats(sociosRows);
}

async function loadSocios() {
  const list = document.getElementById('sociosList');
  if (list && !list.dataset.searched) {
    list.innerHTML = '<div class="socios-prompt"><div class="socios-prompt-icon">🔍</div><div class="socios-prompt-text">Escribe en el buscador para encontrar socios</div><div class="socios-prompt-sub">La lista se muestra solo al buscar para proteger la privacidad</div></div>';
  }
  ['socStatTotal','socStatActivos','socStatMora','socStatVencer'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '…';
  });
  const bd = document.getElementById('socStatBreakdown');
  if (bd) bd.textContent = 'Cargando…';
  try {
    const dbRows = await fetchSocios();
    const excelRows = (data || []).map(r => ({
      id:               '__excel__' + r.referencia,
      _source:          'excel',
      nombre_completo:  r.socio || '—',
      codigo:           r.referencia || '',
      tipo_membresia:   r.departamento || '',
      fecha_inicio:     parseExcelDate(r.inicio),
      fecha_vencimiento:parseExcelDate(r.vencimiento),
      ultimo_pago:      r.ultimo_pago || null,
      estado_operativo: 'activo',
      estado_financiero:r.notas?.toLowerCase().includes('mora') ? 'mora' : 'al_dia',
      activo:           true,
      notas_excel:      r.notas || '',
      telefono:         null,
      email:            null,
    }));

    const dbCodigos = new Set((dbRows || []).map(r => (r.codigo || '').trim().toLowerCase()));
    const excelNuevos = excelRows.filter(r => r.codigo && !dbCodigos.has(r.codigo.trim().toLowerCase()));

    sociosRows = [...(dbRows || []), ...excelNuevos];
    sociosFiltered = [...sociosRows];
    updateSociosStats(sociosRows);
    document.getElementById('socCount').textContent = `${sociosRows.length} socios en total`;
    setSociosEditability();
  } catch (e) {
    const msg = e.message || '';
    const hint = msg.includes('406') ? 'Token inválido o expirado. Cierra sesión y vuelve a entrar.' :
                 msg.includes('403') ? 'Sin permisos. Verifica las políticas RLS en Supabase.' :
                 msg.includes('401') ? 'No autenticado. Por favor inicia sesión.' :
                 'Error al cargar socios. Revisa la consola del navegador para más detalles.';
    if (list) list.innerHTML = `<div class="socios-empty">⚠️ ${hint}</div>`;
  }
}

function setSociosEditability() {
  const disabled = !socioCanEdit();
  ['sCodigo','sTipo','sNombre','sDpi','sTelefono','sEmail','sInicio','sVencimiento','sDireccion','sEstadoOp','sEstadoFin','sComentarios'].forEach(id => {
    const el = document.getElementById(id); if (el) el.disabled = disabled;
  });
  const btn = document.getElementById('socioSaveBtn');
  if (btn) btn.style.display = socioCanEdit() ? 'block' : 'none';
  const pagoBtn = document.getElementById('pagoSaveBtn');
  if (pagoBtn) pagoBtn.style.display = socioCanEdit() ? 'block' : 'none';
}

function getSocioPayload() {
  return {
    codigo: document.getElementById('sCodigo').value.trim(),
    tipo_membresia: document.getElementById('sTipo').value.trim(),
    nombre_completo: document.getElementById('sNombre').value.trim(),
    dpi: document.getElementById('sDpi').value.trim() || null,
    telefono: document.getElementById('sTelefono').value.trim() || null,
    email: document.getElementById('sEmail').value.trim() || null,
    fecha_inicio: document.getElementById('sInicio').value || null,
    fecha_vencimiento: document.getElementById('sVencimiento').value || null,
    estado_operativo: document.getElementById('sEstadoOp').value,
    estado_financiero: document.getElementById('sEstadoFin').value,
    direccion: document.getElementById('sDireccion').value.trim() || null,
    comentarios: document.getElementById('sComentarios').value.trim() || null,
    activo: ['activo','mantenimiento'].includes(document.getElementById('sEstadoOp').value),
    updated_by: authUserId || null,
    ...(editingSocioId ? {} : { created_by: authUserId || null })
  };
}

async function saveSocio() {
  const btn = document.getElementById('socioSaveBtn');
  if (!socioCanEdit()) { showSocioMsg('err', 'Solo un administrador puede modificar socios.'); return; }
  let payload = getSocioPayload();
  payload = sanitizeSocioPayload(payload); // sanitizar antes de enviar
  if (!payload.codigo || !payload.nombre_completo || !payload.tipo_membresia) {
    showSocioMsg('err', 'Código, nombre y tipo de membresía son obligatorios.'); return;
  }
  const wasEditing = !!editingSocioId;
  btn.disabled = true; btn.textContent = 'Guardando…';

  try {
    if (!wasEditing) {
      const dupes = [];
      const checks = [
        payload.codigo    ? `codigo=eq.${encodeURIComponent(payload.codigo)}`       : null,
        payload.dpi       ? `dpi=eq.${encodeURIComponent(payload.dpi)}`             : null,
        payload.telefono  ? `telefono=eq.${encodeURIComponent(payload.telefono)}`   : null,
        payload.email     ? `email=eq.${encodeURIComponent(payload.email)}`         : null,
      ].filter(Boolean);

      for (const check of checks) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/socios?select=id,nombre_completo,codigo&${check}&limit=1`, { headers: authHeaders() });
        if (r.ok) {
          const found = await r.json();
          if (found.length) {
            const field = check.split('=')[0];
            dupes.push(`${field}: "${found[0].nombre_completo || found[0].codigo}"`);
          }
        }
      }
      if (dupes.length) {
        showSocioMsg('err', `⚠️ Ya existe un socio con: ${dupes.join(', ')}. Verifica los datos.`);
        btn.disabled = false; btn.textContent = 'Guardar socio';
        return;
      }
    }

    const url = wasEditing
      ? `${SUPABASE_URL}/rest/v1/socios?id=eq.${encodeURIComponent(editingSocioId)}`
      : `${SUPABASE_URL}/rest/v1/socios`;
    const res = await fetch(url, {
      method: wasEditing ? 'PATCH' : 'POST',
      headers: { ...authHeaders(), 'Prefer': wasEditing ? 'return=minimal' : 'return=representation' },
      body: JSON.stringify(payload)
    });
    const txt = await res.text();
    if (!res.ok) { showSocioMsg('err', `Error ${res.status}: ${txt || 'No se pudo guardar.'}`); return; }

    const _wasNew = !wasEditing;
    showSocioMsg('ok', wasEditing ? '✅ Socio actualizado.' : '✅ Socio creado en la base de datos.');
    editingSocioId = null;
    resetSocioForm();
    await loadSocios();
    if (_wasNew) setTimeout(() => switchConfigTab('socios'), 1400);
  } catch(e) {
    showSocioMsg('err', 'Error inesperado al guardar socio.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar socio';
  }
}

function showSocioMsg(type, text) {
  const el = document.getElementById('socioMsg');
  el.className = 'form-msg ' + type;
  el.textContent = text;
  if (type === 'ok') setTimeout(() => { el.className = 'form-msg'; el.textContent = ''; }, 4000);
}

async function editSocio(id) {
  if (!socioCanEdit()) return;
  const r = sociosRows.find(x => x.id === id);
  if (!r) return;
  if (r._source === 'excel') { await saveExcelSocioToDB(r); return; }
  editingSocioId = id;
  fillSocioForm(r);
  // Título del banner azul
  const bannerSub = document.querySelector('#cpane-nuevo .section-stack > div:first-child > div:last-child');
  if (bannerSub) bannerSub.textContent = `Editando datos del socio`;
  const bannerTitle = document.querySelector('#cpane-nuevo .section-stack > div:first-child [style*="Cormorant"]');
  if (bannerTitle) bannerTitle.textContent = `✏️ Editar Socio`;
  // Título de la card y botón
  document.getElementById('socioFormTitle').textContent = `✏️ Editando: ${r.nombre_completo || ''}`;
  document.getElementById('socioSaveBtn').textContent   = 'Guardar cambios';
  // skipReset=true para no borrar el formulario ya llenado
  switchConfigTab('nuevo', true);
  setTimeout(() => document.getElementById('sociosFormCard')?.scrollIntoView({ behavior:'smooth', block:'start' }), 150);
}

function fillSocioForm(r) {
  document.getElementById('sCodigo').value      = r.codigo           || '';
  document.getElementById('sTipo').value        = r.tipo_membresia   || '';
  document.getElementById('sNombre').value      = r.nombre_completo  || '';
  document.getElementById('sDpi').value         = r.dpi              || '';
  document.getElementById('sTelefono').value    = r.telefono         || '';
  document.getElementById('sEmail').value       = r.email            || '';
  document.getElementById('sInicio').value      = parseExcelDate(r.fecha_inicio) || r.fecha_inicio || '';
  document.getElementById('sVencimiento').value = parseExcelDate(r.fecha_vencimiento) || r.fecha_vencimiento || '';
  document.getElementById('sEstadoOp').value    = r.estado_operativo  || 'activo';
  document.getElementById('sEstadoFin').value   = r.estado_financiero || 'al_dia';
  document.getElementById('sDireccion').value   = r.direccion        || '';
  document.getElementById('sComentarios').value = r.comentarios || r.notas_excel || r.notas || '';
}

async function saveExcelSocioToDB(r) {
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/socios?select=id,nombre_completo&codigo=eq.${encodeURIComponent(r.codigo)}&limit=1`,
    { headers: authHeaders() }
  );
  if (checkRes.ok) {
    const existing = await checkRes.json();
    if (existing.length) {
      const dbId = existing[0].id;
      const fullRes = await fetch(
        `${SUPABASE_URL}/rest/v1/socios?select=*&id=eq.${encodeURIComponent(dbId)}&limit=1`,
        { headers: authHeaders() }
      );
      if (fullRes.ok) {
        const rows = await fullRes.json();
        if (rows.length) {
          editingSocioId = dbId;
          fillSocioForm(rows[0]);
          document.getElementById('socioFormTitle').textContent = `✏️ Editando: ${rows[0].nombre_completo || ''}`;
          document.getElementById('socioSaveBtn').textContent   = 'Guardar cambios';
          showSocioMsg('info', 'ℹ️ Este socio ya estaba en la BD. Edita y guarda los cambios.');
          switchConfigTab('nuevo', true);
          setTimeout(() => document.getElementById('sociosFormCard')?.scrollIntoView({ behavior:'smooth', block:'start' }), 150);
          return;
        }
      }
    }
  }

  const payload = {
    codigo:            r.codigo            || '',
    nombre_completo:   r.nombre_completo   || '',
    tipo_membresia:    r.tipo_membresia    || '',
    fecha_inicio:      parseExcelDate(r.fecha_inicio),
    fecha_vencimiento: parseExcelDate(r.fecha_vencimiento),
    estado_operativo:  'activo',
    estado_financiero: (r.notas_excel||'').toLowerCase().includes('mora') ? 'mora' : 'al_dia',
    activo:            true,
    comentarios:       r.notas_excel       || null,
    created_by:        authUserId          || null,
    updated_by:        authUserId          || null,
  };

  const insRes = await fetch(`${SUPABASE_URL}/rest/v1/socios`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(payload)
  });

  if (!insRes.ok) {
    const err = await insRes.text();
    alert(`No se pudo guardar el socio en la BD: ${err}`);
    return;
  }

  const inserted = await insRes.json();
  const newId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;

  await loadSocios();
  if (newId) {
    editingSocioId = newId;
    fillSocioForm(payload);
    document.getElementById('socioFormTitle').textContent = `✏️ Editando: ${payload.nombre_completo}`;
    document.getElementById('socioSaveBtn').textContent   = 'Guardar cambios';
    showSocioMsg('ok', '✅ Socio guardado en BD. Ahora puedes completar sus datos.');
    switchConfigTab('nuevo', true);
    setTimeout(() => document.getElementById('sociosFormCard')?.scrollIntoView({ behavior:'smooth', block:'start' }), 150);
  }
}

async function deleteSocio(id, nombre) {
  if (!socioCanEdit()) { alert('Solo un administrador puede eliminar socios.'); return; }
  const isExcel = String(id).startsWith('__excel__');

  if (isExcel) {
    const r = sociosRows.find(x => x.id === id);
    const codigo = r?.codigo || '';
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/socios?select=id&codigo=eq.${encodeURIComponent(codigo)}&limit=1`,
      { headers: authHeaders() }
    );
    let dbId = null;
    if (checkRes.ok) {
      const found = await checkRes.json();
      if (found.length) dbId = found[0].id;
    }

    if (dbId) {
      if (!confirm(`¿Eliminar al socio "${nombre}" de la base de datos?\nEsta acción no se puede deshacer.`)) return;
      const delRes = await fetch(`${SUPABASE_URL}/rest/v1/socios?id=eq.${encodeURIComponent(dbId)}`, {
        method:'DELETE', headers: authHeaders()
      });
      if (!delRes.ok) { alert('No se pudo eliminar el socio de la BD.'); return; }
      showSocioMsg('ok', `✅ Socio "${nombre}" eliminado de la base de datos.`);
    } else {
      if (!confirm(`"${nombre}" solo existe en el Excel cargado, no en la BD.\n¿Ocultar de la lista en esta sesión?`)) return;
      sociosRows = sociosRows.filter(x => x.id !== id);
      sociosFiltered = sociosFiltered.filter(x => x.id !== id);
      renderSocios(sociosFiltered);
      return;
    }
  } else {
    if (!confirm(`¿Eliminar al socio "${nombre}"?\nEsta acción también quitará sus pagos registrados.`)) return;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/socios?id=eq.${encodeURIComponent(id)}`, {
      method:'DELETE', headers: authHeaders()
    });
    if (!res.ok) { alert('No se pudo eliminar el socio.'); return; }
  }

  if (selectedSocioId === id) { selectedSocioId = null; clearSocioDetail(); }
  await loadSocios();
}

async function selectSocio(id) {
  selectedSocioId = id;
  if (String(id).startsWith('__excel__')) {
    const r = sociosRows.find(x => x.id === id);
    if (!r) return;
    const det = document.getElementById('socioDetail');
    if (det) det.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="f wide"><div class="fl">Nombre</div><div class="fv">${esc(r.nombre_completo||'—')}</div></div>
        <div class="f wide"><div class="fl">Referencia</div><div class="fv">${esc(r.codigo||'—')}</div></div>
        <div class="f wide"><div class="fl">Departamento</div><div class="fv">${esc(r.tipo_membresia||'—')}</div></div>
        <div class="f"><div class="fl">Inicio</div><div class="fv">${fmtDate(r.fecha_inicio)}</div></div>
        <div class="f"><div class="fl">Vencimiento</div><div class="fv">${fmtDate(r.fecha_vencimiento)}</div></div>
        <div class="f"><div class="fl">Último pago</div><div class="fv">${esc(r.ultimo_pago||'—')}</div></div>
        <div class="f wide"><div class="fl">Notas</div><div class="fv">${esc(r.notas_excel||'—')}</div></div>
        <div style="margin-top:6px;padding:10px;background:#e8f5e9;border-radius:8px;font-size:.78rem;color:#2e7d32;">
          📊 Este socio proviene del Excel. Para editarlo, primero cárgalo como socio en la base de datos.
        </div>
      </div>`;
    document.getElementById('payHint').textContent = 'Los socios del Excel no tienen pagos registrados en la base de datos.';
    const payList = document.getElementById('payList');
    if (payList) payList.innerHTML = '<div class="socios-empty">Socio de Excel — sin pagos en BD.</div>';
    return;
  }
  const r = sociosRows.find(x => x.id === id);
  if (!r) return;
  renderSocios(sociosFiltered.length ? sociosFiltered : sociosRows);
  const detail = document.getElementById('socioDetail');
  detail.innerHTML = `
    <div class="section-stack">
      <div>
        <div class="socio-name">${esc(r.nombre_completo || '—')}</div>
        <div class="socio-meta">Código: ${esc(r.codigo || '—')} · ${esc(r.tipo_membresia || '—')}</div>
        <div class="badge-row" style="margin-top:8px;">
          <span class="mini-badge ${socioBadgeClass('op', r.estado_operativo)}">${esc(r.estado_operativo || '—')}</span>
          <span class="mini-badge ${socioBadgeClass('fin', r.estado_financiero)}">${esc(r.estado_financiero || '—')}</span>
        </div>
      </div>
      <div class="muted-line">
        DPI: ${esc(r.dpi || '—')}<br>
        Teléfono: ${esc(r.telefono || '—')}<br>
        Email: ${esc(r.email || '—')}<br>
        Dirección: ${esc(r.direccion || '—')}<br>
        Inicio: ${fmtDate(r.fecha_inicio)} · Vencimiento: ${fmtDate(r.fecha_vencimiento)}
      </div>
      <div class="note-existing">${esc(r.comentarios || 'Sin comentarios.')}</div>
      <div class="sec-title">Historial de pagos</div>
      <div id="payList"><div class="socios-empty">Cargando pagos…</div></div>
    </div>`;
  document.getElementById('payHint').textContent = `Registrando pago para: ${r.nombre_completo || '—'}`;
  await loadPagosOfSelected();
}

function clearSocioDetail() {
  document.getElementById('socioDetail').innerHTML = 'Selecciona un socio para ver su ficha y sus pagos.';
  document.getElementById('payHint').textContent = 'Selecciona un socio para registrar pagos.';
}

async function loadPagosOfSelected() {
  if (!selectedSocioId) return;
  let wrap = document.getElementById('payList');
  if (!wrap) {
    // Si el contenedor no existe, reconstruir solo la sección de pagos sin tocar el resto del detalle
    const detail = document.getElementById('socioDetail');
    if (!detail) return;
    // Buscar si ya hay un sec-title de pagos
    let sec = detail.querySelector('#payList');
    if (!sec) {
      const secTitle = document.createElement('div');
      secTitle.className = 'sec-title';
      secTitle.textContent = 'Historial de pagos';
      const payDiv = document.createElement('div');
      payDiv.id = 'payList';
      payDiv.innerHTML = '<div class="socios-empty">Cargando pagos…</div>';
      detail.querySelector('.section-stack')?.append(secTitle, payDiv);
      wrap = payDiv;
    }
    if (!wrap) { await selectSocio(selectedSocioId); return; }
  }

  wrap.innerHTML = '<div class="socios-empty" style="padding:10px 0;">⏳ Cargando pagos…</div>';

  try {
    const rows = await fetchPagos(selectedSocioId);
    pagosRows = rows;

    if (!rows.length) {
      wrap.innerHTML = '<div class="socios-empty">Este socio no tiene pagos registrados.</div>';
      return;
    }

    wrap.innerHTML = rows.map(r => `
    <div class="pay-item" id="pay-${r.id}" style="position:relative;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;min-width:0;">
          <div class="p1">Q ${Number(r.monto || 0).toLocaleString('es', {minimumFractionDigits:2})} · ${esc(r.concepto || 'Pago')}</div>
          <div class="p2">
            📅 ${fmtDate(r.fecha_pago)} · 💳 ${esc(r.metodo_pago || 'Sin método')} · 
            <span style="background:#ecf8f2;color:#166842;padding:1px 6px;border-radius:5px;font-size:.68rem;font-weight:700;">${esc(r.estado_pago || 'aplicado')}</span><br>
            ${r.periodo_desde || r.periodo_hasta ? `📆 Período: ${fmtDate(r.periodo_desde)} → ${fmtDate(r.periodo_hasta)}<br>` : ''}
            ${r.comentario ? `💬 ${esc(r.comentario)}` : ''}
          </div>
        </div>
        <button onclick="deletePago('${r.id}', this)"
          title="Eliminar pago"
          style="flex-shrink:0;width:30px;height:30px;border-radius:7px;border:1.5px solid #f4beb8;background:#fdf1f0;color:#b53326;font-size:.85rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">
          🗑
        </button>
      </div>
    </div>`).join('');

  } catch(e) {
    wrap.innerHTML = '<div class="socios-empty">No se pudieron cargar los pagos.</div>';
  }
}

async function savePago() {
  if (!socioCanEdit()) { showPagoMsg('err','Solo un administrador puede registrar pagos.'); return; }
  if (!selectedSocioId) { showPagoMsg('err','Selecciona un socio primero.'); return; }
  const fecha_pago = document.getElementById('pFecha').value;
  const monto      = document.getElementById('pMonto').value;
  if (!fecha_pago || !monto) { showPagoMsg('err','Fecha y monto son obligatorios.'); return; }

  const btn = document.getElementById('pagoSaveBtn');
  btn.disabled = true; btn.textContent = 'Guardando…';

  const payload = {
    socio_id:       selectedSocioId,
    fecha_pago,
    monto:          Number(monto),
    metodo_pago:    document.getElementById('pMetodo').value.trim()    || null,
    concepto:       document.getElementById('pConcepto').value.trim()   || null,
    periodo_desde:  document.getElementById('pDesde').value             || null,
    periodo_hasta:  document.getElementById('pHasta').value             || null,
    comentario:     document.getElementById('pComentario').value.trim() || null,
    estado_pago:    'aplicado',
    registrado_por: authUserId || null
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/pagos`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'return=representation' },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    showPagoMsg('err', json?.message || 'No se pudo registrar el pago.');
    btn.disabled = false; btn.textContent = 'Registrar pago';
    return;
  }

  showPagoMsg('ok', '✅ Pago registrado correctamente.');
  logActivity('pago', `Q ${Number(monto).toFixed(2)} · Socio ID: ${selectedSocioId}`);
  ['pFecha','pMonto','pMetodo','pConcepto','pDesde','pHasta','pComentario'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });

  // Actualizar estado financiero a "al_dia" si viene con período
  if (payload.periodo_hasta) {
    await fetch(`${SUPABASE_URL}/rest/v1/socios?id=eq.${encodeURIComponent(selectedSocioId)}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ estado_financiero: 'al_dia' })
    });
    const idx = sociosRows.findIndex(r => r.id === selectedSocioId);
    if (idx !== -1) {
      sociosRows[idx].estado_financiero = 'al_dia';
      // Actualizar badges en el detalle sin reconstruir todo
      const badgeRow = document.querySelector('#socioDetail .badge-row');
      if (badgeRow) {
        const finBadge = badgeRow.querySelectorAll('.mini-badge')[1];
        if (finBadge) {
          finBadge.className = `mini-badge ${socioBadgeClass('fin','al_dia')}`;
          finBadge.textContent = 'al_dia';
        }
      }
    }
  }

  // Recargar solo el historial de pagos (sin reconstruir todo el detalle)
  await loadPagosOfSelected();

  btn.disabled = false; btn.textContent = 'Registrar pago';
}

function showPagoMsg(type, text) {
  const el = document.getElementById('pagoMsg');
  if (!el) return;
  el.className = 'form-msg ' + type;
  el.textContent = text;
  setTimeout(() => { el.textContent = ''; el.className = 'form-msg'; }, 5000);
}

async function deletePago(pagoId, btn) {
  if (!socioCanEdit()) { showPagoMsg('err','Solo un administrador puede eliminar pagos.'); return; }
  if (!confirm('¿Eliminar este pago? Esta acción no se puede deshacer.')) return;

  btn.disabled = true; btn.textContent = '…';

  const res = await fetch(`${SUPABASE_URL}/rest/v1/pagos?id=eq.${encodeURIComponent(pagoId)}`, {
    method: 'DELETE',
    headers: { ...authHeaders(), 'Prefer': 'return=minimal' }
  });

  if (res.ok) {
    // Quitar la card del pago del DOM directamente
    const card = document.getElementById(`pay-${pagoId}`);
    if (card) card.remove();
    // Si no quedan pagos, mostrar vacío
    const wrap = document.getElementById('payList');
    if (wrap && !wrap.querySelector('.pay-item')) {
      wrap.innerHTML = '<div class="socios-empty">Este socio no tiene pagos registrados.</div>';
    }
    // Actualizar memoria local
    pagosRows = pagosRows.filter(r => r.id !== pagoId && String(r.id) !== String(pagoId));
    showPagoMsg('ok', '✅ Pago eliminado.');
  } else {
    btn.disabled = false; btn.textContent = '🗑';
    showPagoMsg('err', 'Error al eliminar el pago. Intenta de nuevo.');
  }
}

async function importExcelToDb() {
  if (!socioCanEdit()) { alert('Solo administradores pueden importar socios.'); return; }
  if (!data || !data.length) { alert('Primero carga un archivo Excel desde la pantalla principal.'); return; }

  const toUpsert = [];
  const skipped  = [];
  const excelCodigos = new Set();

  data.forEach(r => {
    const codigo = (r.referencia || '').trim();
    if (!codigo) { skipped.push(r.socio || 'Sin nombre'); return; }
    if (excelCodigos.has(codigo.toLowerCase())) return;
    excelCodigos.add(codigo.toLowerCase());
    toUpsert.push({
      codigo,
      nombre_completo:   r.socio         || '',
      tipo_membresia:    r.departamento  || '',
      fecha_inicio:      parseExcelDate(r.inicio),
      fecha_vencimiento: parseExcelDate(r.vencimiento),
      estado_operativo:  'activo',
      estado_financiero: (r.notas||'').toLowerCase().includes('mora') ? 'mora' : 'al_dia',
      activo:            true,
      comentarios:       r.notas         || null,
      updated_by:        authUserId      || null,
      created_by:        authUserId      || null,
    });
  });

  if (!toUpsert.length) {
    showSocioMsg('err', `\u274c No hay socios v\u00e1lidos. ${skipped.length} omitidos sin c\u00f3digo.`);
    return;
  }

  const allDbRows = await fetchSocios();
  const activosEnDb = (allDbRows || []).filter(r => r.activo !== false && r.estado_operativo !== 'inactivo');
  const aDesactivar = activosEnDb.filter(r => {
    const cod = (r.codigo || '').trim().toLowerCase();
    return cod && !excelCodigos.has(cod);
  });

  let confirmMsg = `\u00bfSincronizar ${toUpsert.length} socios del Excel con la base de datos?\n\n\u2705 ${toUpsert.length} socios se crear\u00e1n o actualizar\u00e1n.`;
  if (aDesactivar.length) {
    confirmMsg += `\n\n\u26a0\ufe0f ${aDesactivar.length} socio${aDesactivar.length !== 1 ? 's' : ''} no aparece${aDesactivar.length !== 1 ? 'n' : ''} en el Excel y quedar\u00e1${aDesactivar.length !== 1 ? 'n' : ''} INACTIVO${aDesactivar.length !== 1 ? 'S' : ''}:\n`;
    confirmMsg += aDesactivar.slice(0, 10).map(r => `  \u2022 ${r.nombre_completo || r.codigo}`).join('\n');
    if (aDesactivar.length > 10) confirmMsg += `\n  \u2026 y ${aDesactivar.length - 10} m\u00e1s.`;
    confirmMsg += '\n\nPodr\u00e1s reactivarlos manualmente o al subir un nuevo Excel que los incluya.';
  } else {
    confirmMsg += '\n\nTodos los socios activos en la BD siguen presentes en el Excel. \u2713';
  }

  if (!confirm(confirmMsg)) return;

  const list = document.getElementById('sociosList');
  if (list) list.innerHTML = '<div class="socios-empty">\u23f3 Sincronizando socios\u2026</div>';

  let processed = 0;
  const batchSize = 100;
  for (let i = 0; i < toUpsert.length; i += batchSize) {
    const batch = toUpsert.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/socios?on_conflict=codigo`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Prefer': 'return=minimal, resolution=merge-duplicates', 'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    });
    if (res.ok) {
      processed += batch.length;
    } else {
      const txt = await res.text();
      showSocioMsg('err', `\u274c Error en lote ${Math.floor(i/batchSize)+1}: ${txt}`);
      await loadSocios();
      return;
    }
  }

  let desactivados = 0;
  if (aDesactivar.length) {
    const ids = aDesactivar.map(r => r.id).filter(Boolean);
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const inClause = `(${batchIds.join(',')})`;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/socios?id=in.${inClause}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Prefer': 'return=minimal', 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: false, estado_operativo: 'inactivo', updated_by: authUserId || null })
      });
      if (res.ok) desactivados += batchIds.length;
    }
  }

  let msg = `\u2705 ${processed} socios sincronizados.`;
  if (skipped.length)     msg += ` ${skipped.length} omitidos sin c\u00f3digo.`;
  if (desactivados > 0)   msg += ` ${desactivados} marcado${desactivados !== 1 ? 's' : ''} como inactivo${desactivados !== 1 ? 's' : ''} (no encontrado${desactivados !== 1 ? 's' : ''} en el Excel).`;
  showSocioMsg('ok', msg);
  await loadSocios();
}

function exportSociosExcel() {
  const allRows = sociosRows.map(r => ({
    'referencia':          r.codigo                || r.referencia || '',
    'socio':               r.nombre_completo       || r.socio      || '',
    'departamento':        r.tipo_membresia        || r.departamento || '',
    'inicio':              fmtDateExport(r.fecha_inicio),
    'vencimiento':         fmtDateExport(r.fecha_vencimiento),
    'ultimo pago':         r.ultimo_pago           || '',
    'Ultimo año de pago':  r.ultimo_pago ? new Date(r.ultimo_pago).getFullYear() || '' : '',
    'Notas':               r.comentarios || r.notas_excel || r.notas || '',
  }));

  if (!allRows.length) { alert('No hay socios para exportar.'); return; }

  const headers = ['referencia','socio','departamento','inicio','vencimiento','ultimo pago','Ultimo año de pago','Notas'];
  const csvRows = [
    headers.join(','),
    ...allRows.map(r => headers.map(h => {
      const val = String(r[h] || '').replace(/"/g, '""');
      return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
    }).join(','))
  ];
  const csv  = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Cartera_Activa_VCA_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtDateExport(val) {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  } catch(e) { return String(val); }
}

function applySociosFilters() {
  const list = document.getElementById('sociosList');
  if (list) list.dataset.searched = '1';
  const search   = (document.getElementById('socSearch')?.value || '').trim().toLowerCase();
  const tipo     = (document.getElementById('socTipo')?.value || '').trim().toLowerCase();
  const estadoOp = document.getElementById('socEstadoOp')?.value || '';
  const estadoFin= document.getElementById('socEstadoFin')?.value || '';

  sociosFiltered = sociosRows.filter(r => {
    if (search) {
      const hay = [r.nombre_completo, r.codigo, r.dpi, r.telefono, r.email, r.notas_excel, r.tipo_membresia]
        .map(v => (v || '').toLowerCase()).join(' ');
      if (!hay.includes(search)) return false;
    }
    if (tipo && !(r.tipo_membresia || '').toLowerCase().includes(tipo)) return false;
    if (estadoOp  && r.estado_operativo  !== estadoOp)  return false;
    if (estadoFin && r.estado_financiero !== estadoFin) return false;
    return true;
  });
  renderSocios(sociosFiltered);
}

function clearSociosFilters() {
  ['socSearch','socTipo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['socEstadoOp','socEstadoFin'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  sociosFiltered = [...sociosRows];
  const list = document.getElementById('sociosList');
  if (list) {
    delete list.dataset.searched;
    list.innerHTML = '<div class="socios-prompt"><div class="socios-prompt-icon">🔍</div><div class="socios-prompt-text">Escribe en el buscador para encontrar socios</div><div class="socios-prompt-sub">La lista se muestra solo al buscar para proteger la privacidad</div></div>';
  }
  if (sociosRows.length > 0) {
    updateSociosStats(sociosRows);
    document.getElementById('socCount').textContent = `${sociosRows.length} socios en total`;
  }
}

function resetSocioForm() {
  editingSocioId = null;
  ['sCodigo','sTipo','sNombre','sDpi','sTelefono','sEmail','sInicio','sVencimiento','sDireccion','sComentarios'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const op  = document.getElementById('sEstadoOp');  if (op)  op.value  = 'activo';
  const fin = document.getElementById('sEstadoFin'); if (fin) fin.value = 'al_dia';
  const title = document.getElementById('socioFormTitle'); if (title) title.textContent = '➕ Nuevo socio';
  const btn   = document.getElementById('socioSaveBtn');   if (btn)   btn.textContent   = '💾 Guardar socio';
  const msg   = document.getElementById('socioMsg');       if (msg)   { msg.textContent = ''; msg.className = 'form-msg'; }
  // Restaurar banner azul
  const bannerTitle = document.querySelector('#cpane-nuevo .section-stack > div:first-child [style*="Cormorant"]');
  if (bannerTitle) bannerTitle.textContent = '➕ Nuevo Socio';
  const bannerSub = document.querySelector('#cpane-nuevo .section-stack > div:first-child > div:last-child');
  if (bannerSub) bannerSub.textContent = 'Registra un nuevo socio en la base de datos';
}
