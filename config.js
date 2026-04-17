/* Cartera Activa VCA — config.js */

  /* ══════════════════════════════════════════
     SUPABASE CONFIG
     1. Ve a https://supabase.com → New project
     2. Settings → API → copia Project URL y anon/public key
     3. Pega aquí abajo
     4. En el SQL editor de Supabase ejecuta:
        CREATE TABLE consultas (
          id bigint generated always as identity primary key,
          socio text, referencia text, departamento text,
          notas text, usuario text, created_at timestamptz default now()
        );
        ALTER TABLE consultas ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "allow_all" ON consultas FOR ALL USING (true) WITH CHECK (true);
  ══════════════════════════════════════════ */
  const SUPABASE_URL         = 'https://sbqasynhthoqtkiepzzv.supabase.co';
  // Service role key — needed ONLY for user management (create/delete users)
  // This key bypasses RLS — keep it as secret as possible
  // Go to Supabase → Settings → API → service_role key
  const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNicWFzeW5odGhvcXRraWVwenp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTU3MTA5OCwiZXhwIjoyMDkxMTQ3MDk4fQ.G_A4QIlr0xR8Yt5zw_ImPCYQiKAbKF7rYuY-Kes6GKY';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNicWFzeW5odGhvcXRraWVwenp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzEwOTgsImV4cCI6MjA5MTE0NzA5OH0.eQVyzkef44tQdLbXmLovgrEcDE7ZNmSaDWCvPtlsyPQ';
  /* ══ USER UI COLORS (el rol real viene de profiles.is_admin) ══ */
  const USER_META = {
    'garita@vca.com':      { color: 'linear-gradient(135deg,#1549a0,#2d7ef0)' },
    'restaurante@vca.com': { color: 'linear-gradient(135deg,#0f6e56,#1d9e75)' },
    'root@vca.com':        { color: 'linear-gradient(135deg,#7a3a00,#e8a000)' }
  };

  /* ══ state ══ */
  let data = [], searchHist = [];
  let currentUser  = null;   // nombre display (Garita, Restaurante, Root)
  let currentEmail = null;   // email del usuario autenticado
  let currentRol   = null;   // 'admin' | 'usuario'
  let authToken    = null;   // JWT de Supabase Auth
  let authUserId   = null;   // UUID del usuario autenticado
  const DATA_KEY   = 'cartera_vca_data_v3';
  let deferredPrompt = null;

  const supabaseReady = SUPABASE_URL !== 'PEGA_TU_URL_AQUI';

  /* ══ screen nav ══ */
