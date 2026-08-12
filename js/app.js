// ZELTO — app.js

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
    // NOUVEAU: bascule automatiquement en "expiré" les devis envoyés dont la
    // date de validité est dépassée — le statut existait déjà (couleur,
    // libellé) mais rien ne le déclenchait jamais.
    await verifierExpirationDevis();
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
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Karla,sans-serif;color:#6B5F54">⏳ Chargement...</div>';
  // This would load client-specific data via a public token
  showToast('Portail client — fonctionnalité à venir');
}

async function loadPublicProfil(profilId) {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Karla,sans-serif;color:#6B5F54">⏳ Chargement...</div>';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profils_entreprise?id_unique=eq.${profilId}&select=*`,
      {headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}});
    const d = await r.json();
    const p = d && d[0];
    if (!p) { document.body.innerHTML='<div style="text-align:center;padding:60px 20px;font-family:Karla,sans-serif"><h2>Profil introuvable</h2></div>'; return; }
    document.body.innerHTML = `
      <div style="font-family:Karla,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px">
        <div style="background:#1F6F72;border-radius:16px;padding:24px;text-align:center;margin-bottom:16px">
          ${p.logo?`<img src="${p.logo}" style="max-width:80px;max-height:50px;object-fit:contain;margin-bottom:12px;filter:brightness(0) invert(1)"><br>`:''}
          <div style="font-size:24px;font-weight:700;color:#fff">${p.raison||'—'}</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px">${p.secteur||''} ${p.forme?'· '+p.forme:''}</div>
        </div>
        <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #EAE4DA;margin-bottom:12px">
          ${[['📍 Adresse',p.adresse+(p.ville?', '+p.ville:'')],['📞 Téléphone',p.tel],['✉️ Email',p.email],['🌐 Web',p.web]].filter(([,v])=>v).map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #EAE4DA;font-size:13px"><span style="color:#9C9186">${k}</span><span style="font-weight:500">${v}</span></div>`).join('')}
        </div>
        <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid #EAE4DA;margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#9C9186;margin-bottom:10px">Identifiants légaux</div>
          ${[['RC',p.rc],['IF',p.identifiant_fiscal],['ICE',p.ice],['Patente',p.patente],['CNSS',p.cnss]].filter(([,v])=>v).map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #EAE4DA;font-size:13px"><span style="color:#9C9186">${k}</span><span style="font-weight:600;font-family:monospace">${v}</span></div>`).join('')}
        </div>
        ${p.banque||p.rib?`<div style="background:#EEF3E4;border-radius:12px;padding:16px;border:1px solid #DCE8C7">
          <div style="font-size:11px;font-weight:600;color:#6E8F4E;margin-bottom:8px">🏦 COORDONNÉES BANCAIRES</div>
          ${p.banque?`<div style="font-size:13px;margin-bottom:4px">${p.banque}</div>`:''}
          ${p.rib?`<div style="font-size:12px;font-family:monospace;color:#064E3B">${p.rib}</div>`:''}
        </div>`:''}
        <button id="btn-ouvrir-demande-devis" style="width:100%;margin-top:16px;padding:14px;background:#C9971F;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">📝 Demander un devis</button>
        <div id="zone-demande-devis" style="display:none;background:#fff;border-radius:12px;padding:16px;border:1px solid #EAE4DA;margin-top:12px">
          <div style="font-size:13px;font-weight:700;margin-bottom:10px">Votre demande</div>
          <input id="dd-nom" placeholder="Votre nom" style="width:100%;padding:10px;border:1.5px solid #E3DCCF;border-radius:8px;font-size:13px;font-family:inherit;margin-bottom:8px;box-sizing:border-box">
          <input id="dd-tel" placeholder="Téléphone" style="width:100%;padding:10px;border:1.5px solid #E3DCCF;border-radius:8px;font-size:13px;font-family:inherit;margin-bottom:8px;box-sizing:border-box">
          <input id="dd-email" placeholder="Email (optionnel)" style="width:100%;padding:10px;border:1.5px solid #E3DCCF;border-radius:8px;font-size:13px;font-family:inherit;margin-bottom:8px;box-sizing:border-box">
          <textarea id="dd-description" placeholder="Décrivez ce dont vous avez besoin..." rows="4" style="width:100%;padding:10px;border:1.5px solid #E3DCCF;border-radius:8px;font-size:13px;font-family:inherit;margin-bottom:10px;box-sizing:border-box;resize:none"></textarea>
          <button id="btn-envoyer-demande-devis" style="width:100%;padding:12px;background:#6E8F4E;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Envoyer la demande</button>
          <div id="dd-feedback" style="font-size:12px;text-align:center;margin-top:8px;min-height:16px"></div>
        </div>
        <div style="text-align:center;margin-top:20px;font-size:11px;color:#9C9186">Profil partagé via <strong>Zelto</strong></div>
      </div>`;
    document.getElementById('btn-ouvrir-demande-devis').onclick = function() {
      document.getElementById('zone-demande-devis').style.display = 'block';
      this.style.display = 'none';
    };
    document.getElementById('btn-envoyer-demande-devis').onclick = async function() {
      const nom = document.getElementById('dd-nom').value.trim();
      const description = document.getElementById('dd-description').value.trim();
      const feedback = document.getElementById('dd-feedback');
      if (!nom || !description) { feedback.style.color = '#B23A2E'; feedback.textContent = 'Nom et description obligatoires'; return; }
      feedback.style.color = '#6B5F54';
      feedback.textContent = '⏳ Envoi...';
      try {
        const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/creer_demande_devis', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_id_unique: profilId,
            p_client_nom: nom,
            p_client_tel: document.getElementById('dd-tel').value.trim(),
            p_client_email: document.getElementById('dd-email').value.trim(),
            p_description: description
          })
        });
        if (!resp.ok) { feedback.style.color = '#B23A2E'; feedback.textContent = 'Erreur — réessayez'; return; }
        feedback.style.color = '#6E8F4E';
        feedback.textContent = '✅ Demande envoyée ! L\'entreprise vous recontactera.';
        document.getElementById('btn-envoyer-demande-devis').disabled = true;
      } catch(e) {
        feedback.style.color = '#B23A2E';
        feedback.textContent = 'Erreur: ' + e.message;
      }
    };
  } catch(e) { document.body.innerHTML='<div style="text-align:center;padding:60px;font-family:Karla,sans-serif;color:#B23A2E">Erreur de chargement</div>'; }
}


// ===== PDF.JS =====
// ============================================================
// ZELTO — PDF Generator (Factures, Devis, Avoirs, BC, BL)
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
    '<div style="font-family:Karla,Arial,sans-serif;min-height:100vh;background:linear-gradient(160deg,#2A2420,#1F6F72);display:flex;align-items:center;justify-content:center;padding:20px">' +
    '<div style="background:#fff;border-radius:24px;padding:32px 24px;width:100%;max-width:400px;text-align:center">' +
      '<div style="font-size:48px;margin-bottom:12px">🔐</div>' +
      '<div style="font-size:22px;font-weight:800;color:#2A2420;margin-bottom:4px">Zel<span style="color:#C9971F">to</span></div>' +
      '<div style="font-size:14px;color:#6B5F54;margin-bottom:24px">Invitation accès comptable</div>' +
      '<div style="background:#E9F4F3;border-radius:14px;padding:16px;margin-bottom:24px;text-align:left">' +
        '<div style="font-size:12px;color:#9C9186;margin-bottom:4px">Entreprise</div>' +
        '<div style="font-size:16px;font-weight:700;color:#2A2420">' + escapeHTML(profil.raison || 'Entreprise') + '</div>' +
        (profil.secteur ? '<div style="font-size:12px;color:#6B5F54;margin-top:2px">' + profil.secteur + '</div>' : '') +
      '</div>' +
      '<div style="font-size:13px;color:#6B5F54;margin-bottom:24px">' +
        'Vous avez été invité(e) à accéder aux données comptables de cette entreprise en lecture seule.' +
      '</div>' +
      '<button id="btn-accept-inv" style="width:100%;padding:14px;background:#6E8F4E;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px;font-family:inherit">' +
        '\u2705 Accepter' +
      '</button>' +
      '<button id="btn-refuse-inv" style="width:100%;padding:14px;background:#EAE4DA;color:#6B5F54;border:none;border-radius:12px;font-size:15px;cursor:pointer;font-family:inherit">' +
        'Refuser' +
      '</button>' +
      '<div style="margin-top:20px;font-size:11px;color:#9C9186">Propulsé par <strong style="color:#C9971F">Zelto</strong></div>' +
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
        '<h2 style="color:#6E8F4E;margin-bottom:8px">Invitation acceptée !</h2>' +
        '<p style="color:#6B5F54;margin-bottom:24px">Connectez-vous à Zelto pour accéder aux données.</p>' +
        '<a href="' + window.location.origin + window.location.pathname + '" style="background:#C9971F;color:#fff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600">Ouvrir Zelto</a>' +
      '</div>';
  } catch(e) {
    document.body.innerHTML = '<div style="text-align:center;padding:60px;color:#B23A2E">Erreur: ' + e.message + '</div>';
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

// NOUVEAU: vue publique du bon de commande — le fournisseur (sans compte
// Zelto forcément) peut le consulter et confirmer/refuser, symétrique au
// cycle d'acceptation des devis/factures.
async function afficherBonCommandePublic(bcId, token) {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_bon_commande_public', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bc_id: bcId, p_token: token })
    });
    const data = r.ok ? (await r.json()) : [];
    const bc = data && data[0];
    if (!bc) {
      document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial;color:#6B5F54"><div style="font-size:48px;margin-bottom:16px">🔍</div><h2>Bon de commande introuvable</h2></div>';
      return;
    }

    const rp = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + bc.user_id + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const profils = await rp.json();
    const profil = (profils && profils[0]) || {};

    genDocPDF({
      type: 'BON DE COMMANDE', ref: bc.ref, color: '#7C5CA6',
      emetteur: profil,
      destinataire: { nom: bc.fournisseur },
      date: bc.date_commande,
      paiement: '',
      lignes: bc.lignes || [],
      note: bc.note || '',
      ht: (bc.lignes||[]).reduce(function(s,l){return s+(l.qte||1)*(l.pu||0);},0),
      tva: 0, ttc: 0,
      devise: 'MAD',
      showPrices: true,
      doc_id: bcId,
    });

    if (!bc.reponse_fournisseur) {
      setTimeout(function() {
        const screen = document.getElementById('pdf-fullscreen');
        if (!screen) return;
        const btnBar = document.createElement('div');
        btnBar.style.cssText = 'background:#fff;padding:12px 16px;display:flex;gap:8px;border-top:2px solid #E3DCCF;flex-shrink:0';
        btnBar.innerHTML =
          '<button id="btn-bc-confirme" style="flex:1;padding:12px;background:#6E8F4E;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">✅ Confirmer</button>' +
          '<button id="btn-bc-refuse" style="flex:1;padding:12px;background:#8E2E24;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">❌ Refuser</button>';
        screen.appendChild(btnBar);
        document.getElementById('btn-bc-confirme').onclick = function() { repondreBonCommandePublic(bcId, 'confirme', bc, token); };
        document.getElementById('btn-bc-refuse').onclick = function() { repondreBonCommandePublic(bcId, 'refuse', bc, token); };
      }, 400);
    }
  } catch(e) {
    document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial;color:#B23A2E">Erreur: ' + e.message + '</div>';
  }
}

async function repondreBonCommandePublic(bcId, reponse, bc, token) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/repondre_bon_commande', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bc_id: bcId, p_token: token, p_reponse: reponse })
    });
    const icon = reponse === 'confirme' ? '✅' : '❌';
    document.body.innerHTML = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;padding:24px;text-align:center">
        <div style="font-size:64px;margin-bottom:16px">${icon}</div>
        <h2 style="color:#2A2420;margin-bottom:8px">Bon de commande ${reponse === 'confirme' ? 'confirmé' : 'refusé'} !</h2>
        <div style="background:${reponse === 'confirme' ? '#EEF3E4' : '#F5E4E1'};border-radius:12px;padding:16px;margin:16px 0;text-align:left">
          <div style="font-size:13px;color:#6B5F54">Référence : <strong>${bc.ref}</strong></div>
        </div>
        <div style="margin-top:24px;font-size:11px;color:#9C9186">Propulsé par <strong style="color:#C9971F">Zelto</strong></div>
        <div style="margin-top:16px;font-size:11px;color:#9C9186">Redirection dans <span id="compte-redirect-bc">4</span>s...</div>
      </div>
    `;
    let s = 4;
    const iv = setInterval(function() {
      s--;
      const span = document.getElementById('compte-redirect-bc');
      if (span) span.textContent = s;
      if (s <= 0) { clearInterval(iv); window.location.href = window.location.origin + window.location.pathname; }
    }, 1000);
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// NOUVEAU: vue publique de consultation d'un bon de livraison (via son
// propre QR ou celui affiché sur le devis/la facture liée) — consultation
// seule, pas d'action à faire dessus contrairement au BC/devis/facture.
async function afficherBonLivraisonPublic(blId, token) {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_bon_livraison_public', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bl_id: blId, p_token: token })
    });
    const data = r.ok ? (await r.json()) : [];
    const bl = data && data[0];
    if (!bl) {
      document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial;color:#6B5F54"><div style="font-size:48px;margin-bottom:16px">🔍</div><h2>Bon de livraison introuvable</h2></div>';
      return;
    }
    const rp = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + bl.user_id + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const profils = await rp.json();
    const profil = (profils && profils[0]) || {};

    genDocPDF({
      type: 'BON DE LIVRAISON', ref: bl.ref, color: '#6E8F4E',
      emetteur: profil,
      destinataire: { nom: bl.client },
      date: bl.date_livraison,
      paiement: '',
      lignes: (bl.lignes||[]).map(function(l) { return { desc: l.desc, qte: l.qte, pu: 0, unite: l.unite||'u' }; }),
      note: '', ht: 0, tva: 0, ttc: 0, devise: 'MAD',
      showPrices: false,
    });
  } catch(e) {
    document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial;color:#B23A2E">Erreur: ' + e.message + '</div>';
  }
}

