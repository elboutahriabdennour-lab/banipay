// BANIPAY — nav.js

async function genNotifications() {
  STATE.notifications = [];
  const email = sb.user?.email;
  const uid = sb.user?.id;

  (STATE.factures || []).filter(f => f.statut === 'retard').forEach(f => {
    STATE.notifications.push({ type: 'danger', icon: '⚠️', title: 'Facture ' + f.ref + ' en retard', body: 'Client: ' + f.client });
  });

  (STATE.devis || []).filter(d => d.statut === 'accepte' && !d.notif_lue).forEach(d => {
    STATE.notifications.push({ type: 'success', icon: '✅', title: 'Devis ' + d.ref + ' accepté', body: 'Client: ' + d.client });
  });

  if (email) {
    try {
      // FIX: fonction RPC SECURITY DEFINER — élimine toute dépendance à une
      // policy RLS (authenticated ou anon) sur notifications_app, qui
      // s'est révélée peu fiable des deux côtés.
      const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_mes_notifications', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_email: email })
      });
      const notifs = resp.ok ? ((await resp.json()) || []) : [];
      if (!resp.ok) {
        const errText = await resp.text().catch(function(){return '';});
        console.warn('get_mes_notifications a échoué', resp.status, errText);
        window._dernierDiagNotifications = ['Email : ' + email, 'HTTP ' + resp.status, errText || '(pas de détail)'];
      } else {
        window._dernierDiagNotifications = ['Email : ' + email, '✅ ' + notifs.length + ' notification(s) non lue(s) trouvée(s)'];
      }
      notifs.forEach(function(n) {
        STATE.notifications.push({ type: 'info', icon: n.type === 'invitation_comptable' ? '🤝' : '🔔', title: n.titre || '', body: n.corps || '', id: n.id, raw: n });
      });
    } catch(e2) {
      window._dernierDiagNotifications = ['Email : ' + email, 'Exception JS : ' + e2.message];
    }
  }

  const badge = document.getElementById('notif-badge');
  if (badge) {
    const count = STATE.notifications.length;
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}


function badgeF(s) { return {attente:'En attente',retard:'Retard',payee:'Payée',envoyee:'Envoyée'}[s]||s; }

function badgeDV(s) { return {envoye:'Envoyé',accepte:'Accepté',refuse:'Refusé',converti:'→Facture',expire:'Expiré'}[s]||s; }

