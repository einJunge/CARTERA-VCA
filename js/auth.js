function getUserColor(email) {
  if (!email) return USER_COLORS[0];
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return USER_COLORS[h % USER_COLORS.length];
}

let data = [], searchHist = [], searchFreq = {};
let currentUser  = null;
let currentEmail = null;
let currentRol   = null;
let authToken    = null;
let authUserId   = null;
const DATA_KEY        = 'cartera_vca_data_v3';
const LAST_RESULT_KEY = 'cartera_vca_last_result';
let deferredPrompt = null;

const searchCache = new Map();
const SEARCH_CACHE_MAX = 60;

let loginAttempts = 0;
let loginLockUntil = 0;

// Restaurar rate limit desde sessionStorage (sobrevive F5)
try {
  const savedLock = parseInt(sessionStorage.getItem('vca_lock_until') || '0');
  if (savedLock > Date.now()) { loginLockUntil = savedLock; }
  loginAttempts = parseInt(sessionStorage.getItem('vca_login_attempts') || '0');
} catch(e) {}
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS   = 15 * 60 * 1000;
const IDLE_TIMEOUT_MS    = 30 * 60 * 1000;
let idleTimer = null;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  if (!currentUser) return;
  idleTimer = setTimeout(() => {
    if (currentUser) logout();
  }, IDLE_TIMEOUT_MS);
}

['click','keydown','mousemove','touchstart'].forEach(evt =>
  document.addEventListener(evt, resetIdleTimer, { passive: true })
);

const supabaseReady = SUPABASE_URL !== 'PEGA_TU_URL_AQUI';

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

