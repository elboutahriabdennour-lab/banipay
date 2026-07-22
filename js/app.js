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
    await genNotifications();
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




async function afficherPageInvitation(email, entrepriseId) {
  // Load entreprise profil
  let profil = {};
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + entrepriseId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    profil = (data && data[0]) || {};
  } catch(e) {}

  document.body.innerHTML =
    '<div style="font-family:Inter,Arial,sans-serif;min-height:100vh;background:linear-gradient(160deg,#0F172A,#1E3A8A);display:flex;align-items:center;justify-content:center;padding:20px">' +
    '<div style="background:#fff;border-radius:24px;padding:32px 24px;width:100%;max-width:400px;text-align:center">' +
      '<div style="font-size:48px;margin-bottom:12px">🔐</div>' +
      '<div style="font-size:22px;font-weight:800;color:#0F172A;margin-bottom:4px">Bani<span style="color:#2563EB">Pay</span></div>' +
      '<div style="font-size:14px;color:#64748B;margin-bottom:24px">Invitation accès comptable</div>' +
      '<div style="background:#EFF6FF;border-radius:14px;padding:16px;margin-bottom:24px;text-align:left">' +
        '<div style="font-size:12px;color:#94A3B8;margin-bottom:4px">Entreprise</div>' +
        '<div style="font-size:16px;font-weight:700;color:#0F172A">' + escapeHTML(profil.raison || 'Entreprise') + '</div>' +
        (profil.secteur ? '<div style="font-size:12px;color:#64748B;margin-top:2px">' + profil.secteur + '</div>' : '') +
      '</div>' +
      '<div style="font-size:13px;color:#64748B;margin-bottom:24px">' +
        'Vous avez été invité(e) à accéder aux données comptables de cette entreprise en lecture seule.' +
      '</div>' +
      '<button id="btn-acc" style="width:100%;padding:14px;background:#059669;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px;font-family:inherit">' +
        '\u2705 Accepter' +
      '</button>' +
      '<button id="btn-ref" style="width:100%;padding:14px;background:#F1F5F9;color:#64748B;border:none;border-radius:12px;font-size:15px;cursor:pointer;font-family:inherit">' +
        'Refuser' +
      '</button>' +
      '<div style="margin-top:20px;font-size:11px;color:#94A3B8">Propulsé par <strong style="color:#2563EB">BaniPay</strong></div>' +
    '</div></div>';
  setTimeout(function() {
    const btnA = document.getElementById('btn-accept-inv');
    const btnR = document.getElementById('btn-refuse-inv');
    if (btnA) btnA.onclick = function() { accepterInvitationEmail(encodeURIComponent(email), entrepriseId); };
    if (btnR) btnR.onclick = function() { refuserInvitationEmail(encodeURIComponent(email), entrepriseId); };
  }, 100);
}

async function accepterInvitationEmail(emailEnc, entrepriseId) {
  const email = decodeURIComponent(emailEnc);
  try {
    await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?entreprise_id=eq.' + entrepriseId + '&comptable_email=eq.' + encodeURIComponent(email), {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'acceptee' })
    });
    document.body.innerHTML =
      '<div style="font-family:Arial,sans-serif;text-align:center;padding:60px 20px">' +
        '<div style="font-size:64px;margin-bottom:16px">✅</div>' +
        '<h2 style="color:#059669;margin-bottom:8px">Invitation acceptée !</h2>' +
        '<p style="color:#64748B;margin-bottom:24px">Connectez-vous à BaniPay pour accéder aux données.</p>' +
        '<a href="' + window.location.origin + window.location.pathname + '" style="background:#2563EB;color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600">Ouvrir BaniPay</a>' +
      '</div>';
  } catch(e) {
    document.body.innerHTML = '<div style="text-align:center;padding:60px;color:#EF4444">Erreur: ' + e.message + '</div>';
  }
}

async function refuserInvitationEmail(emailEnc, entrepriseId) {
  const email = decodeURIComponent(emailEnc);
  try {
    await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?entreprise_id=eq.' + entrepriseId + '&comptable_email=eq.' + encodeURIComponent(email), {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'refusee' })
    });
    document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial"><div style="font-size:48px">❌</div><h2>Invitation refusée</h2></div>';
  } catch(e) {}
}

