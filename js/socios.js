function switchConfigTab(tab, skipReset) {
  if ((tab === 'usuarios' || tab === 'log') && currentRol !== 'admin') { showRootAccessDenied(); return; }
  document.querySelectorAll('#configTabNav .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#configBody .tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('ctab-' + tab).classList.add('active');
  document.getElementById('cpane-' + tab).classList.add('active');
  if (tab === 'usuarios') { renderConfigUsers(); loadUsers(); }
  if (tab === 'socios')   { renderConfigSocios(); }
  if (tab === 'log')      { renderActivityLog(); }
  if (tab === 'nuevo' && !skipReset) {
    if (!socioCanEdit()) { showRootAccessDenied(); return; }
    resetSocioForm();
  }
}

function renderConfigSocios() {
  ['socSearch','socTipo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['socEstadoOp','socEstadoFin'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const list = document.getElementById('sociosList');
  if (list) {
    delete list.dataset.searched;
    list.innerHTML = '<div class="socios-prompt"><div class="socios-prompt-icon">🔍</div><div class="socios-prompt-text">Escribe en el buscador para encontrar socios</div><div class="socios-prompt-sub">La lista se muestra solo al buscar para proteger la privacidad</div></div>';
  }
  loadSocios();
}

function renderConfigUsers() {}

async function listUsers() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=50`, {
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.users || json;
}

async function listProfiles() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*`, {
    headers: { ...authHeaders(), 'Accept': 'application/json' }
  });
  if (!res.ok) return {};
  const rows = await res.json();
  const map = {};
  rows.forEach(r => { map[r.user_id] = r; });
  return map;
}

async function loadUsers() {
  if (currentRol !== 'admin') return;
  const list = document.getElementById('userList');
  list.innerHTML = '<div class="empty-log"><div class="ei" style="font-size:24px;">⏳</div><p>Cargando…</p></div>';
  const [users, profiles] = await Promise.all([listUsers(), listProfiles()]);
  if (!users) {
    list.innerHTML = '<div class="empty-log"><div class="ei">⚠️</div><p>Error al cargar usuarios.<br>Verifica permisos de Supabase.</p></div>';
    return;
  }
  if (!users.length) {
    list.innerHTML = '<div class="empty-log"><div class="ei">👤</div><p>No hay usuarios registrados.</p></div>';
    return;
  }

  const USER_COLORS = [
    'linear-gradient(135deg,#283593,#3f51b5)',
    'linear-gradient(135deg,#2e7d32,#43a047)',
    'linear-gradient(135deg,#7a3a00,#f5c518)',
    'linear-gradient(135deg,#6b21a8,#9333ea)',
    'linear-gradient(135deg,#b53326,#ef4444)',
  ];

  list.innerHTML = users.map((u, i) => {
    const profile = profiles[u.id] || {};
    const rol    = profile.is_admin ? 'admin' : 'usuario';
    const nombre = profile.display_name || u.email?.split('@')[0] || '—';
    const color  = USER_COLORS[i % USER_COLORS.length];
    return `
    <div class="user-card" id="uc-${u.id}">
      <div class="uc-avatar" style="background:${color}">${(nombre[0] || '?').toUpperCase()}</div>
      <div class="uc-info">
        <div class="uc-name">${esc(nombre)}</div>
        <div class="uc-email">${esc(u.email)}</div>
        <span class="uc-role ${rol}">${rol === 'admin' ? '⚿ Admin' : '👤 Usuario'}</span>
      </div>
      <div class="uc-actions">
        <button class="uc-btn" onclick="openChangePassModal('${u.id}','${esc(nombre)}')">🔑</button>
        <button class="uc-btn" onclick="editUser('${u.id}','${esc(nombre)}','${esc(u.email)}','${rol}')">✏️</button>
        <button class="uc-btn del" onclick="deleteUser('${u.id}','${esc(nombre)}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}

let editingUserId = null;

async function saveUser() {
  if (currentRol !== 'admin') { showFormMsg('err', 'Solo un administrador puede gestionar usuarios.'); return; }
  const nombre = document.getElementById('fNombre').value.trim();
  const email  = document.getElementById('fEmail').value.trim().toLowerCase();
  const pass   = document.getElementById('fPass').value;
  const rol    = document.getElementById('fRol').value;
  const btn    = document.getElementById('formSaveBtn');

  if (!nombre || !email) { showFormMsg('err', 'Nombre y correo son obligatorios.'); return; }
  if (!editingUserId && pass.length < 6) { showFormMsg('err', 'La contraseña debe tener al menos 6 caracteres.'); return; }

  btn.textContent = 'Guardando…'; btn.disabled = true;

  try {
    let userId = editingUserId;

    if (!editingUserId) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, email_confirm: true })
      });
      const json = await res.json();
      if (!res.ok) { showFormMsg('err', json.msg || json.error_description || 'Error al crear usuario.'); btn.textContent = 'Crear usuario'; btn.disabled = false; return; }
      userId = json.id;
    } else {
      if (pass.length >= 6) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${editingUserId}`, {
          method: 'PUT',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass })
        });
        if (!res.ok) { showFormMsg('err', 'Error al actualizar contraseña.'); btn.textContent = 'Guardar cambios'; btn.disabled = false; return; }
      }
    }

    await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: userId, display_name: nombre, is_admin: rol === 'admin' })
    });

    showFormMsg('ok', editingUserId ? `✅ ${nombre} actualizado correctamente.` : `✅ Usuario ${nombre} creado correctamente.`);
    resetForm();
    loadUsers();
  } catch(e) {
    showFormMsg('err', 'Error inesperado. Intenta de nuevo.');
  }
  btn.textContent = editingUserId ? 'Guardar cambios' : 'Crear usuario';
  btn.disabled = false;
}