async function fetchCurrentRole(email, userId) {
  try {
    let url = `${SUPABASE_URL}/rest/v1/profiles?select=user_id,display_name,is_admin`;
    if (userId) {
      url += `&user_id=eq.${encodeURIComponent(userId)}`;
    } else {
      return null;
    }
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${authToken || SUPABASE_KEY}`,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || !rows.length) return null;
    const row = rows[0];
    return {
      nombre: row.display_name || email,
      rol: row.is_admin ? 'admin' : 'usuario',
      is_admin: !!row.is_admin,
      user_id: row.user_id
    };
  } catch (e) {
    return null;
  }
}

function authHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': authToken ? `Bearer ${authToken}` : `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

async function doLogin() {
  const raw  = (document.getElementById('loginEmail').value || '').trim();
  const pass = document.getElementById('loginPassword').value;
  const btn  = document.getElementById('loginBtn');
  const err  = document.getElementById('loginErr');

  const showErr = (msg) => {
    err.textContent = msg;
    err.classList.add('on');
    btn.textContent = 'Iniciar sesión';
    btn.disabled = false;
  };

  err.classList.remove('on');
  err.textContent = '';

  if (!raw || !pass) { showErr('⚠️ Completa todos los campos.'); return; }

  if (Date.now() < loginLockUntil) {
    showErr(`⏳ Demasiados intentos. Espera ${Math.ceil((loginLockUntil - Date.now()) / 1000)}s.`);
    return;
  }

  btn.textContent = 'Verificando…'; btn.disabled = true;

  try {
    let email = raw.toLowerCase();

    if (!email.includes('@')) {
      let lookupRows = [];
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?select=user_id,display_name&display_name=ilike.${encodeURIComponent(raw)}&limit=1`,
          { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Accept': 'application/json' } }
        );
        if (r.ok) lookupRows = await r.json();
      } catch(e) {}

      if (!lookupRows.length) { showErr('⚠️ Usuario no encontrado. Intenta con tu correo.'); return; }

      const userId = lookupRows[0].user_id;
      let userEmail = '';
      try {
        const r2 = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
          { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
        );
        if (r2.ok) { const u = await r2.json(); userEmail = (u.email || '').toLowerCase(); }
      } catch(e) {}

      if (!userEmail) { showErr('⚠️ No se pudo resolver el usuario. Usa tu correo.'); return; }
      email = userEmail;
    }

    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });

    let json = {};
    try { json = await res.json(); } catch(e) {}

    if (!res.ok || !json.access_token) {
      loginAttempts++;
      if (loginAttempts >= LOGIN_MAX_ATTEMPTS) {
        loginLockUntil = Date.now() + LOGIN_LOCKOUT_MS;
        loginAttempts  = 0;
        try { sessionStorage.setItem('vca_lock_until', String(loginLockUntil)); sessionStorage.setItem('vca_login_attempts', '0'); } catch(e) {}
        showErr(`🔒 Cuenta bloqueada ${LOGIN_LOCKOUT_MS/60000} minutos por múltiples intentos fallidos.`);
      } else {
        try { sessionStorage.setItem('vca_login_attempts', String(loginAttempts)); } catch(e) {}
        const detail = json.error_description || json.msg || json.error || '';
        showErr(`⚠️ Credenciales incorrectas${detail ? ': ' + detail : ''} (${loginAttempts}/${LOGIN_MAX_ATTEMPTS})`);
      }
      document.getElementById('loginPassword').value = '';
      return;
    }

    loginAttempts  = 0;
    loginLockUntil = 0;
    loginAttempts  = 0;
    try { sessionStorage.removeItem('vca_lock_until'); sessionStorage.removeItem('vca_login_attempts'); } catch(e) {}
    authToken      = json.access_token;
    currentEmail   = email;
    authUserId     = json.user?.id || null;

    const roleRow  = await fetchCurrentRole(email, json.user?.id);
    currentUser    = roleRow?.nombre || email;
    currentRol     = roleRow?.rol    || 'usuario';

    try {
      localStorage.setItem('vca_token',   authToken);
      localStorage.setItem('vca_email',   email);
      localStorage.setItem('vca_refresh', json.refresh_token || '');
    } catch(e) {}

    activateUser();

  } catch(e) {
    showErr('⚠️ Error de conexión. Verifica tu internet e intenta de nuevo.');
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && ['loginEmail','loginPassword'].includes(document.activeElement?.id)) doLogin();
});

async function tryRestoreSession() {
  try {
    let tok     = localStorage.getItem('vca_token');
    const email = localStorage.getItem('vca_email');
    const refresh = localStorage.getItem('vca_refresh');
    if (!tok || !email) return false;

    // Validar expiración del JWT localmente antes de hacer fetch
    let tokenExpired = false;
    try {
      const payload = JSON.parse(atob(tok.split('.')[1]));
      if (payload.exp && Date.now() / 1000 > payload.exp) tokenExpired = true;
    } catch(e) { tokenExpired = true; }

    // Si expiró y hay refresh_token, renovar silenciosamente
    if (tokenExpired && refresh) {
      const refreshRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh })
      });
      if (!refreshRes.ok) {
        localStorage.removeItem('vca_token');
        localStorage.removeItem('vca_email');
        localStorage.removeItem('vca_refresh');
        return false;
      }
      const refreshJson = await refreshRes.json();
      tok = refreshJson.access_token;
      try {
        localStorage.setItem('vca_token',   tok);
        localStorage.setItem('vca_refresh', refreshJson.refresh_token || refresh);
      } catch(e) {}
    } else if (tokenExpired) {
      localStorage.removeItem('vca_token');
      localStorage.removeItem('vca_email');
      localStorage.removeItem('vca_refresh');
      return false;
    }

    // Verificar token con Supabase
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${tok}` }
    });
    if (!res.ok) {
      localStorage.removeItem('vca_token');
      localStorage.removeItem('vca_email');
      localStorage.removeItem('vca_refresh');
      return false;
    }

    authToken    = tok;
    currentEmail = email;
    const userJson = await res.json();
    authUserId = userJson?.id || null;
    const roleRow  = await fetchCurrentRole(email, userJson?.id);
    currentUser = roleRow?.nombre || email;
    currentRol  = roleRow?.rol || 'usuario';
    return true;
  } catch(e) { return false; }
}

