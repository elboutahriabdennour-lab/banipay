// BANIPAY — app.js

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
    // Load paiements
    const pays = await sb.get('paiements', `user_id=eq.${uid}&order=created_at.desc`);
    STATE.paiements = pays || [];
    genNotifications();
  } catch(e) { console.error('loadAll:', e); showToast('Erreur de chargement', 'error'); }
}

// ============================================================
// NOTIFICATIONS
// ============================================================

async function loadComptableData(userId) {
  try {
    const [f,pf] = await Promise.all([
      sb.get('factures',`user_id=eq.${userId}&order=created_at.desc`,SUPABASE_KEY),
      sb.get('profils_entreprise',`id=eq.${userId}`,SUPABASE_KEY)
    ]);
    window._comptableFactures = f||[];
    window._comptableProfil = (pf&&pf[0])||{};
    renderDashboardComptable();
  } catch(e){showToast('Erreur accès comptable','error');}
}

async function loadPortailClient(clientId) {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;color:#64748B">⏳ Chargement...</div>';
  // This would load client-specific data via a public token
  showToast('Portail client — fonctionnalité à venir');
}

async function loadPublicProfil(profilId) {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;color:#64748B">⏳ Chargement...</div>';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profils_entreprise?id_unique=eq.${profilId}&select=*`,
      {headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}});
    const d = await r.json();
    const p = d && d[0];
    if (!p) { document.body.innerHTML='<div style="text-align:center;padding:60px 20px;font-family:Inter,sans-serif"><h2>Profil introuvable</h2></div>'; return; }
    document.body.innerHTML = `
      <div style="font-family:Inter,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px">
        <div style="background:#1E3A8A;border-radius:16px;padding:24px;text-align:center;margin-bottom:16px">
          ${p.logo?`<img src="${p.logo}" style="max-width:80px;max-height:50px;object-fit:contain;margin-bottom:12px;filter:brightness(0) invert(1)"><br>`:''}
          <div style="font-size:24px;font-weight:700;color:#fff">${p.raison||'—'}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px">${p.secteur||''} ${p.forme?'· '+p.forme:''}</div>
        </div>
        <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #F1F5F9;margin-bottom:12px">
          ${[['📍 Adresse',p.adresse+(p.ville?', '+p.ville:'')],['📞 Téléphone',p.tel],['✉️ Email',p.email],['🌐 Web',p.web]].filter(([,v])=>v).map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F1F5F9;font-size:13px"><span style="color:#94A3B8">${k}</span><span style="font-weight:500">${v}</span></div>`).join('')}
        </div>
        <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #F1F5F9;margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;margin-bottom:10px">Identifiants légaux</div>
          ${[['RC',p.rc],['IF',p.identifiant_fiscal],['ICE',p.ice],['Patente',p.patente],['CNSS',p.cnss]].filter(([,v])=>v).map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:13px"><span style="color:#94A3B8">${k}</span><span style="font-weight:600;font-family:monospace">${v}</span></div>`).join('')}
        </div>
        ${p.banque||p.rib?`<div style="background:#ECFDF5;border-radius:12px;padding:16px;border:1px solid #D1FAE5">
          <div style="font-size:11px;font-weight:600;color:#059669;margin-bottom:8px">🏦 COORDONNÉES BANCAIRES</div>
          ${p.banque?`<div style="font-size:13px;margin-bottom:4px">${p.banque}</div>`:''}
          ${p.rib?`<div style="font-size:12px;font-family:monospace;color:#064E3B">${p.rib}</div>`:''}
        </div>`:''}
        <div style="text-align:center;margin-top:20px;font-size:11px;color:#94A3B8">Profil partagé via <strong>BaniPay</strong></div>
      </div>`;
  } catch(e) { document.body.innerHTML='<div style="text-align:center;padding:60px;font-family:Inter,sans-serif;color:#EF4444">Erreur de chargement</div>'; }
}


// ===== PDF.JS =====
// ============================================================
// BANIPAY — PDF Generator (Factures, Devis, Avoirs, BC, BL)
// ============================================================

// ============================================================
// PDF AVANCÉ — Enregistrer + Partager le fichier PDF
// ============================================================



async function afficherDocumentPublic(docId) {
  // Essayer de charger depuis Supabase sans auth
  try {
    // Try factures first
    const r = await fetch(SUPABASE_URL + '/rest/v1/factures?id=eq.' + docId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    const f = data && data[0];

    if (f) {
      // Load profil
      const rp = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + f.user_id + '&select=*', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      const profils = await rp.json();
      const profil = (profils && profils[0]) || {};

      const lignes = typeof f.lignes === 'string' ? JSON.parse(f.lignes||'[]') : (f.lignes||[]);

      genDocPDF({
        type: 'FACTURE', ref: f.ref, color: '#2563EB',
        emetteur: profil,
        destinataire: { nom: f.client, chantier: f.chantier },
        date: f.date_emission, echeance: f.echeance,
        paiement: f.paiement, statut: f.statut,
        lignes: lignes, note: f.note||'',
        ht: f.ht, tva: f.tva, ttc: f.ttc,
        devise: f.devise||'MAD',
        montant_recu: f.montant_recu||0,
        showStamp: f.statut === 'payee',
        devis_ref: f.devis_ref||'',
        bl_ref: f.bl_ref||'',
        doc_id: docId,
        doc_url: window.location.href,
      });
      return;
    }

    // Try devis
    const r2 = await fetch(SUPABASE_URL + '/rest/v1/devis?id=eq.' + docId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data2 = await r2.json();
    const d = data2 && data2[0];

    if (d) {
      const rp2 = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + d.user_id + '&select=*', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      const profils2 = await rp2.json();
      const profil2 = (profils2 && profils2[0]) || {};
      const lignes2 = typeof d.lignes === 'string' ? JSON.parse(d.lignes||'[]') : (d.lignes||[]);

      genDocPDF({
        type: 'DEVIS', ref: d.ref, color: '#D97706',
        emetteur: profil2,
        destinataire: { nom: d.client, chantier: d.chantier },
        date: d.date_emission, validite: d.validite,
        lignes: lignes2, note: d.note||'',
        ht: d.ht, tva: d.tva, ttc: d.ttc,
        devise: d.devise||'MAD',
        doc_id: docId,
        doc_url: window.location.href,
      });
      return;
    }

    // Not found
    showToast('Document introuvable', 'error');
    goScreen('auth');

  } catch(e) {
    console.error('afficherDocumentPublic:', e);
    showToast('Erreur de chargement', 'error');
    goScreen('auth');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  applyDarkMode();
  loadSavedCredentials();
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite');
  const comptableEmail = params.get('comptable');
  const portailId = params.get('portail');
  const profilId = params.get('profil');

  if (portailId) { await loadPublicProfil(portailId); return; }
  if (profilId) { await loadPublicProfil(profilId); return; }

  // Action sur un devis (accepter/refuser via lien)
  const devisId = params.get('devis');
  const devisAction = params.get('action');
  if (devisId && (devisAction === 'accepter' || devisAction === 'refuser')) {
    await traiterActionDevis(devisId, devisAction);
    return;
  }

  // Lien direct vers une facture/devis via QR code
  const docId = params.get('doc');
  if (docId) {
    await afficherDocumentPublic(docId);
    return;
  }

  // Handle invitation link
  if (inviteToken) {
    window._inviteToken = inviteToken;
    // Need to login first, then process invitation
    if (sb.restoreSession()) {
      await loadAll();
      await traiterInvitation(inviteToken);
      if (window._pendingDocId) {
          const _pf = STATE.factures.find(x => x.id === window._pendingDocId);
          window._pendingDocId = null;
  goScreen('dashboard');
          if (_pf) setTimeout(() => openDetail(_pf.id), 400);
        } else {
          goScreen('dashboard');
        }
    } else {
      goScreen('auth');
      showToast('Connectez-vous pour accepter l\'invitation');
    }
    return;
  }

  if (comptableEmail) {
    window._comptableEmail = decodeURIComponent(comptableEmail);
    switchTab('comptable');
    goScreen('auth');
    return;
  }

  // Restore + verify session
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
        if (window._inviteToken) await traiterInvitation(window._inviteToken);
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

// goScreen — routing complet
