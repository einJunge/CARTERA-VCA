/* Cartera Activa VCA — auth.js */

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
  }

  /* ══ Supabase Auth helpers ══ */
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
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const pass  = document.getElementById('loginPassword').value;
    const btn   = document.getElementById('loginBtn');
    const err   = document.getElementById('loginErr');

    if (!email || !pass) { err.classList.add('on'); return; }
    err.classList.remove('on');
    btn.textContent = 'Verificando…'; btn.disabled = true;

    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      const json = await res.json();

      if (!res.ok || !json.access_token) {
        err.classList.add('on');
        btn.textContent = 'Iniciar sesión'; btn.disabled = false;
        document.getElementById('loginPassword').value = '';
        return;
      }

      authToken    = json.access_token;
      currentEmail = email;
      authUserId   = json.user?.id || null;

      const roleRow = await fetchCurrentRole(email, json.user?.id);
      currentUser = roleRow?.nombre || email;
      currentRol  = roleRow?.rol || 'usuario';

      // Persist token for session
      try { sessionStorage.setItem('vca_token', authToken); sessionStorage.setItem('vca_email', email); } catch(e) {}

      activateUser();
    } catch(e) {
      err.classList.add('on');
      btn.textContent = 'Iniciar sesión'; btn.disabled = false;
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && ['loginEmail','loginPassword'].includes(document.activeElement?.id)) doLogin();
  });

  async function tryRestoreSession() {
    try {
      const tok   = sessionStorage.getItem('vca_token');
      const email = sessionStorage.getItem('vca_email');
      if (!tok || !email) return false;
      // Verify token still valid
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${tok}` }
      });
      if (!res.ok) { sessionStorage.clear(); return false; }
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
    const meta = USER_META[currentEmail?.toLowerCase()] || { color: 'linear-gradient(135deg,#555,#888)' };
    const chip     = document.getElementById('userChip');
    const avatar   = document.getElementById('userAvatar');
    const chipName = document.getElementById('userChipName');
    if (chip) {
      chip.style.display = 'flex';
      avatar.style.background = meta.color;
      avatar.textContent = (currentUser || '?')[0]?.toUpperCase() || '?';
      chipName.textContent = currentUser;
    }

    // Config screen tabs handled in goToConfig()
    const dangerBtn = document.querySelector('.danger-btn');
    if (dangerBtn) {
      dangerBtn.style.display = currentRol === 'admin' ? 'block' : 'none';
    }
    
    // Show/hide main config button based on role
    const mainConfigBtn = document.getElementById('mainConfigBtn');
    if (mainConfigBtn) {
      mainConfigBtn.style.display = currentRol === 'admin' ? 'flex' : 'none';
    }

    document.getElementById('loginBtn').textContent = 'Iniciar sesión';
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginPassword').value = '';
    showScreen('screenMain');
    loadData();
    if (!pollingInterval) startPolling();
  }

  async function loadData() {
    // Restore local data first
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
    // Sign out from Supabase
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${authToken}` }
      });
    } catch(e) {}
    authToken = null; currentUser = null; currentEmail = null; currentRol = null;
    try { sessionStorage.clear(); } catch(e) {}
    if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    showScreen('screenLogin');
  }

  /* ══ init — try restore session first ══ */
  (async () => {
    const restored = await tryRestoreSession();
    if (restored) {
      activateUser();
    }
    // else stays on screenLogin
  })();

  function goToReport() {
    if (!currentUser) { showScreen('screenLogin'); return; }
    showScreen('screenReport');
    switchTab('consultas');
    loadReport();
  }

  function goToConfig() {
    if (!currentUser) { showScreen('screenLogin'); return; }
    if (currentRol !== 'admin') {
      alert('Acceso denegado: Solo administradores pueden entrar a configuración.');
      return;
    }
    showScreen('screenConfig');
    // All config tabs visible to admins (config screen is admin-only)
    ['ctab-usuarios','ctab-nuevo','ctab-socios'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = '';
    });
    // Default to socios
    switchConfigTab('socios');
  }

  function goToReservations() {
    if (!currentUser) { showScreen('screenLogin'); return; }
    showScreen('screenReservations');
    switchResTab('nueva');
  }
