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
  ['ctab-usuarios','ctab-nuevo','ctab-socios'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  switchConfigTab('socios');
}

function goToReservations() {
  if (!currentUser) { showScreen('screenLogin'); return; }
  showScreen('screenReservations');
  switchResTab('nueva');
}

function selectTipo(btn) {
  document.querySelectorAll('.tipo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
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