// ============================================================
// AFFICHAGE PUBLIC D'UN DOCUMENT (facture ou devis) + Accepter/Refuser
// ============================================================

async function afficherDocumentPublic(docId) {
  const urlParams = new URLSearchParams(window.location.search);
  const docType = urlParams.get('type'); // 'devis' ou null

  try {
    let doc = null;
    let profil = {};
    let isDevis = false;

    if (docType === 'devis') {
      // Chercher dans devis UNIQUEMENT
      const r = await fetch(SUPABASE_URL + '/rest/v1/devis?id=eq.' + docId + '&select=*', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      const data = await r.json();
      doc = data && data[0];
      isDevis = true;
    } else {
      // Chercher dans factures UNIQUEMENT
      const r = await fetch(SUPABASE_URL + '/rest/v1/factures?id=eq.' + docId + '&select=*', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      const data = await r.json();
      doc = data && data[0];
      isDevis = false;
    }

    if (!doc) {
      document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial;color:#64748B"><div style="font-size:48px;margin-bottom:16px">🔍</div><h2>Document introuvable</h2></div>';
      return;
    }

    // Charger le profil émetteur
    const rp = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + doc.user_id + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const profils = await rp.json();
    profil = (profils && profils[0]) || {};

    const lignes = typeof doc.lignes === 'string' ? JSON.parse(doc.lignes || '[]') : (doc.lignes || []);

    // Générer le PDF
    genDocPDF({
      type: isDevis ? 'DEVIS' : 'FACTURE',
      ref: doc.ref,
      color: isDevis ? '#D97706' : '#2563EB',
      emetteur: profil,
      destinataire: { nom: doc.client, chantier: doc.chantier },
      date: doc.date_emission,
      echeance: doc.echeance,
      validite: doc.validite,
      paiement: doc.paiement || '',
      statut: doc.statut,
      lignes: lignes,
      note: doc.note || '',
      ht: doc.ht, tva: doc.tva, ttc: doc.ttc,
      devise: doc.devise || 'MAD',
      montant_recu: doc.montant_recu || 0,
      showStamp: doc.statut === 'payee',
      devis_ref: doc.devis_ref || '',
      bl_ref: doc.bl_ref || '',
      doc_id: docId,
      doc_url: window.location.href,
    });

    // Type générique + champ de statut à considérer selon devis/facture
    const typeDoc = isDevis ? 'devis' : 'facture';
    const statutActuel = isDevis ? doc.statut : doc.reponse_client;
    const valeurAcceptee = isDevis ? 'accepte' : 'acceptee';
    const valeurRefusee = isDevis ? 'refuse' : 'refusee';
    const dejaTraite = statutActuel === valeurAcceptee || statutActuel === valeurRefusee;

    // Boutons Accepter/Refuser — pour les devis ET les factures en attente
    if (!dejaTraite) {
      setTimeout(function() {
        const screen = document.getElementById('pdf-fullscreen');
        if (!screen) return;
        const btnBar = document.createElement('div');
        btnBar.style.cssText = 'background:#fff;padding:12px 16px;display:flex;gap:8px;border-top:2px solid #E2E8F0;flex-shrink:0';
        const bAcc = document.createElement('button');
        bAcc.textContent = isDevis ? '✅ Accepter le devis' : '✅ Accepter la facture';
        bAcc.style.cssText = 'flex:1;padding:14px;background:#059669;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
        bAcc.onclick = function() { ouvrirModalSignature(docId, typeDoc); };
        const bRef = document.createElement('button');
        bRef.textContent = '❌ Refuser';
        bRef.style.cssText = 'flex:1;padding:14px;background:#DC2626;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
        bRef.onclick = function() { traiterActionDocument(docId, typeDoc, 'refuser'); };
        btnBar.appendChild(bAcc);
        btnBar.appendChild(bRef);
        screen.appendChild(btnBar);
      }, 500);
    }

    // Si le document a déjà été traité (devis ou facture)
    if (dejaTraite) {
      setTimeout(function() {
        const screen = document.getElementById('pdf-fullscreen');
        if (!screen) return;
        const info = document.createElement('div');
        info.style.cssText = 'background:' + (statutActuel === valeurAcceptee ? '#ECFDF5' : '#FEF2F2') + ';padding:12px 16px;text-align:center;font-size:13px;font-weight:600;color:' + (statutActuel === valeurAcceptee ? '#059669' : '#DC2626') + ';border-top:1px solid #E2E8F0;flex-shrink:0';
        info.textContent = statutActuel === valeurAcceptee
          ? ('✅ ' + (isDevis ? 'Ce devis a été accepté' : 'Cette facture a été acceptée'))
          : ('❌ ' + (isDevis ? 'Ce devis a été refusé' : 'Cette facture a été refusée'));
        screen.appendChild(info);
      }, 500);
    }

  } catch(e) {
    console.error('afficherDocumentPublic:', e);
    document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial;color:#EF4444">Erreur: ' + e.message + '</div>';
  }
}


document.addEventListener('DOMContentLoaded', async () => {
  goScreen('auth'); // Défaut: page de connexion
  applyDarkMode();
  loadSavedCredentials();
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite');
  const comptableEmail = params.get('comptable');
  const portailId = params.get('portail');
  const profilId = params.get('profil');

  if (portailId) { await loadPublicProfil(portailId); return; }
  if (profilId) { await loadPublicProfil(profilId); return; }

  // Invitation comptable par email
  const inviteEmail = params.get('invite_email');
  const entrepriseId = params.get('entreprise');
  if (inviteEmail && entrepriseId) {
    await afficherPageInvitation(inviteEmail, entrepriseId);
    return;
  }

  // Invitation depuis profil comptable (?invite_cpt=email&pour=email)
  const inviteCpt = params.get('invite_cpt');
  const pourEmail = params.get('pour');
  const nomCpt = params.get('nom');
  if (inviteCpt && pourEmail) {
    await afficherInvitationComptable(inviteCpt, pourEmail, nomCpt);
    return;
  }

  // Action sur un devis ou une facture (accepter/refuser via lien)
  const devisId = params.get('devis');
  const factureIdAction = params.get('facture');
  const docAction = params.get('action');
  if (devisId && (docAction === 'accepter' || docAction === 'refuser')) {
    await traiterActionDocument(devisId, 'devis', docAction);
    return;
  }
  if (factureIdAction && (docAction === 'accepter' || docAction === 'refuser')) {
    await traiterActionDocument(factureIdAction, 'facture', docAction);
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
      verifierChangementsDevis();
      verifierRappels();
      await traiterInvitation(inviteToken);
      await loadAchats();
    await loadConversations();
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

  // Restore session - toujours passer par auth d'abord
  // Sauf si "remember me" activé explicitement
  const remembered = localStorage.getItem('bp_remember_v2') === '1';
  
  if (remembered && sb.restoreSession()) {
    const valid = await sb.verifySession();
    if (!valid) {
      sb.logout();
      localStorage.removeItem('bp_remember_v2');
      goScreen('auth');
    } else {
      // Auto-login uniquement si "remember me" coché
      const metaRole = sb.user?.user_metadata?.role;
      let role = metaRole || 'entreprise';
      CPT.role = role;
      if (role === 'comptable') {
        await loadComptableApp();
        goScreen('comptable');
      } else {
        await loadAll();
        verifierChangementsDevis();
        verifierRappels();
        await loadAchats();
    await loadConversations();
        goScreen('dashboard');
      }
    }
  } else {
    // Pas de "remember me" → toujours montrer l'écran de connexion
    // Pré-remplir l'email si sauvegardé
    goScreen('auth');
  }

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeAllModals(); });
  });

  // Polling 30s pour détecter acceptation/refus des devis
  if (sb.user?.id) ecouterChangementsDevis(sb.user.id);
});

