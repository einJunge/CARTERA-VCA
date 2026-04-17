/* Cartera Activa VCA — search.js */

  function doSearch(q2) {
    const q = (q2 || document.getElementById('searchInput').value).trim();
    if (!q || !data.length) return;
    document.getElementById('searchInput').value = q;
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('searchInput').blur();

    if (!searchHist.includes(q)) {
      searchHist.unshift(q); if (searchHist.length > 8) searchHist.pop();
      renderHist();
    }

    const matches = data.filter(r => {
      const ref = r.referencia;
      if (ref === q || ref.toLowerCase() === q.toLowerCase()) return true;
      const parts = ref.split('-');
      if (parts[parts.length-1] === q) return true;
      if (ref.includes(q)) return true;
      return false;
    });

    // Log to Supabase — found and not-found
    if (matches.length > 0) {
      matches.forEach(r => {
        sbInsert({ socio: r.socio, referencia: r.referencia,
          departamento: r.departamento, notas: r.notas,
          usuario: currentUser || 'Desconocido', encontrado: true });
      });
    } else {
      sbInsert({ socio: '— NO ENCONTRADO —', referencia: q,
        departamento: '', notas: 'Sin resultados en el listado',
        usuario: currentUser || 'Desconocido', encontrado: false });
    }

    renderResults(matches, q);
    // Prefetch notes for visible results
    prefetchNotes(matches.map(r => r.referencia)).then(() => {
      // Re-render note panels with fetched data
      matches.forEach(r => {
        const panel = document.querySelector(`[data-ref-note="${r.referencia}"]`);
        if (panel) panel.innerHTML = buildNotePanel(r).replace('<div class="note-panel">','').replace('</div>','');
      });
    });
    setTimeout(() => document.getElementById('resultsWrap').scrollIntoView({ behavior:'smooth', block:'start' }), 80);
  }

  /* ══ Render results ══ */
  function waLink(r) {
    const lines = [
      '🏖️ *Vacation Club of America*',
      '━━━━━━━━━━━━━━━━━━━',
      `📋 *Referencia:* ${r.referencia}`,
      `👤 *Socio:* ${r.socio || '—'}`,
      `🏢 *Departamento:* ${r.departamento || '—'}`,
      `📅 *Inicio:* ${r.inicio || '—'}`,
      `⏳ *Vencimiento:* ${r.vencimiento || '—'}`,
      `💳 *Último pago:* ${r.ultimo_pago || '—'}`,
      `📆 *Último año pago:* ${r.ultimo_año_de_pago || '—'}`,
      r.notas ? `📝 *Notas:* ${r.notas}` : null,
      '━━━━━━━━━━━━━━━━━━━',
      `_Consultado por ${currentUser || 'VCA'}_`
    ].filter(Boolean).join('\n');
    return 'https://wa.me/?text=' + encodeURIComponent(lines);
  }

  function renderResults(matches, q) {
    const wrap = document.getElementById('resultsWrap');
    const bar  = document.getElementById('resultBar');
    const cards = document.getElementById('resultCards');
    wrap.style.display = 'flex';

    if (!matches.length) {
      bar.textContent = '';
      cards.innerHTML = `<div class="no-result">No se encontraron resultados para <strong>"${esc(q)}"</strong>.</div>`;
      return;
    }

    bar.textContent = `${matches.length} resultado${matches.length!==1?'s':''} para "${q}"`;
    cards.innerHTML = matches.map((r,i) => {
      const nota = r.notas ? `<span class="note-tag">🏷 ${esc(r.notas)}</span>` : `<span class="fv mt">Sin notas</span>`;
      return `
      <div class="rcard" style="animation-delay:${i*.07}s">
        <div class="rcard-head">
          <div class="rcard-ref">${esc(r.referencia)}</div>
          <div class="rcard-name">${esc(r.socio)||'—'}</div>
        </div>
        <div class="rcard-body">
          <div class="f wide"><div class="fl">Departamento</div><div class="fv ${!r.departamento?'mt':''}">${esc(r.departamento)||'—'}</div></div>
          <div class="f"><div class="fl">Inicio</div><div class="fv ${!r.inicio?'mt':''}">${esc(r.inicio)||'—'}</div></div>
          <div class="f"><div class="fl">Vencimiento</div><div class="fv ${!r.vencimiento?'mt':''}">${esc(r.vencimiento)||'—'}</div></div>
          <div class="f"><div class="fl">Último Pago</div><div class="fv ${!r.ultimo_pago?'mt':''}">${esc(r.ultimo_pago)||'—'}</div></div>
          <div class="f"><div class="fl">Último Año</div><div class="fv ${!r.ultimo_año_de_pago?'mt':''}">${esc(r.ultimo_año_de_pago)||'—'}</div></div>
          <div class="f wide"><div class="fl">Notas</div><div class="fv">${nota}</div></div>
        </div>
        ${buildNotePanel(r)}
      </div>`;
    }).join('');
  }

  /* ══ History ══ */
  function renderHist() {
    if (!searchHist.length) { document.getElementById('histSection').style.display='none'; return; }
    document.getElementById('histSection').style.display = 'block';
    document.getElementById('histWrap').innerHTML = searchHist
      .map(h => `<button class="hist-chip" onclick="doSearch('${esc(h)}')">${esc(h)}</button>`).join('');
  }

  /* ══ Report ══ */
  let allRows = [];