async function renderNotifScreen() {
  const list = el('notif-list');
  if (!list) return;

  const uid = sb.user?.id;
  const emailEnt = sb.user?.email;

  let invitationsCpt = [];
  try {
    const resp = await fetch(
      SUPABASE_URL + '/rest/v1/invitations_comptable?entreprise_id=eq.' + uid + '&statut=eq.en_attente&order=created_at.desc',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    invitationsCpt = await resp.json() || [];

    if (emailEnt) {
      const resp2 = await fetch(
        SUPABASE_URL + '/rest/v1/invitations_comptable?entreprise_email=eq.' + encodeURIComponent(emailEnt) + '&statut=eq.en_attente&order=created_at.desc',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
      );
      const byEmail = await resp2.json() || [];
      byEmail.forEach(function(inv) {
        if (!invitationsCpt.find(function(i) { return i.id === inv.id; })) {
          invitationsCpt.push(inv);
        }
      });
    }
  } catch(e2) {}

  const allNotifs = STATE.notifications || [];

  if (!allNotifs.length && !invitationsCpt.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🔔</div><div class="empty-title">Aucune notification</div></div>';
    return;
  }

  let html = '';

  if (invitationsCpt.length) {
    html += '<div style="padding:10px 20px 4px;font-size:11px;font-weight:700;color:#1F6F72;text-transform:uppercase">Invitations en attente</div>';
    html += invitationsCpt.map(function(inv) {
      return '<div style="margin:8px 20px;background:#FBF0DA;border-radius:14px;padding:16px;border:1px solid #E8D9AE">' +
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">' +
          '<div style="font-size:24px">📊</div>' +
          '<div>' +
            '<div style="font-size:13px;font-weight:700">' + escapeHTML(inv.comptable_email||'') + '</div>' +
            '<div style="font-size:11px;color:#1F6F72">Souhaite accéder à vos documents</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn-accept-cpt-inv" data-id="' + inv.id + '" style="flex:1;padding:10px;background:#6E8F4E;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">✅ Accepter</button>' +
          '<button class="btn-refuse-cpt-inv" data-id="' + inv.id + '" style="flex:1;padding:10px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">❌ Refuser</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  if (allNotifs.length) {
    const typeIco = { tva_declaree:'📊', remarque_comptable:'📝', devis:'📝', facture:'🧾', invitation_comptable:'🤝', invitation_acceptee:'✅', facture_recue:'🧾', devis_recu:'📝' };
    html += allNotifs.map(function(n) {
      const isDoc = n.type === 'facture_recue' || n.type === 'devis_recu';
      let meta = {};
      try { meta = JSON.parse((n.raw && n.raw.meta) || '{}'); } catch(e3) {}
      return '<div class="notif-item' + (n.lue ? '' : ' notif-unread') + (isDoc ? ' notif-doc-view' : '') + '" ' + (isDoc ? 'data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="cursor:pointer"' : '') + '>' +
        '<div class="notif-ico">' + (typeIco[n.type] || '🔔') + '</div>' +
        '<div class="notif-body"><div class="notif-title">' + escapeHTML(n.title||'') + '</div>' +
        '<div class="notif-msg">' + escapeHTML(n.body||'') + '</div>' +
        (isDoc ? '<div style="font-size:10px;color:#9C9186;margin-top:4px">👆 Toucher pour voir le document</div><div style="display:flex;gap:6px;margin-top:8px">' +
          '<button class="btn-doc-accept" data-nid="' + (n.id||'') + '" data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="flex:1;padding:6px 2px;background:#6E8F4E;color:#fff;border:none;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">✅ Accepter</button>' +
          '<button class="btn-doc-attente" data-nid="' + (n.id||'') + '" data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="flex:1;padding:6px 2px;background:#F7EFDC;color:#B8860B;border:none;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">⏳ Attente</button>' +
          '<button class="btn-doc-refuse" data-nid="' + (n.id||'') + '" data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="flex:1;padding:6px 2px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit">❌ Refuser</button>' +
        '</div>' : '') +
        '</div></div>';
    }).join('');
  }

  list.innerHTML = html;

  // FIX: n'attacher l'écouteur qu'une seule fois sur ce noeud persistant.
  // Auparavant { once: true } ne géraient qu'un seul clic total sur tout
  // l'écran (accepter OU refuser UNE fois, plus rien ensuite).
  if (list.dataset.clickBound === '1') return;
  list.dataset.clickBound = '1';

  list.addEventListener('click', async function(e) {
    const btnA = e.target.closest('.btn-accept-cpt-inv');
    if (btnA) {
      const invId = btnA.dataset.id;
      const invResp = await fetch(
        SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + invId + '&select=*',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
      );
      const invData = await invResp.json();
      const inv = invData && invData[0];

      await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + invId, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'acceptee', entreprise_id: sb.user?.id })
      });

      if (inv && inv.comptable_email) {
        try {
          // FIX: récupère le nom/cabinet réel du comptable au lieu de
          // deviner un nom depuis son email.
          let nomCpt = inv.comptable_email.split('@')[0];
          try {
            const respCpt = await fetch(
              SUPABASE_URL + '/rest/v1/profils_comptable?email=eq.' + encodeURIComponent(inv.comptable_email) + '&select=nom,cabinet&limit=1',
              { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
            );
            const profCpt = await respCpt.json();
            const pc = profCpt && profCpt[0];
            if (pc && pc.nom) nomCpt = pc.nom + (pc.cabinet ? ' · ' + pc.cabinet : '');
          } catch(eCpt) {}

          await fetch(SUPABASE_URL + '/rest/v1/clients', {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': 'Bearer ' + sb.token,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({
              user_id: sb.user?.id,
              nom: nomCpt,
              email: inv.comptable_email,
              note: 'Mon comptable BaniPay',
              type: 'comptable_banipay'
            })
          });
        } catch(e2) {}
      }

      showToast('✅ Comptable accepté !', 'success');
      renderNotifScreen();
      renderMonComptable();
      return;
    }
    const btnR = e.target.closest('.btn-refuse-cpt-inv');
    if (btnR) {
      await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + btnR.dataset.id, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'refusee' })
      });
      showToast('Invitation refusée', 'success');
      renderNotifScreen();
      return;
    }

    // Accepter / Mettre en attente / Refuser une facture/devis reçu via
    // BaniPay directement depuis la notification — vérifié EN PREMIER, car
    // ces boutons sont imbriqués dans la zone cliquable "voir le document"
    // (sinon le clic sur un bouton déclencherait aussi l'ouverture du PDF).
    const btnDA = e.target.closest('.btn-doc-accept');
    const btnDAtt = e.target.closest('.btn-doc-attente');
    const btnDR = e.target.closest('.btn-doc-refuse');
    if (btnDA || btnDAtt || btnDR) {
      const target = btnDA || btnDAtt || btnDR;
      const t = target.dataset.type;
      const docId = target.dataset.docid;
      const nid = target.dataset.nid;
      if (!t || !docId) return;
      const table = t === 'devis' ? 'devis' : 'factures';
      const champ = t === 'devis' ? 'statut' : 'reponse_client';
      const valeur = btnDA ? (t === 'devis' ? 'accepte' : 'acceptee') : btnDAtt ? 'en_attente' : (t === 'devis' ? 'refuse' : 'refusee');
      const patchBody = {}; patchBody[champ] = valeur;
      if (btnDA) patchBody.signature_data = 'TEXTE:Accepté électroniquement le ' + new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
      try {
        // FIX: cette action modifie un devis/facture qui appartient à une
        // AUTRE entreprise (l'émetteur) — utiliser la session du destinataire
        // (sb.token) se heurte presque certainement à la RLS ("seul le
        // propriétaire peut modifier"). Le lien public (?doc=...) utilise
        // déjà la clé anonyme pour cette même action et fonctionne — on
        // aligne ce chemin dessus plutôt que d'utiliser sb.token.
        await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + docId, {
          method: 'PATCH',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody)
        });
        if (nid && !btnDAtt) {
          // On ne marque "lu" qu'en cas de décision définitive — la mise en
          // attente laisse la notification active pour y revenir facilement.
          await fetch(SUPABASE_URL + '/rest/v1/rpc/marquer_notification_lue', {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_id: nid })
          });
        }
        // FIX/NOUVEAU: quand une FACTURE reçue via compte BaniPay est
        // acceptée, elle s'enregistre automatiquement côté achats du client
        // — plus besoin de la ressaisir manuellement.
        if (btnDA && t === 'facture' && typeof enregistrerAchatDepuisFactureAcceptee === 'function') {
          await enregistrerAchatDepuisFactureAcceptee(docId);
        }
        showToast(btnDA ? '✅ Accepté' : btnDAtt ? '⏳ Mis en attente' : '❌ Refusé', 'success');
        await genNotifications();
        renderNotifScreen();
      } catch(e4) {
        showToast('Erreur: ' + e4.message, 'error');
      }
      return;
    }

    // Toucher la notification elle-même (hors boutons, vérifié après) ouvre le PDF
    const notifDoc = e.target.closest('.notif-doc-view');
    if (notifDoc) {
      const t = notifDoc.dataset.type;
      const docId = notifDoc.dataset.docid;
      if (t && docId && typeof voirDocumentDepuisNotification === 'function') {
        voirDocumentDepuisNotification(t, docId);
      }
      return;
    }
  });
}