async function afficherDocumentPublic(docId, token) {
  const urlParams = new URLSearchParams(window.location.search);
  const docType = urlParams.get('type'); // 'devis' ou null

  try {
    let doc = null;
    let profil = {};
    let isDevis = docType === 'devis';

    // FIX SÉCURITÉ : remplace le fetch REST direct (filtré uniquement par
    // id, donc devinable) par la RPC sécurisée qui exige aussi le jeton.
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_document_public', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_doc_id: docId, p_token: token, p_type: isDevis ? 'devis' : 'facture' })
    });
    doc = r.ok ? (await r.json()) : null;

    if (!doc) {
      document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial;color:#6B5F54"><div style="font-size:48px;margin-bottom:16px">🔍</div><h2>Document introuvable</h2></div>';
      return;
    }

    // Charger le profil émetteur
    const rp = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + doc.user_id + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const profils = await rp.json();
    profil = (profils && profils[0]) || {};

    const lignes = typeof doc.lignes === 'string' ? JSON.parse(doc.lignes || '[]') : (doc.lignes || []);

    // NOUVEAU: construire les références croisées (devis/BC/BL) AVANT de
    // générer le PDF — le devis affiche son BC, la facture affiche les 3.
    // Vue publique (anonyme) : on ne peut lire le BC/BL que via les RPC
    // dédiées (RLS bloque un accès direct pour un visiteur non connecté).
    const refsQR = [];
    const base = window.location.origin + window.location.pathname;
    if (doc.devis_ref) {
      refsQR.push({ icon: '📝', label: 'Devis', ref: doc.devis_ref, url: '' });
    }
    if (doc.bc_id) {
      try {
        const rBC = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_bon_commande_public', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_bc_id: doc.bc_id })
        });
        if (rBC.ok) {
          const bcData = (await rBC.json()) || [];
          const bc = bcData[0];
          if (bc) refsQR.push({ icon: '📋', label: 'Bon de commande', ref: bc.ref, url: base + '?bc=' + bc.id + '&t=' + (bc.token_public||'') });
        }
      } catch(eBC) {}
    }
    let blTrouve = null;
    if (!isDevis) {
      try {
        const rBLref = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_bon_livraison_facture', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_facture_id: docId })
        });
        if (rBLref.ok) {
          const blsRef = (await rBLref.json()) || [];
          blTrouve = blsRef[0] || null;
          if (blTrouve) refsQR.push({ icon: '📦', label: 'Bon de livraison', ref: blTrouve.ref, url: base + '?bl=' + blTrouve.id + '&t=' + (blTrouve.token_public||'') });
        }
      } catch(eBLref) {}
    }

    // Générer le PDF
    genDocPDF({
      type: isDevis ? 'DEVIS' : 'FACTURE',
      ref: doc.ref,
      color: isDevis ? '#B8860B' : '#C9971F',
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
      doc_id: docId,
      signatureClient: doc.signature_data || null,
      doc_url: window.location.href,
      refsQR: refsQR,
    });

    // NOUVEAU: si un bon de livraison est lié à cette facture, le client
    // peut le consulter directement — c'est le lien réel qui manquait
    // (auparavant juste un texte libre, jamais retrouvable depuis ici).
    // Réutilise blTrouve déjà récupéré ci-dessus (évite une requête en double).
    if (!isDevis && blTrouve) {
      const bl = blTrouve;
      setTimeout(function() {
        const screen = document.getElementById('pdf-fullscreen');
        if (!screen) return;
        const banniereBL = document.createElement('div');
        banniereBL.style.cssText = 'background:#EEF3E4;padding:10px 16px;text-align:center;flex-shrink:0';
        banniereBL.innerHTML = '<button id="btn-voir-bl-public" style="background:#55702E;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📦 Voir le bon de livraison ' + escapeHTML(bl.ref||'') + '</button>';
        screen.insertBefore(banniereBL, screen.firstChild);
        document.getElementById('btn-voir-bl-public').onclick = function() {
          genDocPDF({
            type: 'BON DE LIVRAISON', ref: bl.ref, color: '#6E8F4E',
            emetteur: profil,
            destinataire: { nom: bl.client },
            date: bl.date_livraison,
            paiement: '',
                  lignes: (bl.lignes||[]).map(function(l) { return { desc: l.desc, qte: l.qte, pu: 0, unite: l.unite||'u' }; }),
                  note: '', ht: 0, tva: 0, ttc: 0, devise: 'MAD',
                  showPrices: false,
                  devis_ref: 'Facture réf: ' + doc.ref,
                });
              };
            }, 450);
    }

    // Type générique + champ de statut à considérer selon devis/facture
    const typeDoc = isDevis ? 'devis' : 'facture';
    const statutActuel = isDevis ? doc.statut : doc.reponse_client;
    const valeurAcceptee = isDevis ? 'accepte' : 'acceptee';
    const valeurRefusee = isDevis ? 'refuse' : 'refusee';
    const dejaTraite = statutActuel === valeurAcceptee || statutActuel === valeurRefusee;

    // Boutons Accepter/Refuser/Attente — pour les devis ET les factures non
    // encore définitivement traités (l'état "en attente" ne bloque rien)
    if (!dejaTraite) {
      if (statutActuel === 'en_attente') {
        setTimeout(function() {
          const screen = document.getElementById('pdf-fullscreen');
          if (!screen) return;
          const info = document.createElement('div');
          info.style.cssText = 'background:#F7EFDC;padding:10px 16px;text-align:center;font-size:12px;font-weight:600;color:#B8860B;border-top:1px solid #E3DCCF;flex-shrink:0';
          info.textContent = '⏳ Vous avez mis ce document en attente — vous pouvez accepter ou refuser à tout moment';
          screen.appendChild(info);
        }, 480);
      }
      setTimeout(function() {
        const screen = document.getElementById('pdf-fullscreen');
        if (!screen) return;
        const btnBar = document.createElement('div');
        btnBar.style.cssText = 'background:#fff;padding:12px 16px;display:flex;gap:6px;border-top:2px solid #E3DCCF;flex-shrink:0';
        const bAcc = document.createElement('button');
        bAcc.textContent = '✅ Accepter';
        bAcc.style.cssText = 'flex:1;padding:12px 4px;background:#6E8F4E;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit';
        // Accepter vaut signature électronique automatique — plus besoin de
        // faire dessiner quoi que ce soit au client, un tampon horodaté est
        // généré automatiquement (voir traiterActionDocument).
        bAcc.onclick = function() { traiterActionDocument(docId, typeDoc, 'accepter', null, token); };
        const bAtt = document.createElement('button');
        bAtt.textContent = '⏳ Attente';
        bAtt.style.cssText = 'flex:1;padding:12px 4px;background:#B8860B;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit';
        bAtt.onclick = function() { traiterActionDocument(docId, typeDoc, 'attente', null, token); };
        const bRef = document.createElement('button');
        bRef.textContent = '❌ Refuser';
        bRef.style.cssText = 'flex:1;padding:12px 4px;background:#8E2E24;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit';
        bRef.onclick = function() { traiterActionDocument(docId, typeDoc, 'refuser', null, token); };
        btnBar.appendChild(bAcc);
        btnBar.appendChild(bAtt);
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
        info.style.cssText = 'background:' + (statutActuel === valeurAcceptee ? '#EEF3E4' : '#F5E4E1') + ';padding:12px 16px;text-align:center;font-size:13px;font-weight:600;color:' + (statutActuel === valeurAcceptee ? '#6E8F4E' : '#8E2E24') + ';border-top:1px solid #E3DCCF;flex-shrink:0';
        info.textContent = statutActuel === valeurAcceptee
          ? ('✅ ' + (isDevis ? 'Ce devis a été accepté' : 'Cette facture a été acceptée'))
          : ('❌ ' + (isDevis ? 'Ce devis a été refusé' : 'Cette facture a été refusée'));
        screen.appendChild(info);
      }, 500);
    }

  } catch(e) {
    console.error('afficherDocumentPublic:', e);
    document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:Arial;color:#B23A2E">Erreur: ' + e.message + '</div>';
  }
}