function activateUser() {
  const userColor = getUserColor(currentEmail);
  const chip      = document.getElementById('userChip');
  const avatar    = document.getElementById('userAvatar');
  const chipName  = document.getElementById('userChipName');
  if (chip)     chip.style.display   = 'flex';
  if (avatar)   { avatar.style.background = userColor; avatar.textContent = (currentUser || '?')[0]?.toUpperCase() || '?'; }
  if (chipName) chipName.textContent = currentUser;

  const dangerBtn    = document.querySelector('.danger-btn');
  const mainConfigBtn = document.getElementById('mainConfigBtn');
  const menuConfigBtn = document.getElementById('menuConfigBtn');
  if (dangerBtn)     dangerBtn.style.display     = currentRol === 'admin' ? 'block' : 'none';
  if (mainConfigBtn) mainConfigBtn.style.display = currentRol === 'admin' ? 'flex'  : 'none';
  if (menuConfigBtn) menuConfigBtn.style.display = currentRol === 'admin' ? 'flex'  : 'none';
  const menuDashBtn = document.getElementById('menuDashBtn');
  if (menuDashBtn)   menuDashBtn.style.display   = currentRol === 'admin' ? 'flex'  : 'none';

  const loginBtn  = document.getElementById('loginBtn');
  const loginPass = document.getElementById('loginPassword');
  if (loginBtn)  { loginBtn.textContent = 'Iniciar sesión'; loginBtn.disabled = false; }
  if (loginPass) loginPass.value = '';

  showScreen('screenMain');
  loadData();
  if (!pollingInterval) startPolling();
  resetIdleTimer();
  checkPendingReservations();
  logActivity('login', currentEmail || '');
  // Limpiar búsqueda anterior — no restaurar estado de búsqueda al recargar
  try { sessionStorage.removeItem(LAST_RESULT_KEY); } catch(e) {}
  document.getElementById('searchInput').value = '';
}

async function loadData() {
  try {
    const s = localStorage.getItem(DATA_KEY);
    if (s) {
      data = JSON.parse(s);
      showStatus('ok', `${data.length} registros listos (verificando nube…)`);
      document.getElementById('searchBtn').disabled = false;
      setChip(data.length);
    }
  } catch(e) { localStorage.removeItem(DATA_KEY); }
  tryAutoLoadExcel();
}

async function logout() {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${authToken}` }
    });
  } catch(e) {}

  logActivity('logout', currentEmail || '');
  stopClientResPolling();
  authToken = null; currentUser = null; currentEmail = null; currentRol = null; authUserId = null;

  data = []; searchHist = []; searchFreq = {};
  searchCache.clear();
  Object.keys(notesCache).forEach(k => delete notesCache[k]);

  try { localStorage.removeItem('vca_token'); localStorage.removeItem('vca_email'); localStorage.removeItem('vca_refresh'); sessionStorage.clear(); } catch(e) {}

  const resultsWrap = document.getElementById('resultsWrap');
  if (resultsWrap) resultsWrap.style.display = 'none';
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.style.display = 'block';
  const statsPanel = document.getElementById('statsPanel');
  if (statsPanel) statsPanel.style.display = 'none';
  const histSection = document.getElementById('histSection');
  if (histSection) histSection.style.display = 'none';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
  const recordsChip = document.getElementById('recordsChip');
  if (recordsChip) recordsChip.classList.remove('show');
  const pendingResPanel = document.getElementById('pendingResPanel');
  if (pendingResPanel) pendingResPanel.style.display = 'none';

  clearTimeout(idleTimer);
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
  showScreen('screenLogin');
}

(async () => {
  const restored = await tryRestoreSession();
  if (restored) activateUser();
})();