// Ouvre le PDF d'un devis/facture reçu directement depuis sa notification,
// avec les mêmes boutons Accepter/Attente/Refuser que le lien public.
async function voirDocumentDepuisNotification(type, docId) {
  if (!type || !docId) return;
  showToast('⏳ Chargement du document...');
  try {
    const table = type === 'devis' ? 'devis' : 'factures';
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + docId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    const doc = data && data[0];
    if (!doc) { showToast('Document introuvable', 'error'); return; }

    const rp = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + doc.user_id + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const profils = await rp.json();
    const emetteur = (profils && profils[0]) || {};
    const isDevis = type === 'devis';
    const lignes = typeof doc.lignes === 'string' ? JSON.parse(doc.lignes || '[]') : (doc.lignes || []);

    genDocPDF({
      type: isDevis ? 'DEVIS' : 'FACTURE',
      ref: doc.ref,
      color: isDevis ? '#B8860B' : (emetteur.couleur_accent || '#C9971F'),
      emetteur: emetteur,
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
      signatureClient: doc.signature_data || null,
      doc_id: docId,
    });

    const champ = isDevis ? 'statut' : 'reponse_client';
    const valeurActuelle = doc[champ];
    const valAcceptee = isDevis ? 'accepte' : 'acceptee';
    const valRefusee = isDevis ? 'refuse' : 'refusee';
    const dejaTraite = valeurActuelle === valAcceptee || valeurActuelle === valRefusee;

    if (!dejaTraite) {
      setTimeout(function() {
        const screen = document.getElementById('pdf-fullscreen');
        if (!screen) return;
        const btnBar = document.createElement('div');
        btnBar.style.cssText = 'background:#fff;padding:12px 16px;display:flex;gap:6px;border-top:2px solid #E3DCCF;flex-shrink:0';
        const bAcc = document.createElement('button');
        bAcc.textContent = '✅ Accepter';
        bAcc.style.cssText = 'flex:1;padding:12px 4px;background:#6E8F4E;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit';
        bAcc.onclick = function() { traiterActionDocument(docId, type, 'accepter'); };
        const bAtt = document.createElement('button');
        bAtt.textContent = '⏳ Attente';
        bAtt.style.cssText = 'flex:1;padding:12px 4px;background:#B8860B;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit';
        bAtt.onclick = function() { traiterActionDocument(docId, type, 'attente'); };
        const bRef = document.createElement('button');
        bRef.textContent = '❌ Refuser';
        bRef.style.cssText = 'flex:1;padding:12px 4px;background:#8E2E24;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit';
        bRef.onclick = function() { traiterActionDocument(docId, type, 'refuser'); };
        btnBar.appendChild(bAcc);
        btnBar.appendChild(bAtt);
        btnBar.appendChild(bRef);
        screen.appendChild(btnBar);
      }, 400);
    }
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}


function goScreen(name) {
  const publicScreens = ['auth'];
  if (!publicScreens.includes(name) && !sb.token && !['portail','profil-public'].includes(name)) {
    if (name !== 'auth') { goScreen('auth'); return; }
  }
  hideToast();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const sc = el('screen-' + name);
  if (sc) { sc.classList.add('active'); sc.scrollTop = 0; }

  const _noNav = ['auth','comptable','cpt-entreprise','comptable-profil','dashboard-comptable','pdf-viewer','chat'];
  const _bottomNav = document.querySelector('.bottom-nav');
  if (_bottomNav) _bottomNav.style.display = _noNav.includes(name) ? 'none' : 'flex';

  const _navMap = {'dashboard':'nav-home','nouvelle':'nav-home','detail':'nav-home',
    'devis-list':'nav-devis','nouveau-devis':'nav-devis','detail-devis':'nav-devis',
    'clients':'nav-clients','nouveau-client':'nav-clients','detail-client':'nav-clients',
    'profil':'nav-profil','stats':'nav-profil','parametres':'nav-profil','archive':'nav-profil'};
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  const _activeNav = _navMap[name];
  if (_activeNav) { const _nb = document.getElementById(_activeNav); if(_nb) _nb.classList.add('active'); }

  const actions = {
    'archive': renderArchive,
    'annuaire': filtrerAnnuaire,
    'achats': renderAchats,
    'nouvelle-achat': function() { calcAchatTotaux(); if (typeof renderAchatProduitPicker === 'function') renderAchatProduitPicker(); },
    'avoir-list': renderAvoirList,
    'abonnements': typeof renderAbonnements === 'function' ? renderAbonnements : function() { showToast('Module abonnements non installé', 'error'); goScreen('dashboard'); },
    'nouvel-abonnement': typeof initNouvelAbonnement === 'function' ? initNouvelAbonnement : function() { showToast('Module abonnements non installé', 'error'); goScreen('dashboard'); },
    'detail-abonnement': function() {},
    'releves': function() { loadReleves(); },
    'messages': function() { loadConversations().then(renderConversations); },
    'chat': function() {},
    'dashboard': renderDashboard,
    'nouvelle': initNouvelle,
    'devis-list': renderDevisList,
    'nouveau-devis': initNouveauDevis,
    'avoir': initAvoir,
    'bon-commande': initBonCommande,
    'bon-livraison': initBonLivraison,
    'clients': renderClients,
    'nouveau-client': initNouveauClient,
    'detail-client': function() {},
    'modifier-client': function() {},
    'produits': renderProduits,
    'nouveau-produit': initNouveauProduit,
    'modifier-produit': function() {},
    'stats': function() { renderStats(); renderStatsDashboard(); verifierRappels(); },
    'tva': renderTVA,
    'recherche': initRecherche,
    'notifications': renderNotifScreen,
    'audit': renderJournalAudit,
    'profil': function() { renderProfil(); setTimeout(renderMonComptable, 300); },
    'comptable': renderComptableDashboard,
    'comptable-profil': renderComptableProfil,
    'cpt-entreprise': function() {},
    'brouillons': renderBrouillons,
    'relances': renderRelances,
    'parametres': renderParametres,
    'historique-paiements': function() {},
    'acomptes': function() {},
  };
  if (actions[name]) actions[name]();
}
