const ACTIVITY_LOG_KEY = 'vca_activity_log';
const MAX_LOG_ENTRIES  = 200;

function logActivity(action, detail = '') {
  try {
    const log = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]');
    log.unshift({
      ts:     Date.now(),
      user:   currentUser || currentEmail || '—',
      action,
      detail
    });
    if (log.length > MAX_LOG_ENTRIES) log.length = MAX_LOG_ENTRIES;
    localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(log));
  } catch(e) {}
}

function renderActivityLog() {
  const wrap = document.getElementById('activityLogList');
  if (!wrap) return;
  let log = [];
  try { log = JSON.parse(localStorage.getItem(ACTIVITY_LOG_KEY) || '[]'); } catch(e) {}

  // Poblar selector de usuarios
  const sel = document.getElementById('logFilterUser');
  if (sel) {
    const users = [...new Set(log.map(e => e.user))].filter(Boolean);
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos los usuarios</option>' +
      users.map(u => `<option value="${esc(u)}" ${cur===u?'selected':''}>${esc(u)}</option>`).join('');
  }

  const filterUser = sel?.value || '';
  const filtered   = filterUser ? log.filter(e => e.user === filterUser) : log;

  if (!filtered.length) {
    wrap.innerHTML = '<div class="socios-empty" style="padding:20px 0;">No hay actividad registrada.</div>';
    return;
  }

  const icons = {
    'login': '🔑', 'logout': '🚪', 'busqueda': '🔍',
    'pago': '💰', 'pago_eliminado': '🗑',
    'socio_editado': '✏️', 'socio_nuevo': '➕', 'socio_eliminado': '🗑',
    'reserva_aprobada': '✅', 'reserva_rechazada': '❌', 'reserva_eliminada': '🗑',
    'excel_importado': '📊', 'usuario_nuevo': '👤', 'usuario_editado': '✏️',
  };

  wrap.innerHTML = filtered.map(e => {
    const d    = new Date(e.ts);
    const icon = icons[e.action] || '📝';
    const time = d.toLocaleDateString('es') + ' ' + d.toLocaleTimeString('es', {hour:'2-digit', minute:'2-digit'});
    return `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 10px;background:var(--mist);border-radius:10px;font-size:.78rem;">
      <span style="font-size:1rem;flex-shrink:0;margin-top:1px;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;color:var(--text);">${esc(e.action.replace(/_/g,' '))}</div>
        ${e.detail ? `<div style="color:var(--sub);margin-top:2px;word-break:break-word;">${esc(e.detail)}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:.65rem;color:var(--sub);">${esc(e.user)}</div>
        <div style="font-size:.62rem;color:var(--sub);margin-top:1px;">${time}</div>
      </div>
    </div>`;
  }).join('');
}

function clearActivityLog() {
  if (!confirm('¿Limpiar todo el registro de actividad?')) return;
  localStorage.removeItem(ACTIVITY_LOG_KEY);
  renderActivityLog();
}

let dashboardVisible = false;

function toggleDashboard() {
  const dash = document.getElementById('adminDashboard');
  if (!dash) return;
  dashboardVisible = !dashboardVisible;
  dash.style.display = dashboardVisible ? 'flex' : 'none';
  if (dashboardVisible) loadDashboard();
}

async function loadDashboard() {
  if (currentRol !== 'admin') return;
  const dash = document.getElementById('adminDashboard');
  if (!dash || dash.style.display === 'none') return;

  const now    = new Date(); now.setHours(0,0,0,0);
  const in30   = new Date(now); in30.setDate(in30.getDate() + 30);
  const mes1   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const mes2   = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10);

  const hdrs = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Accept': 'application/json' };

  // Carga paralela
  const [resSocios, resPagos, resReservas] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/socios?select=id,nombre_completo,codigo,telefono,estado_operativo,estado_financiero,fecha_vencimiento,vencimiento`, { headers: hdrs }),
    fetch(`${SUPABASE_URL}/rest/v1/pagos?select=monto,fecha_pago&fecha_pago=gte.${mes1}&fecha_pago=lte.${mes2}`, { headers: hdrs }),
    fetch(`${SUPABASE_URL}/rest/v1/reservaciones?select=id,estatus&estatus=eq.pendiente`, { headers: hdrs })
  ]);

  const socios   = resSocios.ok   ? await resSocios.json()   : [];
  const pagos    = resPagos.ok    ? await resPagos.json()     : [];
  const reservas = resReservas.ok ? await resReservas.json()  : [];

  // Calcular KPIs
  const vencidos  = socios.filter(s => { const d = new Date(s.fecha_vencimiento || s.vencimiento || ''); return !isNaN(d) && d < now; });
  const proximos  = socios.filter(s => { const d = new Date(s.fecha_vencimiento || s.vencimiento || ''); return !isNaN(d) && d >= now && d <= in30; });
  const mora      = socios.filter(s => (s.estado_financiero||'') === 'mora' || vencidos.find(v => v.id === s.id));
  const totalMes  = pagos.reduce((a, p) => a + Number(p.monto||0), 0);
  const activos   = socios.filter(s => (s.estado_operativo||'') === 'activo').length;

  // KPI cards
  const kpiWrap = document.getElementById('dashKpis');
  if (kpiWrap) {
    kpiWrap.innerHTML = [
      { icon:'👥', label:'Total socios',     val: socios.length,    color:'var(--navy)' },
      { icon:'✅', label:'Activos',           val: activos,          color:'#166842' },
      { icon:'⏰', label:'Por vencer (30d)',  val: proximos.length,  color:'#7a5800' },
      { icon:'🔴', label:'En mora / vencidos',val: mora.length,      color:'#b53326' },
      { icon:'⏳', label:'Reservas pendientes',val:reservas.length,  color:'#283593' },
      { icon:'💰', label:`Pagos mes (Q)`,     val:`Q ${totalMes.toLocaleString('es',{minimumFractionDigits:2})}`, color:'#166842' },
    ].map(k => `
      <div style="background:var(--surface);border-radius:var(--r14);border:1.5px solid var(--border);padding:14px;box-shadow:var(--sh);">
        <div style="font-size:1.2rem;margin-bottom:4px;">${k.icon}</div>
        <div style="font-size:1.3rem;font-weight:800;color:${k.color};">${k.val}</div>
        <div style="font-size:.65rem;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">${k.label}</div>
      </div>`).join('');
  }

  // Lista vencimientos próximos
  const vWrap = document.getElementById('dashVencimientoList');
  const vCount = document.getElementById('dashVencimientoCount');
  if (vCount) vCount.textContent = proximos.length;
  if (vWrap) {
    if (!proximos.length) { vWrap.innerHTML = '<div class="socios-empty" style="padding:10px 0;">Ningún socio vence en los próximos 30 días. ✅</div>'; }
    else vWrap.innerHTML = proximos.slice(0, 10).map(s => {
      const dias = Math.ceil((new Date(s.fecha_vencimiento || s.vencimiento) - now) / 86400000);
      const tel  = (s.telefono||'').replace(/\D/g,'');
      const waMsg = encodeURIComponent(`Hola ${s.nombre_completo || 'socio'}, te recordamos que tu membresía VCA vence en ${dias} días. Por favor, contáctanos para renovarla.`);
      return `
      <div style="display:flex;align-items:center;gap:10px;background:var(--mist);border-radius:10px;padding:10px 12px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:.85rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.nombre_completo||'—')}</div>
          <div style="font-size:.72rem;color:var(--sub);margin-top:2px;">${esc(s.codigo||'—')} · Vence en <strong style="color:#7a5800;">${dias} días</strong></div>
        </div>
        ${tel ? `<a href="https://wa.me/502${tel}?text=${waMsg}" target="_blank" rel="noopener"
          style="flex-shrink:0;padding:6px 10px;background:#25d366;border-radius:8px;color:white;font-size:.72rem;font-weight:700;text-decoration:none;">📲 WA</a>` : ''}
      </div>`;
    }).join('');
  }

  // Lista mora
  const mWrap = document.getElementById('dashMoraList');
  const mCount = document.getElementById('dashMoraCount');
  if (mCount) mCount.textContent = mora.length;
  if (mWrap) {
    if (!mora.length) { mWrap.innerHTML = '<div class="socios-empty" style="padding:10px 0;">No hay socios en mora. ✅</div>'; }
    else mWrap.innerHTML = mora.slice(0, 10).map(s => {
      const tel    = (s.telefono||'').replace(/\D/g,'');
      const waMsg  = encodeURIComponent(`Hola ${s.nombre_completo || 'socio'}, te contactamos de VCA para informarte que tu membresía presenta un saldo pendiente. Por favor, comunícate con nosotros para regularizarlo.`);
      return `
      <div style="display:flex;align-items:center;gap:10px;background:#fdf1f0;border:1px solid #f4beb8;border-radius:10px;padding:10px 12px;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:.85rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.nombre_completo||'—')}</div>
          <div style="font-size:.72rem;color:#b53326;margin-top:2px;">${esc(s.codigo||'—')} · ${(s.estado_financiero||'') === 'mora' ? 'En mora' : 'Membresía vencida'}</div>
        </div>
        ${tel ? `<a href="https://wa.me/502${tel}?text=${waMsg}" target="_blank" rel="noopener"
          style="flex-shrink:0;padding:6px 10px;background:#25d366;border-radius:8px;color:white;font-size:.72rem;font-weight:700;text-decoration:none;">📲 WA</a>` : ''}
      </div>`;
    }).join('');
  }

  // Pagos del mes
  const pWrap = document.getElementById('dashPagosList');
  if (pWrap) {
    if (!pagos.length) { pWrap.innerHTML = '<div class="socios-empty" style="padding:10px 0;">Sin pagos registrados este mes.</div>'; }
    else {
      pWrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#ecf8f2;border-radius:10px;border:1px solid #b3dfc6;">
        <div>
          <div style="font-size:.68rem;font-weight:700;color:#166842;text-transform:uppercase;letter-spacing:.5px;">${pagos.length} pago${pagos.length!==1?'s':''} registrado${pagos.length!==1?'s':''}</div>
          <div style="font-size:1.3rem;font-weight:800;color:#166842;">Q ${totalMes.toLocaleString('es',{minimumFractionDigits:2})}</div>
        </div>
        <div style="font-size:2rem;">💰</div>
      </div>`;
    }
  }
}

function exportResPDF() {
  const rows = allResRows;
  if (!rows || !rows.length) { alert('No hay reservaciones para exportar.'); return; }

  const desde  = document.getElementById('resFiltroDesde')?.value  || '';
  const hasta  = document.getElementById('resFiltroHasta')?.value  || '';
  const socio  = document.getElementById('resFiltroSocio')?.value  || '';
  const estado = document.getElementById('resFiltroEstatus')?.value || '';

  let filtered = [...rows];
  if (socio)  filtered = filtered.filter(r => (r.socio_nombre||'').toLowerCase().includes(socio.toLowerCase()) || (r.socio_codigo||'').toLowerCase().includes(socio.toLowerCase()));
  if (estado) filtered = filtered.filter(r => (r.estatus||'') === estado);
  if (desde)  filtered = filtered.filter(r => r.fecha_entrada && r.fecha_entrada >= desde);
  if (hasta)  filtered = filtered.filter(r => r.fecha_entrada && r.fecha_entrada <= hasta);

  const now    = new Date();
  const emision = now.toLocaleDateString('es-GT',{day:'2-digit',month:'long',year:'numeric'}) + ' · ' + now.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});

  const statusColors = { pendiente:'#7a5800', aprobada:'#166842', rechazada:'#b53326', confirmada:'#166842' };

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>Reporte Reservaciones VCA — ${emision}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Georgia',serif; color:#0d1f3a; background:white; padding:30px 36px; font-size:12px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #0a1628; padding-bottom:16px; margin-bottom:20px; }
    .header img { height:52px; object-fit:contain; }
    .header-right { text-align:right; }
    .header-right h1 { font-size:16px; font-weight:700; color:#0a1628; }
    .header-right p  { font-size:10px; color:#555; margin-top:3px; }
    .filters { background:#f4f7ff; border:1px solid #dce6f5; border-radius:8px; padding:10px 14px; margin-bottom:16px; font-size:10px; color:#555; }
    .filters strong { color:#0a1628; }
    table { width:100%; border-collapse:collapse; margin-bottom:20px; }
    thead tr { background:#0a1628; }
    thead th { color:white; padding:7px 9px; text-align:left; font-size:9px; text-transform:uppercase; letter-spacing:.6px; }
    tbody tr:nth-child(even) { background:#f5f5f5; }
    tbody td { padding:7px 9px; border-bottom:1px solid #e8e8e8; font-size:10px; vertical-align:top; }
    .badge { display:inline-block; padding:2px 7px; border-radius:10px; font-size:9px; font-weight:700; }
    .footer { text-align:center; font-size:9px; color:#aaa; border-top:1px solid #ddd; padding-top:10px; margin-top:10px; }
    @media print { body { padding:15px 20px; } }
  </style></head><body>
  <div class="header">
    <img src="https://vcaofamerica.com/wp-content/uploads/2016/07/logo-png.png" onerror="this.style.display='none'"/>
    <div class="header-right">
      <h1>Reporte de Reservaciones</h1>
      <p>Vacation Club of America · ${emision}</p>
      <p>Generado por: ${esc(currentUser||'—')} · ${filtered.length} registro${filtered.length!==1?'s':''}</p>
    </div>
  </div>
  ${(desde||hasta||socio||estado) ? `
  <div class="filters">
    <strong>Filtros aplicados:</strong>
    ${socio  ? ` Socio: <strong>${esc(socio)}</strong>` : ''}
    ${estado ? ` · Estatus: <strong>${esc(estado)}</strong>` : ''}
    ${desde  ? ` · Desde: <strong>${desde}</strong>` : ''}
    ${hasta  ? ` · Hasta: <strong>${hasta}</strong>` : ''}
  </div>` : ''}
  <table>
    <thead><tr>
      <th>#</th><th>Socio</th><th>Referencia</th><th>Hotel</th><th>Tipo</th>
      <th>Entrada</th><th>Salida</th><th>Personas</th><th>Estatus</th><th>Registrado</th>
    </tr></thead>
    <tbody>
    ${filtered.map((r,i) => {
      const color = statusColors[r.estatus] || '#555';
      const d = r.created_at ? new Date(r.created_at).toLocaleDateString('es') : '—';
      return `<tr>
        <td style="color:#888;">${i+1}</td>
        <td><strong>${esc(r.socio_nombre||'—')}</strong></td>
        <td style="font-family:monospace;">${esc(r.socio_codigo||'—')}</td>
        <td>${esc(r.hotel||'—')}</td>
        <td>${esc(r.tipo||'—')}</td>
        <td>${r.fecha_entrada||'—'}</td>
        <td>${r.fecha_salida||'—'}</td>
        <td style="text-align:center;">${r.personas||'—'}</td>
        <td><span class="badge" style="color:${color};border:1px solid ${color};">${esc(r.estatus||'—')}</span></td>
        <td style="color:#888;">${d}</td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>
  <div class="footer">Vacation Club of America · Reporte de Reservaciones · ${emision} · ${filtered.length} registros</div>
  <script>window.onload = () => { setTimeout(() => window.print(), 300); }<\/script>
  </body></html>`);
  w.document.close();
  logActivity('exportar_pdf', `Reservaciones: ${filtered.length} registros`);
}

function requestPushPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendPushNotification(title, body, icon = 'https://vcaofamerica.com/wp-content/uploads/2016/07/logo-png.png') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon, badge: icon, tag: 'vca-reserva' });
  } catch(e) {}
}

// Polling para el portal del socio — detectar cambios de estatus en sus reservas
let clientResPolling = null;
let lastClientResStatuses = {};

function startClientResPolling() {
  if (clientResPolling) clearInterval(clientResPolling);
  clientResPolling = setInterval(async () => {
    if (!clientSocio) return;
    try {
      const codigo  = encodeURIComponent(clientSocio.codigo || clientSocio.referencia || '');
      const headers = { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Accept': 'application/json' };
      const res     = await fetch(`${SUPABASE_URL}/rest/v1/reservaciones?socio_codigo=eq.${codigo}&select=id,estatus&order=created_at.desc&limit=20`, { headers });
      if (!res.ok) return;
      const rows = await res.json();
      rows.forEach(r => {
        const prev = lastClientResStatuses[r.id];
        if (prev && prev !== r.estatus) {
          // Cambio detectado
          if (r.estatus === 'aprobada') {
            sendPushNotification('✅ Reserva aprobada', 'Tu solicitud de reserva en VCA ha sido aprobada.');
            showClientResMsg('ok', '✅ ¡Tu reserva fue aprobada! Revisa "Mis Reservas".');
          } else if (r.estatus === 'rechazada') {
            sendPushNotification('❌ Reserva no aprobada', 'Tu solicitud de reserva no fue aprobada. Contacta a administración.');
            showClientResMsg('err', '❌ Tu reserva no fue aprobada. Contacta a administración.');
          }
          // Recargar lista de reservas del socio
          loadClientReservations();
        }
        lastClientResStatuses[r.id] = r.estatus;
      });
    } catch(e) {}
  }, 30000); // cada 30 segundos
}

function stopClientResPolling() {
  if (clientResPolling) { clearInterval(clientResPolling); clientResPolling = null; }
  lastClientResStatuses = {};
}

// Envolver quickApproveRes para loguear aprobaciones
const _origQuickApprove = quickApproveRes;
quickApproveRes = async function(id, estatus, btn) {
  await _origQuickApprove(id, estatus, btn);
  logActivity(estatus === 'aprobada' ? 'reserva_aprobada' : 'reserva_rechazada', `ID: ${id}`);
};

// Botón exportar PDF en el panel de historial de reservas
document.addEventListener('DOMContentLoaded', () => {
  const resHistHeader = document.querySelector('#pane-res-lista > div:last-of-type');
});

document.getElementById('searchBtn').addEventListener('click', () => doSearch());
document.getElementById('resSearchSocio').addEventListener('keydown', e => { if (e.key === 'Enter') searchSocioForRes(); });
document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key==='Enter') doSearch(); });