function verifierChangementsDevis() {
  // Vérifier les devis acceptés/refusés non notifiés
  const devisNotifies = STATE.devis.filter(d =>
    (d.statut === 'accepte' || d.statut === 'refuse') && !d.notif_lue
  );
  devisNotifies.forEach(d => {
    if (d.statut === 'accepte') {
      showToast('✅ ' + d.client + ' a accepté le devis ' + d.ref + ' !', 'success');
    } else if (d.statut === 'refuse') {
      showToast('❌ ' + d.client + ' a refusé le devis ' + d.ref, 'error');
    }
  });
  if (devisNotifies.length > 0) {
    genNotifications();
    badgeF();
  }
}

function ecouterChangementsDevis(userId) {
  setInterval(async function() {
    try {
      const devis = await sb.get('devis', 'user_id=eq.' + userId + '&statut=in.(accepte,refuse)&notif_lue=eq.false');
      if (!devis || !devis.length) return;
      devis.forEach(d => {
        const ancien = STATE.devis.find(x => x.id === d.id);
        if (!ancien) return;
        if (d.statut === 'accepte' && ancien.statut !== 'accepte') {
          showToast('✅ ' + d.client + ' a accepté le devis ' + d.ref + ' !', 'success');
        } else if (d.statut === 'refuse' && ancien.statut !== 'refuse') {
          showToast('❌ ' + d.client + ' a refusé le devis ' + d.ref, 'error');
        }
        ancien.statut = d.statut;
        ancien.notif_lue = false;
      });
      genNotifications();
      badgeF();
    } catch(e) {}
  }, 30000);
}

