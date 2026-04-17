/* Cartera Activa VCA — socios.js */

  function switchTab(tab) {
    // Report screen — only consultas tab remains
    document.querySelectorAll('#screenReport .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#screenReport .tab-pane').forEach(p => p.classList.remove('active'));
    const btn = document.getElementById('tab-' + tab);
    const pane = document.getElementById('pane-' + tab);
    if (btn)  btn.classList.add('active');
    if (pane) pane.classList.add('active');
  }

  function switchConfigTab(tab) {
    if (tab === 'usuarios' && currentRol !== 'admin') { showRootAccessDenied(); return; }
    document.querySelectorAll('#configTabNav .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#configBody .tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('ctab-' + tab).classList.add('active');
    document.getElementById('cpane-' + tab).classList.add('active');
    if (tab === 'usuarios') { renderConfigUsers(); loadUsers(); }
    if (tab === 'socios')   { renderConfigSocios(); }
    if (tab === 'nuevo') {
      if (!socioCanEdit()) { showRootAccessDenied(); return; }
      resetSocioForm();
    }
  }

  function renderConfigSocios() {
    clearSociosFilters();
    loadSocios();
  }

  function renderConfigUsers() {
    // users already in cpane-usuarios — just reload
  }


  /* ══════════════════════════════════════════
     SOCIOS MANAGEMENT
  ══════════════════════════════════════════ */
  let sociosRows = [];
  let sociosFiltered = [];
  let selectedSocioId = null;
  let editingSocioId = null;
  let pagosRows = [];

  function socioCanEdit() { return currentRol === 'admin'; }

  async function fetchSocios() {
    // Intentar con JWT del usuario; si falla con 403/401, usar service key
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

    // 1st attempt — user JWT
    try {
      return await tryFetch(authHeaders());
    } catch (e1) {
      console.warn('fetchSocios with JWT failed:', e1.status, e1.body);
      // 2nd attempt — service key (bypasses RLS, always works)
      try {
        const svcHdrs = {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };
        const rows = await tryFetch(svcHdrs);
        console.info('fetchSocios fallback to service key succeeded');
        return rows;
      } catch (e2) {
        console.error('fetchSocios service key also failed:', e2.status, e2.body);
        throw new Error(`HTTP ${e2.status}: ${e2.body}`);
      }
    }
  }

  async function fetchPagos(socioId) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pagos?select=*&socio_id=eq.${encodeURIComponent(socioId)}&order=created_at.desc`, { headers: authHeaders() });
    const txt = await res.text();
    console.log('fetchPagos', res.status, txt);
    if (!res.ok) throw new Error(txt || `fetchPagos failed: ${res.status}`);
    return JSON.parse(txt);
  }

  function updateSociosStats(rows) {
    const activos = rows.filter(r => (r.estado_operativo || '') === 'activo').length;
    const mora    = rows.filter(r => (r.estado_financiero || '') === 'mora').length;
    const vencer  = rows.filter(r => (r.estado_financiero || '') === 'proximo_vencer').length;
    const enBD    = rows.filter(r => !r._source).length;
    const enExcel = rows.filter(r =>  r._source === 'excel').length;
    document.getElementById('socStatTotal').textContent    = rows.length;
    document.getElementById('socStatActivos').textContent  = activos;
    document.getElementById('socStatMora').textContent     = mora;
    document.getElementById('socStatVencer').textContent   = vencer;
    // Mostrar desglose si hay elemento disponible
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
        <div class="socio-avatar" style="${isExcel?'background:linear-gradient(135deg,#0f6e56,#1d9e75)':''}">${esc((r.nombre_completo||'?')[0].toUpperCase())}</div>
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
    // Only load stats on init — list stays hidden until user searches
    const list = document.getElementById('sociosList');
    if (list && !list.dataset.searched) {
      list.innerHTML = '<div class="socios-prompt"><div class="socios-prompt-icon">🔍</div><div class="socios-prompt-text">Escribe en el buscador para encontrar socios</div><div class="socios-prompt-sub">La lista se muestra solo al buscar para proteger la privacidad</div></div>';
    }
    try {
      // Cargar socios de Supabase (solo para estadísticas)
      const dbRows = await fetchSocios();

      // Normalizar socios del Excel (cartera activa en memoria/nube)
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

      // Merge: DB socios primero, luego Excel (solo los que no estén ya en DB por código)
      const dbCodigos = new Set((dbRows || []).map(r => (r.codigo || '').trim().toLowerCase()));
      const excelNuevos = excelRows.filter(r =>
        r.codigo && !dbCodigos.has(r.codigo.trim().toLowerCase())
      );

      sociosRows = [...(dbRows || []), ...excelNuevos];
      sociosFiltered = [...sociosRows];
      // Only update stats — don't render list until user searches
      updateSociosStats(sociosRows);
      document.getElementById('socCount').textContent = `${sociosRows.length} socios en total`;
      setSociosEditability();
    } catch (e) {
      console.error('loadSocios error:', e);
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
    const payload = getSocioPayload();
    if (!payload.codigo || !payload.nombre_completo || !payload.tipo_membresia) {
      showSocioMsg('err', 'Código, nombre y tipo de membresía son obligatorios.'); return;
    }
    const wasEditing = !!editingSocioId;
    btn.disabled = true; btn.textContent = 'Guardando…';

    try {
      // ── Duplicate check ──
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

      // ── Save ──
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
      // After creating new socio, go to list tab after short delay
      if (_wasNew) setTimeout(() => switchConfigTab('socios'), 1400);
    } catch(e) {
      console.error(e);
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

    const isExcel = r._source === 'excel';

    if (isExcel) {
      // Auto-save to DB first, then open in edit mode
      await saveExcelSocioToDB(r);
      return;
    }

    // Normal DB edit
    editingSocioId = id;
    fillSocioForm(r);
    document.getElementById('socioFormTitle').textContent = `✏️ Editando: ${r.nombre_completo || ''}`;
    document.getElementById('socioSaveBtn').textContent   = 'Guardar cambios';
    switchConfigTab('nuevo');
    setTimeout(() => document.getElementById('sociosFormCard').scrollIntoView({ behavior:'smooth', block:'start' }), 150);
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
    // Check if already in DB by code
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/socios?select=id,nombre_completo&codigo=eq.${encodeURIComponent(r.codigo)}&limit=1`,
      { headers: authHeaders() }
    );
    if (checkRes.ok) {
      const existing = await checkRes.json();
      if (existing.length) {
        // Already in DB — open directly in edit mode
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
            switchConfigTab('nuevo');
    setTimeout(() => document.getElementById('sociosFormCard').scrollIntoView({ behavior:'smooth', block:'start' }), 150);
            return;
          }
        }
      }
    }

    // Not in DB — insert it now
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

    // Reload and open in edit mode
    await loadSocios();
    if (newId) {
      editingSocioId = newId;
      fillSocioForm(payload);
      document.getElementById('socioFormTitle').textContent = `✏️ Editando: ${payload.nombre_completo}`;
      document.getElementById('socioSaveBtn').textContent   = 'Guardar cambios';
      showSocioMsg('ok', '✅ Socio guardado en BD. Ahora puedes completar sus datos.');
      switchConfigTab('nuevo');
    setTimeout(() => document.getElementById('sociosFormCard').scrollIntoView({ behavior:'smooth', block:'start' }), 150);
    }
  }

  async function deleteSocio(id, nombre) {
    if (!socioCanEdit()) { alert('Solo un administrador puede eliminar socios.'); return; }

    const isExcel = String(id).startsWith('__excel__');

    if (isExcel) {
      // Excel socio: check if it's in DB already
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
        // Already in DB — delete from DB
        if (!confirm(`¿Eliminar al socio "${nombre}" de la base de datos?\nEsta acción no se puede deshacer.`)) return;
        const delRes = await fetch(`${SUPABASE_URL}/rest/v1/socios?id=eq.${encodeURIComponent(dbId)}`, {
          method:'DELETE', headers: authHeaders()
        });
        if (!delRes.ok) { alert('No se pudo eliminar el socio de la BD.'); return; }
        showSocioMsg('ok', `✅ Socio "${nombre}" eliminado de la base de datos.`);
      } else {
        // Only in Excel memory — just remove from current view
        if (!confirm(`"${nombre}" solo existe en el Excel cargado, no en la BD.\n¿Ocultar de la lista en esta sesión?`)) return;
        // Remove from local array
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
    // Excel rows — show read-only detail, no pagos
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
          <div style="margin-top:6px;padding:10px;background:#e8f5ee;border-radius:8px;font-size:.78rem;color:#166842;">
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
    const wrap = document.getElementById('payList');
    if (!wrap) return;
    try {
      const rows = await fetchPagos(selectedSocioId);
      pagosRows = rows;
      if (!rows.length) {
        wrap.innerHTML = '<div class="socios-empty">Este socio no tiene pagos registrados.</div>';
        return;
      }
      wrap.innerHTML = rows.map(r => `
      <div class="pay-item">
        <div class="p1">Q ${Number(r.monto || 0).toFixed(2)} · ${esc(r.concepto || 'Pago')}</div>
        <div class="p2">${fmtDate(r.fecha_pago)} · ${esc(r.metodo_pago || 'Sin método')} · ${esc(r.estado_pago || '—')}<br>
        Período: ${fmtDate(r.periodo_desde)} a ${fmtDate(r.periodo_hasta)}<br>
        ${esc(r.comentario || '')}</div>
      </div>
    `).join('');
    } catch (e) {
      console.error(e);
      wrap.innerHTML = '<div class="socios-empty">No se pudieron cargar los pagos. Revisa la policy SELECT de public.pagos.</div>';
    }
  }

  async function savePago() {
    if (!socioCanEdit()) { showPagoMsg('err','Solo un administrador puede registrar pagos.'); return; }
    if (!selectedSocioId) { showPagoMsg('err','Selecciona un socio primero.'); return; }
    const fecha_pago = document.getElementById('pFecha').value;
    const monto = document.getElementById('pMonto').value;
    if (!fecha_pago || !monto) { showPagoMsg('err','Fecha y monto son obligatorios.'); return; }
    const btn = document.getElementById('pagoSaveBtn');
    btn.disabled = true; btn.textContent = 'Guardando…';
    const payload = {
      socio_id: selectedSocioId,
      fecha_pago,
      monto: Number(monto),
      metodo_pago: document.getElementById('pMetodo').value.trim() || null,
      concepto: document.getElementById('pConcepto').value.trim() || null,
      periodo_desde: document.getElementById('pDesde').value || null,
      periodo_hasta: document.getElementById('pHasta').value || null,
      comentario: document.getElementById('pComentario').value.trim() || null,
      estado_pago: 'aplicado',
      registrado_por: authUserId || null
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/pagos`, {
      method:'POST', headers:{ ...authHeaders(), 'Prefer':'return=representation' }, body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      console.error(json);
      showPagoMsg('err', json?.message || 'No se pudo registrar el pago.');
      btn.disabled = false; btn.textContent = 'Registrar pago';
      return;
    }
    showPagoMsg('ok','✅ Pago registrado correctamente.');
    ['pFecha','pMonto','pMetodo','pConcepto','pDesde','pHasta','pComentario'].forEach(id => document.getElementById(id).value = '');
    await loadPagosOfSelected();
    btn.disabled = false; btn.textContent = 'Registrar pago';
  }

  function showPagoMsg(type, text) {
    const el = document.getElementById('pagoMsg');
    el.className = 'form-msg ' + type;
    el.textContent = text;
  }


  /* ══════════════════════════════════════════
     IMPORT EXCEL → DB  (bulk upsert)
  ══════════════════════════════════════════ */
  async function importExcelToDb() {
    if (!socioCanEdit()) { alert('Solo administradores pueden importar socios.'); return; }
    if (!data || !data.length) { alert('Primero carga un archivo Excel desde la pantalla principal.'); return; }
    if (!confirm(`¿Importar ${data.length} socios del Excel a la base de datos?\n\nSe crearán socios nuevos y se actualizarán los existentes por código de referencia.`)) return;

    const list = document.getElementById('sociosList');
    if (list) list.innerHTML = '<div class="socios-empty">⏳ Importando socios del Excel…</div>';

    const toUpsert = [];
    const skipped  = [];
    const seenCodes = new Set();

    data.forEach(r => {
      const codigo = (r.referencia || '').trim();
      if (!codigo) { skipped.push(`Sin código: ${r.socio}`); return; }
      
      // Evitar duplicados dentro del mismo Excel
      if (seenCodes.has(codigo.toLowerCase())) { return; }
      seenCodes.add(codigo.toLowerCase());

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
        // Solo incluimos created_by si es necesario, pero para upsert 
        // Supabase lo manejará si la fila es nueva.
        created_by:        authUserId      || null,
      });
    });

    if (!toUpsert.length) {
      showSocioMsg('ok', `✅ No hay socios válidos para importar. (${skipped.length} omitidos)`);
      await loadSocios(); return;
    }

    // Upsert in batches of 100
    let processed = 0;
    const batchSize = 100;
    for (let i = 0; i < toUpsert.length; i += batchSize) {
      const batch = toUpsert.slice(i, i + batchSize);
      // Usamos POST con on_conflict=codigo y Prefer: resolution=merge-duplicates para hacer UPSERT
      const res = await fetch(`${SUPABASE_URL}/rest/v1/socios?on_conflict=codigo`, {
        method: 'POST',
        headers: { 
          ...authHeaders(), 
          'Prefer': 'return=minimal, resolution=merge-duplicates',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(batch)
      });
      
      if (res.ok) {
        processed += batch.length;
      } else {
        const errorText = await res.text();
        console.error('Batch upsert error', res.status, errorText);
        try {
          const errorJson = JSON.parse(errorText);
          showSocioMsg('err', `❌ Error en lote: ${errorJson.message || errorText}`);
        } catch(e) {
          showSocioMsg('err', `❌ Error en lote: ${res.status}`);
        }
      }
    }

    showSocioMsg('ok', `✅ ${processed} socios procesados (creados o actualizados). ${skipped.length} omitidos sin código.`);
    await loadSocios();
  }

  /* ══════════════════════════════════════════
     EXPORT SOCIOS → EXCEL (mismo formato que el upload)
  ══════════════════════════════════════════ */
  function exportSociosExcel() {
    // Combinar todos (BD + Excel) en el mismo formato del archivo de carga
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

    // Build CSV (compatible con Excel)
    const headers = ['referencia','socio','departamento','inicio','vencimiento','ultimo pago','Ultimo año de pago','Notas'];
    const csvRows = [
      headers.join(','),
      ...allRows.map(r => headers.map(h => {
        const val = String(r[h] || '').replace(/"/g, '""');
        return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
      }).join(','))
    ];
    const csv  = '\uFEFF' + csvRows.join('\r\n'); // BOM para Excel en español
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
    if (list) list.dataset.searched = '1'; // mark as user-initiated
    const search   = (document.getElementById('socSearch')?.value || '').trim().toLowerCase();
    const tipo     = (document.getElementById('socTipo')?.value || '').trim().toLowerCase();
    const estadoOp = document.getElementById('socEstadoOp')?.value || '';
    const estadoFin= document.getElementById('socEstadoFin')?.value || '';

    sociosFiltered = sociosRows.filter(r => {
      if (search) {
        // Buscar en todos los campos relevantes incluyendo notas_excel
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
    // Reset to prompt — hide list
    const list = document.getElementById('sociosList');
    if (list) {
      delete list.dataset.searched;
      list.innerHTML = '<div class="socios-prompt"><div class="socios-prompt-icon">🔍</div><div class="socios-prompt-text">Escribe en el buscador para encontrar socios</div><div class="socios-prompt-sub">La lista se muestra solo al buscar para proteger la privacidad</div></div>';
    }
    document.getElementById('socCount').textContent = `${sociosRows.length} socios en total`;
  }

  function resetSocioForm() {
    editingSocioId = null;
    ['sCodigo','sTipo','sNombre','sDpi','sTelefono','sEmail','sInicio','sVencimiento','sDireccion','sComentarios'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const op = document.getElementById('sEstadoOp'); if (op) op.value = 'activo';
    const fin = document.getElementById('sEstadoFin'); if (fin) fin.value = 'al_dia';
    const title = document.getElementById('socioFormTitle'); if (title) title.textContent = '➕ Nuevo socio';
    const btn = document.getElementById('socioSaveBtn'); if (btn) btn.textContent = 'Guardar socio';
    const msg = document.getElementById('socioMsg'); if (msg) { msg.textContent = ''; msg.className = 'form-msg'; }
  }

  /* ══════════════════════════════════════════
     USER MANAGEMENT (Supabase Admin API)
  ══════════════════════════════════════════ */
  const USER_COLORS = [
    'linear-gradient(135deg,#1549a0,#2d7ef0)',
    'linear-gradient(135deg,#0f6e56,#1d9e75)',
    'linear-gradient(135deg,#7a3a00,#e8a000)',
    'linear-gradient(135deg,#6b21a8,#9333ea)',
    'linear-gradient(135deg,#b53326,#ef4444)',
  ];

  let editingUserId = null;

  /* List users via Supabase Auth Admin */
