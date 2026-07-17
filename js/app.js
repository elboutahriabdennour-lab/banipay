// BANIPAY — app.js — Initialisation

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
  } catch(e) {
    console.error('loadAll:', e);
    showToast('Erreur de chargement', 'error');
  }
}

async function loadComptableData(userId) {
  try {
    const [f, pf] = await Promise.all([
      sb.get('factures', `user_id=eq.${userId}&order=created_at.desc`),
      sb.get('profils_entreprise', `id=eq.${userId}`)
    ]);
    window._comptableFactures = f || [];
    window._comptableProfil = (pf && pf[0]) || {};
  } catch(e) {
    showToast('Erreur accès comptable', 'error');
  }
}

async function loadPortailClient(clientId) {
  showToast('Portail client — fonctionnalité à venir');
}

async function loadPublicProfil(profilId) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profils_entreprise?id_unique=eq.${profilId}&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const d = await r.json();
    const p = d && d[0];
    if (!p) return;
    document.body.innerHTML = `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:20px">
      <div style="background:#1E3A8A;border-radius:16px;padding:24px;text-align:center">
        <div style="font-size:24px;font-weight:700;color:#fff">${p.raison || '—'}</div>
      </div>
    </div>`;
  } catch(e) {}
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Appliquer le mode sombre
  applyDarkMode();

  // Charger identifiants sauvegardés
  loadSavedCredentials();

  // Vérifier les paramètres URL
  const params = new URLSearchParams(window.location.search);
  const profilId = params.get('profil');
  const inviteToken = params.get('invite');
  const comptableEmail = params.get('comptable');

  if (profilId) {
    await loadPublicProfil(profilId);
    return;
  }

  // Afficher l'écran auth par défaut
  goScreen('auth');

  // Essayer de restaurer la session
  try {
    if (sb.restoreSession()) {
      const valid = await sb.verifySession();
      if (valid) {
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
    }
  } catch(e) {
    console.error('Session restore error:', e);
    goScreen('auth');
  }

  // Fermer modals en cliquant dehors
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) closeAllModals();
    });
  });
});