// NOUVEAU : appelée depuis l'écran "Définir mon mot de passe", atteint
// via un lien d'invitation/récupération Supabase (voir app.js).
async function definirMotDePasseInvite() {
  const pwd = el('def-mdp-nouveau')?.value;
  const confirm2 = el('def-mdp-confirmer')?.value;
  const errEl = el('def-mdp-err');
  if (errEl) errEl.textContent = '';
  if (!window._jetonDefinitionMdp) { if(errEl) errEl.textContent = 'Lien invalide ou expiré — redemandez une invitation'; return; }
  if (!pwd || pwd.length < 8) { if(errEl) errEl.textContent = '8 caractères minimum'; return; }
  if (!/[A-Z]/.test(pwd)) { if(errEl) errEl.textContent = 'Au moins une majuscule'; return; }
  if (!/[0-9]/.test(pwd)) { if(errEl) errEl.textContent = 'Au moins un chiffre'; return; }
  if (pwd !== confirm2) { if(errEl) errEl.textContent = 'Mots de passe différents'; return; }
  if (errEl) errEl.textContent = '⏳ Enregistrement...';
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${window._jetonDefinitionMdp}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    if (!r.ok) { const d = await r.json().catch(function(){return{};}); throw new Error(d.msg || d.error_description || 'Erreur de mise à jour'); }
    window._jetonDefinitionMdp = null;
    if (errEl) errEl.textContent = '';
    showToast('✅ Mot de passe défini — connectez-vous maintenant', 'success');
    goScreen('auth', null);
    switchTab('login');
  } catch(e) { if(errEl) errEl.textContent = '❌ ' + e.message; }
}