function editUser(id, nombre, email, rol) {
  document.querySelectorAll('#configTabNav .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#configBody .tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('ctab-usuarios').classList.add('active');
  document.getElementById('cpane-usuarios').classList.add('active');

  editingUserId = id;
  document.getElementById('fNombre').value = nombre;
  document.getElementById('fEmail').value  = email;
  document.getElementById('fPass').value   = '';
  document.getElementById('fRol').value    = rol;
  document.getElementById('fEmail').disabled = true;
  document.getElementById('fPass').closest('.form-group').style.display = 'none';
  document.getElementById('formTitle').textContent = `✏️ Editando: ${nombre}`;
  document.getElementById('formSaveBtn').textContent = 'Guardar cambios';
  document.getElementById('formMsg').className = 'form-msg';

  setTimeout(() => {
    document.getElementById('userForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('fNombre').focus();
  }, 50);
}

function resetForm() {
  editingUserId = null;
  document.getElementById('fNombre').value = '';
  document.getElementById('fEmail').value  = '';
  document.getElementById('fPass').value   = '';
  document.getElementById('fRol').value    = 'usuario';
  document.getElementById('fEmail').disabled = false;
  document.getElementById('fPass').closest('.form-group').style.display = '';
  document.getElementById('formTitle').textContent = '➕ Nuevo usuario';
  document.getElementById('formSaveBtn').textContent = 'Crear usuario';
}

async function deleteUser(id, nombre) {
  if (currentRol !== 'admin') { alert('Solo un administrador puede eliminar usuarios.'); return; }
  if (!confirm(`¿Eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`)) return;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
  });
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${id}`, {
    method: 'DELETE', headers: authHeaders()
  });
  if (res.ok) {
    document.getElementById('uc-' + id)?.remove();
    if (editingUserId === id) resetForm();
  } else {
    alert('Error al eliminar usuario. Verifica permisos en Supabase.');
  }
}

function showFormMsg(type, msg) {
  const el = document.getElementById('formMsg');
  el.className = 'form-msg ' + type;
  el.textContent = msg;
}

async function clearReport() {
  if (currentRol !== 'admin') { alert('Solo un administrador puede eliminar todo el historial.'); return; }
  if (!confirm('¿Eliminar TODO el historial de consultas? Esta acción no se puede deshacer.')) return;
  if (!supabaseReady) { alert('Configura Supabase primero.'); return; }
  const btn = document.querySelector('.danger-btn');
  if (btn) { btn.textContent = 'Eliminando…'; btn.disabled = true; }
  await sbDelete();
  allRows = [];
  document.getElementById('statTotal').textContent    = '0';
  document.getElementById('statUnique').textContent   = '0';
  document.getElementById('statNotFound').textContent = '0';
  document.getElementById('filterCount').textContent  = '';
  document.getElementById('logList').innerHTML =
    `<div class="empty-log"><div class="ei">📋</div><p>Historial eliminado correctamente.</p></div>`;
  if (btn) { btn.textContent = '🗑 Eliminar todo el historial'; btn.disabled = false; }
  setTimeout(() => loadReport(), 800);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
