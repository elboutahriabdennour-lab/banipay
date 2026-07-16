// ============================================================
// BANIPAY — app.js — Initialisation & chargement données
// ============================================================

async function loadAll() {
  const uid = sb.user?.id;
  if (!uid) return;
  try {
    const [f, dv, cl, pr, av, pf] = await Promise.all([
      sb.get('factures', `user_id=eq.${uid}&order=created_at.desc`),
      sb.get('devis', `user_id=eq.${uid}&order=created_at.desc`),
      sb.get('clients', `user_id=eq.${uid}&order=nom.asc`),
      sb.get('produits', `user_id=eq.${uid}&order=nom.asc`),
      sb.get('avoirs', `user_id=eq.${uid}&order=created_at.desc`),
      sb.get('profils_entreprise', `id=eq.${uid}`),
    ]);
    STATE.factures = f || [];
    STATE.devis = dv || [];
    STATE.clients = cl || [];
    STATE.produits = pr || [];
    STATE.avoirs = av || [];
    STATE.profil = (pf && pf[0]) || {};
    const pays = await sb.get('paiements', `user_id=eq.${uid}&order=created_at.desc`);
    STATE.paiements = pays || [];
    genNotifications();
  } catch(e) { console.error('loadAll:', e); showToast('Erreur de chargement', 'error'); }
}

async function loadComptableData(userId) {
  try {
    const [f, pf] = await Promise.all([
      sb.get('factures', `user_id=eq.${userId}&order=created_at.desc`),
      sb.get('profils_entreprise', `id=eq.${userId}`)
    ]);
    window._comptableFactures = f || [];
    window._comptableProfil = (pf && pf[0]) || {};
  } catch(e) { showToast('Erreur accès comptable', 'error'); }
}

async function loadPortailClient(clientId) {
  showToast('Portail client — fonctionnalité à venir');
}

async function loadPublicProfil(profilId) {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;color:#64748B">⏳ Chargement...</div>';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profils_entreprise?id_unique=eq.${profilId}&select=*`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const d = await r.json();
    const p = d && d[0];
    if (!p) { document.body.innerHTML = '<div style="text-align:center;padding:60px 20px;font-family:Inter,sans-serif"><h2>Profil introuvable</h2></div>'; return; }
    document.body.innerHTML = `<div style="font-family:Inter,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px">
      <div style="background:#1E3A8A;border-radius:16px;padding:24px;text-align:center;margin-bottom:16px">
        <div style="font-size:24px;font-weight:700;color:#fff">${p.raison || '—'}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px">${p.secteur || ''}</div>
      </div>
      <div style="text-align:center;margin-top:20px;font-size:11px;color:#94A3B8">Profil partagé via <strong>BaniPay</strong></div>
    </div>`;
  } catch(e) { document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Inter,sans-serif;color:#EF4444">Erreur de chargement</div>'; }
}

// ============================================================
// INIT APP
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  applyDarkMode();

  const params = new URLSearchParams(window.location.search);
  const profilId = params.get('profil');
  const portailId = params.get('portail');
  const comptableEmail = params.get('comptable');
  const inviteToken = params.get('invite');

  if (profilId || portailId) { await loadPublicProfil(profilId || portailId); return; }

  if (comptableEmail) {
    window._comptableEmail = decodeURIComponent(comptableEmail);
    switchTab('comptable');
    goScreen('auth');
    return;
  }

  if (sb.restoreSession()) {
    const valid = await sb.verifySession();
    if (!valid) {
      sb.logout();
      goScreen('auth');
    } else {
      const role = sb.user?.user_metadata?.role || 'entreprise';
      CPT.role = role;
      if (role === 'comptable') {
        await loadComptableApp();
        goScreen('comptable');
      } else {
        await loadAll();
        if (inviteToken) await traiterInvitation(inviteToken);
        goScreen('dashboard');
      }
    }
  } else {
    goScreen('auth');
  }

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeAllModals(); });
  });
});