// goScreen — routing complet
// ============================================================
// PAGE ACCEPTATION INVITATION COMPTABLE
// ============================================================

async function afficherInvitationComptable(emailCpt, pourEmail, nomCpt) {
  // Afficher page d'accueil avec modal d'invitation
  goScreen('auth');
  
  // Attendre que l'DOM soit prêt
  setTimeout(function() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:20px;padding:28px;max-width:380px;width:100%;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:16px">🤝</div>' +
        '<div style="font-size:18px;font-weight:700;margin-bottom:8px">Invitation comptable</div>' +
        '<div style="font-size:14px;color:#64748B;margin-bottom:6px">' + escapeHTML(decodeURIComponent(nomCpt || emailCpt)) + '</div>' +
        '<div style="font-size:13px;color:#64748B;margin-bottom:20px">vous invite à partager vos documents BaniPay</div>' +
        '<div style="background:#EEF2FF;border-radius:12px;padding:12px;margin-bottom:20px;font-size:12px;color:#4338CA">' +
          'Le comptable pourra consulter vos factures, devis et documents en lecture seule.' +
        '</div>' +
        '<button id="btn-accepter-inv-cpt" style="width:100%;padding:13px;background:#059669;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px">✅ Accepter</button>' +
        '<button class="btn-close-inv" style="width:100%;padding:11px;background:#F1F5F9;color:#64748B;border:none;border-radius:12px;font-size:13px;cursor:pointer;font-family:inherit">Refuser</button>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('.btn-close-inv').onclick = function() { overlay.remove(); };

    overlay.querySelector('#btn-accepter-inv-cpt').onclick = async function() {
      try {
        // Mettre à jour le statut de l'invitation
          // L'entreprise doit être connectée pour accepter
        if (!sb.token || !sb.user) {
          overlay.remove();
          window._pendingInviteCpt = { emailCpt, pourEmail };
          goScreen('auth');
          showToast('Connectez-vous pour accepter', 'error');
          return;
        }

        const entrepriseId = sb.user.id;
        // Mettre à jour invitation avec l'ID réel de l'entreprise
        await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?comptable_email=eq.' + encodeURIComponent(emailCpt) + '&entreprise_email=eq.' + encodeURIComponent(pourEmail), {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + sb.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ statut: 'acceptee', entreprise_id: entrepriseId })
        });

        // Notifier le comptable
        await fetch(SUPABASE_URL + '/rest/v1/notifications_app', {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + sb.token,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            user_id: entrepriseId, // on stocke pour retrouver le comptable via email
            type: 'invitation_acceptee',
            titre: 'Invitation acceptée',
            corps: (sb.user.user_metadata?.nom || sb.user.email) + ' a accepté votre invitation comptable.',
            lue: false
          })
        });

        overlay.remove();
        showToast('✅ Invitation acceptée ! Votre comptable a maintenant accès.', 'success');
        await loadAll();
        goScreen('dashboard');
      } catch(e) {
        showToast('Erreur: ' + e.message, 'error');
      }
    };
  }, 500);
}