document.addEventListener('DOMContentLoaded', async () => {
  goScreen('auth'); // Défaut: page de connexion
  applyDarkMode();
  loadSavedCredentials();

  // NOUVEAU : lien d'invitation ou de réinitialisation envoyé par
  // Supabase — le jeton arrive dans le HASH de l'URL (#access_token=...),
  // pas dans les paramètres normaux (?xxx=...), donc il fallait une
  // détection séparée. Avant ce correctif, ce jeton n'était jamais lu :
  // la personne tombait simplement sur l'écran de connexion normal, sans
  // aucun moyen de définir son mot de passe.
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessTokenInvite = hashParams.get('access_token');
  const typeInvite = hashParams.get('type');
  if (accessTokenInvite && (typeInvite === 'invite' || typeInvite === 'recovery' || typeInvite === 'signup')) {
    window._jetonDefinitionMdp = accessTokenInvite;
    // Nettoie l'URL (le jeton ne doit pas rester visible/partageable dans
    // l'historique du navigateur une fois utilisé).
    history.replaceState(null, '', window.location.pathname + window.location.search);
    goScreen('definir-mot-passe', null);
    return;
  }

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
  const tokenLien = params.get('t');
  const devisId = params.get('devis');
  const factureIdAction = params.get('facture');
  const docAction = params.get('action');
  if (devisId && (docAction === 'accepter' || docAction === 'refuser')) {
    await traiterActionDocument(devisId, 'devis', docAction, null, tokenLien);
    return;
  }
  if (factureIdAction && (docAction === 'accepter' || docAction === 'refuser')) {
    await traiterActionDocument(factureIdAction, 'facture', docAction, null, tokenLien);
    return;
  }

  // Lien direct vers une facture/devis via QR code
  const docId = params.get('doc');
  if (docId) {
    await afficherDocumentPublic(docId, tokenLien);
    return;
  }

  // NOUVEAU: lien public vers un bon de commande (le fournisseur confirme/refuse)
  const bcId = params.get('bc');
  if (bcId) {
    await afficherBonCommandePublic(bcId, tokenLien);
    return;
  }

  // NOUVEAU: lien public vers un bon de livraison (consultation seule, via
  // le QR généré sur le devis/la facture/le BL lui-même)
  const blIdParam = params.get('bl');
  if (blIdParam) {
    await afficherBonLivraisonPublic(blIdParam, tokenLien);
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
      if (typeof loadBonsCommande === 'function') await loadBonsCommande();
      if (typeof loadBonsLivraison === 'function') await loadBonsLivraison();
      if (typeof loadRelancesEnvoyees === 'function') await loadRelancesEnvoyees();
      if (typeof loadEmployes === 'function') await loadEmployes();
      if (typeof loadDemandesDevis === 'function') await loadDemandesDevis();
    await loadConversations();
      if (typeof loadAbonnements === 'function') await loadAbonnements();
      if (typeof verifierAbonnements === 'function') await verifierAbonnements();
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
      if (typeof loadBonsCommande === 'function') await loadBonsCommande();
      if (typeof loadBonsLivraison === 'function') await loadBonsLivraison();
      if (typeof loadRelancesEnvoyees === 'function') await loadRelancesEnvoyees();
      if (typeof loadEmployes === 'function') await loadEmployes();
      if (typeof loadDemandesDevis === 'function') await loadDemandesDevis();
    await loadConversations();
        if (typeof loadAbonnements === 'function') await loadAbonnements();
        if (typeof verifierAbonnements === 'function') await verifierAbonnements();
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

  // Polling 30s pour détecter acceptation/refus des devis + rafraîchir les
  // notifications générales — un seul intervalle (fusion de deux
  // intervalles séparés qui déclenchaient tous les deux genNotifications()
  // à ~30s d'écart, doublant inutilement les appels réseau).
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
      if (devis && devis.length) {
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
      }

      // FIX: même notification temps réel pour les factures — jusqu'ici
      // seuls les devis étaient surveillés, une entreprise qui envoyait une
      // facture via Zelto ne recevait jamais de toast quand le client
      // répondait (accepter/refuser).
      const factures = await sb.get('factures', 'user_id=eq.' + userId + '&reponse_client=in.(acceptee,refusee)&notif_lue=eq.false');
      if (factures && factures.length) {
        factures.forEach(f => {
          const ancienne = STATE.factures.find(x => x.id === f.id);
          if (!ancienne) return;
          if (f.reponse_client === 'acceptee' && ancienne.reponse_client !== 'acceptee') {
            showToast('✅ ' + f.client + ' a accepté la facture ' + f.ref + ' !', 'success');
          } else if (f.reponse_client === 'refusee' && ancienne.reponse_client !== 'refusee') {
            showToast('❌ ' + f.client + ' a refusé la facture ' + f.ref, 'error');
          }
          ancienne.reponse_client = f.reponse_client;
          ancienne.notif_lue = false;
        });
      }

      if ((devis && devis.length) || (factures && factures.length)) {
        badgeF();
      }
      // Rafraîchit aussi les notifications générales à chaque cycle
      // (remarque comptable, TVA déclarée, stock bas, échéances...),
      // plus besoin d'un second intervalle séparé pour ça.
      if (CPT.role !== 'comptable') genNotifications();
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
        '<div style="font-size:14px;color:#6B5F54;margin-bottom:6px">' + escapeHTML(decodeURIComponent(nomCpt || emailCpt)) + '</div>' +
        '<div style="font-size:13px;color:#6B5F54;margin-bottom:20px">vous invite à partager vos documents Zelto</div>' +
        '<div style="background:#FBF0DA;border-radius:12px;padding:12px;margin-bottom:20px;font-size:12px;color:#1F6F72">' +
          'Le comptable pourra consulter vos factures, devis et documents en lecture seule.' +
        '</div>' +
        '<button id="btn-accepter-inv-cpt" style="width:100%;padding:13px;background:#6E8F4E;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px">✅ Accepter</button>' +
        '<button class="btn-close-inv" style="width:100%;padding:11px;background:#EAE4DA;color:#6B5F54;border:none;border-radius:12px;font-size:13px;cursor:pointer;font-family:inherit">Refuser</button>' +
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

        // Notifier le comptable via la fonction RPC SECURITY DEFINER —
        // élimine toute dépendance à une policy RLS sur cette table.
        await fetch(SUPABASE_URL + '/rest/v1/rpc/envoyer_notification', {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            p_user_id: entrepriseId, // on stocke pour retrouver le comptable via email
            p_destinataire_email: emailCpt || '',
            p_type: 'invitation_acceptee',
            p_titre: 'Invitation acceptée',
            p_corps: (sb.user.user_metadata?.nom || sb.user.email) + ' a accepté votre invitation comptable.'
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
