// ZELTO — nav.js

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

  // NOUVEAU: facture bientôt en retard (échéance dans les 3 prochains jours,
  // pas encore payée) — pour agir avant que ça devienne un vrai retard.
  const dansTroisJours = new Date();
  dansTroisJours.setDate(dansTroisJours.getDate() + 3);
  const aujourdHui = new Date();
  (STATE.factures || []).filter(function(f) {
    if (f.statut === 'payee' || f.statut === 'retard' || !f.echeance) return false;
    const ech = new Date(f.echeance);
    return ech >= aujourdHui && ech <= dansTroisJours;
  }).forEach(function(f) {
    STATE.notifications.push({ type: 'warning', icon: '⏰', title: 'Échéance proche — ' + f.ref, body: 'Client: ' + f.client + ' · Échéance le ' + f.echeance });
  });

  // NOUVEAU: stock bas (seuil d'alerte configuré et atteint)
  (STATE.produits || []).filter(function(p) {
    return p.stock != null && p.seuil_alerte != null && Number(p.stock) <= Number(p.seuil_alerte);
  }).forEach(function(p) {
    STATE.notifications.push({ type: 'warning', icon: '📦', title: 'Stock bas — ' + p.nom, body: (p.stock) + ' ' + (p.unite||'u') + ' restant(s) (seuil: ' + p.seuil_alerte + ')' });
  });

  // NOUVEAU: abonnement (facturation récurrente) à générer sous 3 jours
  if (STATE.abonnements && STATE.abonnements.length) {
    (STATE.abonnements || []).filter(function(a) {
      if (a.statut !== 'actif' || !a.prochaine_date) return false;
      const prochaine = new Date(a.prochaine_date);
      return prochaine >= aujourdHui && prochaine <= dansTroisJours;
    }).forEach(function(a) {
      STATE.notifications.push({ type: 'info', icon: '🔁', title: 'Facturation récurrente proche — ' + a.client, body: 'Prochaine génération le ' + a.prochaine_date });
    });
  }

  // NOUVEAU: relances factures configurables (avant échéance / jour J /
  // retard), avec message personnalisable — remplace/complète l'alerte
  // générique "en retard" par une vraie proposition d'action.
  if (typeof ajouterNotificationsRelances === 'function') ajouterNotificationsRelances();

  // NOUVEAU: relance devis envoyé depuis plus de 7 jours sans réponse — rien
  // ne signalait jusqu'ici qu'un devis dormait sans qu'on y pense.
  const ilYA7Jours = new Date();
  ilYA7Jours.setDate(ilYA7Jours.getDate() - 7);
  (STATE.devis || []).filter(function(d) {
    return (d.statut === 'envoye' || d.statut === 'en_attente') && d.date_emission && new Date(d.date_emission) <= ilYA7Jours;
  }).forEach(function(d) {
    STATE.notifications.push({ type: 'warning', icon: '📝', title: 'Devis sans réponse — ' + d.ref, body: 'Envoyé le ' + d.date_emission + ' à ' + d.client + ' — pensez à relancer' });
  });

  // NOUVEAU: relance bon de commande envoyé depuis plus de 7 jours sans
  // confirmation du fournisseur.
  (STATE.bonsCommande || []).filter(function(bc) {
    return bc.statut === 'envoye' && bc.date_commande && new Date(bc.date_commande) <= ilYA7Jours;
  }).forEach(function(bc) {
    STATE.notifications.push({ type: 'warning', icon: '📋', title: 'Bon de commande sans réponse — ' + bc.ref, body: 'Envoyé le ' + bc.date_commande + ' à ' + bc.fournisseur + ' — pensez à relancer' });
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

  mettreAJourBadgeNotif();
}

function mettreAJourBadgeNotif() {
  const badge = document.getElementById('notif-badge');
  if (badge) {
    const count = (STATE.notifications || []).length;
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}


function badgeF(s) { return {attente:'En attente',retard:'Retard',payee:'Payée',envoyee:'Envoyée'}[s]||s; }

function badgeDV(s) { return {envoye:'Envoyé',accepte:'Accepté',refuse:'Refusé',converti:'→Facture',expire:'Expiré',en_attente:'⏳ En attente'}[s]||s; }

// ============================================================
// CONSTRUCTION HTML PARTAGÉE (écran plein page + panneau déroulant)
// ============================================================

async function chargerInvitationsComptableEnAttente() {
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
  return invitationsCpt;
}

function htmlInvitationsCpt(invitationsCpt) {
  if (!invitationsCpt.length) return '';
  return '<div style="padding:10px 20px 4px;font-size:11px;font-weight:700;color:#1F6F72;text-transform:uppercase">Invitations en attente</div>' +
    invitationsCpt.map(function(inv) {
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

function htmlListeNotifications(allNotifs) {
  if (!allNotifs.length) return '';
  const typeIco = { tva_declaree:'📊', remarque_comptable:'📝', devis:'📝', facture:'🧾', invitation_comptable:'🤝', invitation_acceptee:'✅', facture_recue:'🧾', devis_recu:'📝', bc_repondu:'📋' };
  return allNotifs.map(function(n) {
    // FIX: même bug que plus haut — n.type est toujours 'info' pour les
    // notifications de la base, le vrai type est dans n.raw.type. Cette
    // vérification étant toujours fausse, AUCUNE notification n'a jamais
    // été traitée comme "document à ouvrir" : ni la classe cliquable, ni
    // les boutons Accepter/Attente/Refuser ne s'affichaient jamais.
    const isDoc = n.raw && (n.raw.type === 'facture_recue' || n.raw.type === 'devis_recu');
    let meta = {};
    try { meta = JSON.parse((n.raw && n.raw.meta) || '{}'); } catch(e3) {}
    return '<div class="notif-item' + (n.lue ? '' : ' notif-unread') + (isDoc ? ' notif-doc-view' : '') + '" ' + (isDoc ? 'data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="cursor:pointer"' : '') + '>' +
      '<div class="notif-ico">' + (typeIco[n.raw && n.raw.type] || n.icon || '🔔') + '</div>' +
      '<div class="notif-body"><div class="notif-title">' + escapeHTML(n.title||'') + '</div>' +
      '<div class="notif-msg">' + escapeHTML(n.body||'') + '</div>' +
      (isDoc ? '<div style="font-size:10px;color:#9C9186;margin-top:4px">👆 Toucher pour voir le document</div><div style="display:flex;gap:6px;margin-top:8px">' +
        '<button class="btn-doc-accept" data-nid="' + (n.id||'') + '" data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="flex:1;padding:6px 2px;background:#6E8F4E;color:#fff;border:none;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">✅ Accepter</button>' +
        '<button class="btn-doc-attente" data-nid="' + (n.id||'') + '" data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="flex:1;padding:6px 2px;background:#F7EFDC;color:#B8860B;border:none;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">⏳ Attente</button>' +
        '<button class="btn-doc-refuse" data-nid="' + (n.id||'') + '" data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="flex:1;padding:6px 2px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit">❌ Refuser</button>' +
      '</div>' : '') +
      (n._relanceFactureId ? '<button class="btn-envoyer-relance" data-facture-id="' + n._relanceFactureId + '" data-type-relance="' + n._relanceType + '" style="margin-top:8px;width:100%;padding:6px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">📤 Envoyer la relance</button>' : '') +
      '</div></div>';
  }).join('');
}

// ============================================================
// GESTIONNAIRE DE CLIC PARTAGÉ (écran plein page + panneau déroulant)
// ============================================================

async function gererClicNotification(e) {
  const btnRelance = e.target.closest('.btn-envoyer-relance');
  if (btnRelance) {
    const fid = parseInt(btnRelance.dataset.factureId);
    const type = btnRelance.dataset.typeRelance;
    if (typeof envoyerRelance === 'function') await envoyerRelance(fid, type);
    return;
  }
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
            nom: inv.comptable_email.split('@')[0],
            email: inv.comptable_email,
            note: 'Mon comptable Zelto',
            type: 'comptable_banipay'
          })
        });
      } catch(e2) {}
    }

    showToast('✅ Comptable accepté !', 'success');
    await genNotifications();
    renderNotifScreen();
    fermerNotifDropdown();
    renderMonComptable();
    return true;
  }
  const btnR = e.target.closest('.btn-refuse-cpt-inv');
  if (btnR) {
    await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + btnR.dataset.id, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'refusee' })
    });
    showToast('Invitation refusée', 'success');
    await genNotifications();
    renderNotifScreen();
    fermerNotifDropdown();
    return true;
  }

  // Accepter / Mettre en attente / Refuser une facture/devis reçu via
  // Zelto directement depuis la notification — vérifié EN PREMIER, car
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
    if (!t || !docId) return true;
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
      // FIX/NOUVEAU: quand une FACTURE reçue via compte Zelto est
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
    return true;
  }

  // Toucher la notification elle-même (hors boutons, vérifié après) ouvre
  // le PDF — c'est LE point demandé : cliquer sur la notif emmène vers le
  // contenu (devis/facture), avec les boutons Accepter/Attente/Refuser.
  const notifDoc = e.target.closest('.notif-doc-view');
  if (notifDoc) {
    const t = notifDoc.dataset.type;
    const docId = notifDoc.dataset.docid;
    fermerNotifDropdown();
    if (t && docId && typeof voirDocumentDepuisNotification === 'function') {
      voirDocumentDepuisNotification(t, docId);
    }
    return true;
  }
  return false;
}

// ============================================================
// ÉCRAN NOTIFICATIONS PLEIN PAGE (conservé, accessible depuis Profil)
// ============================================================

async function renderNotifScreen() {
  const list = el('notif-list');
  if (!list) return;

  const invitationsCpt = await chargerInvitationsComptableEnAttente();
  const allNotifs = STATE.notifications || [];

  if (!allNotifs.length && !invitationsCpt.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🔔</div><div class="empty-title">Aucune notification</div></div>';
    return;
  }

  list.innerHTML = htmlInvitationsCpt(invitationsCpt) + htmlListeNotifications(allNotifs);

  // FIX: n'attacher l'écouteur qu'une seule fois sur ce noeud persistant.
  // Auparavant { once: true } ne géraient qu'un seul clic total sur tout
  // l'écran (accepter OU refuser UNE fois, plus rien ensuite).
  if (list.dataset.clickBound === '1') return;
  list.dataset.clickBound = '1';
  list.addEventListener('click', function(e) { gererClicNotification(e); });
}

// ============================================================
// PANNEAU DÉROULANT FAÇON FACEBOOK (depuis la cloche du dashboard)
// ============================================================
// FIX/NOUVEAU: au lieu de naviguer vers un écran plein page, un petit
// panneau s'ouvre sous la cloche avec toutes les notifications — clic sur
// une notification de devis/facture = ouvre directement le PDF avec
// Accepter/Attente/Refuser. À l'ouverture, les notifications purement
// informatives (invitation, TVA déclarée, remarque — sans bouton d'action)
// sont marquées lues automatiquement, pour que le compteur sur la cloche
// ne reste plus cumulatif indéfiniment (seules les factures/devis reçus non
// encore traités continuent de compter, à juste titre).

function fermerNotifDropdown() {
  document.getElementById('notif-dropdown')?.remove();
  document.removeEventListener('click', _fermerNotifDropdownSiExterieur, true);
}

function _fermerNotifDropdownSiExterieur(e) {
  const panel = document.getElementById('notif-dropdown');
  if (panel && !panel.contains(e.target) && !e.target.closest('.t-icon')) {
    fermerNotifDropdown();
  }
}

async function toggleNotifDropdown(event) {
  if (event) event.stopPropagation();
  const existant = document.getElementById('notif-dropdown');
  if (existant) { fermerNotifDropdown(); return; }
  try {

  await genNotifications();
  const invitationsCpt = await chargerInvitationsComptableEnAttente();
  const allNotifs = STATE.notifications || [];

  const panel = document.createElement('div');
  panel.id = 'notif-dropdown';
  panel.style.cssText = 'position:fixed;top:60px;right:12px;left:12px;max-width:400px;margin-left:auto;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(42,36,32,0.25);z-index:9999;max-height:70vh;overflow-y:auto;border:1px solid #E3DCCF';

  const contenu = htmlInvitationsCpt(invitationsCpt) + htmlListeNotifications(allNotifs);
  panel.innerHTML =
    '<div style="padding:14px 16px;border-bottom:1px solid #E3DCCF;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#fff;border-radius:16px 16px 0 0">' +
      '<div style="font-family:\'Baloo 2\',sans-serif;font-size:15px;font-weight:700;color:#2A2420">🔔 Notifications</div>' +
      '<button onclick="fermerNotifDropdown()" style="background:#EAE4DA;color:#6B5F54;border:none;border-radius:50%;width:26px;height:26px;font-size:14px;cursor:pointer;font-family:inherit">✕</button>' +
    '</div>' +
    (allNotifs.length || invitationsCpt.length ? contenu : '<div class="empty"><div class="empty-ico">🔔</div><div class="empty-title">Aucune notification</div></div>') +
    '<div style="padding:10px 16px;border-top:1px solid #E3DCCF"><button onclick="fermerNotifDropdown();goScreen(\'notifications\',null)" style="width:100%;padding:8px;background:none;color:#9C9186;border:none;font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline">Voir tout / diagnostic</button></div>';

  document.body.appendChild(panel);
  panel.addEventListener('click', function(e) { gererClicNotification(e); });
  setTimeout(function() { document.addEventListener('click', _fermerNotifDropdownSiExterieur, true); }, 50);

  // Marquer comme lues les notifications purement informatives (sans
  // bouton d'action) — c'est ce qui empêchait le compteur de redescendre.
  const aMarquer = allNotifs.filter(function(n) {
    // FIX: n.type vaut toujours 'info' pour les notifications venant de la
    // base (c'est juste une catégorie d'affichage) — le vrai type stocké en
    // base est dans n.raw.type. Vérifier n.type ici marquait TOUJOURS vrai,
    // donc TOUTES les notifications étaient marquées lues et supprimées dès
    // l'ouverture du panneau, y compris les devis/factures reçus qui ne
    // doivent jamais être marqués avant une vraie décision (accepter/
    // refuser/attente).
    return n.raw && n.id && n.raw.type !== 'facture_recue' && n.raw.type !== 'devis_recu';
  });
  for (const n of aMarquer) {
    try {
      await fetch(SUPABASE_URL + '/rest/v1/rpc/marquer_notification_lue', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_id: n.id })
      });
    } catch(eMarq) {}
  }
  if (aMarquer.length) {
    // Retirer ces notifications de l'état local et rafraîchir le badge
    // sans attendre le prochain cycle de polling (30s).
    const idsMarques = aMarquer.map(function(n) { return n.id; });
    STATE.notifications = STATE.notifications.filter(function(n) { return !idsMarques.includes(n.id); });
    mettreAJourBadgeNotif();
  }
  } catch(e) {
    console.error('toggleNotifDropdown: exception', e);
    afficherDiagnostic('Erreur ouverture du panneau notifications', [
      'Message : ' + e.message,
      e.stack ? e.stack.split('\n').slice(0,5).join('\n') : ''
    ]);
  }
}


// Ouvre le PDF d'un devis/facture reçu directement depuis sa notification,
// avec les mêmes boutons Accepter/Attente/Refuser que le lien public.
async function voirDocumentDepuisNotification(type, docId) {
  if (!type || !docId) {
    afficherDiagnostic('Impossible d\'ouvrir la notification', [
      'type reçu : "' + type + '"',
      'docId reçu : "' + docId + '"',
      '→ Un des deux est vide : le champ "meta" de la notification ne contient probablement pas doc_type/doc_id (notification créée avant ce correctif, ou d\'un type sans document associé comme une invitation ou une remarque).'
    ]);
    return;
  }
  showToast('⏳ Chargement du document...');
  try {
    const table = type === 'devis' ? 'devis' : 'factures';
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + docId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    const doc = data && data[0];
    if (!doc) { afficherDiagnostic('Document introuvable', ['table : ' + table, 'docId : ' + docId, '→ Aucune ligne trouvée avec cet id dans ' + table]); return; }

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
    console.error('voirDocumentDepuisNotification: exception', e);
    afficherDiagnostic('Erreur lors de l\'ouverture du document', [
      'type : ' + type + ' · docId : ' + docId,
      'Message : ' + e.message,
      e.stack ? e.stack.split('\n').slice(0,4).join('\n') : ''
    ]);
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

  // FIX MAJEUR: chaque valeur ci-dessous était une référence "nue" à une
  // fonction (ex: 'tva': renderTVA). En JavaScript, cet objet est
  // reconstruit à CHAQUE appel de goScreen() — et si UNE SEULE de ces
  // fonctions n'existe pas (bug de nommage, fichier manquant comme
  // stats.js), la construction de tout l'objet plante immédiatement,
  // cassant la navigation vers TOUS les écrans, pas seulement celui
  // concerné. On enveloppe donc chaque référence dans une vérification
  // typeof, pour qu'une fonction manquante n'affecte plus qu'elle-même.
  function _safe(fn, nomFn) {
    return typeof fn === 'function' ? fn : function() { console.warn('Fonction manquante: ' + nomFn); };
  }
  const actions = {
    'archive': _safe(typeof renderArchive!=='undefined'?renderArchive:undefined,'renderArchive'),
    'annuaire': _safe(typeof filtrerAnnuaire!=='undefined'?filtrerAnnuaire:undefined,'filtrerAnnuaire'),
    'achats': _safe(typeof renderAchats!=='undefined'?renderAchats:undefined,'renderAchats'),
    'nouvelle-achat': function() { if (typeof renderLignesAchat==='function') renderLignesAchat(); },
    'avoir-list': _safe(typeof renderAvoirList!=='undefined'?renderAvoirList:undefined,'renderAvoirList'),
    'abonnements': typeof renderAbonnements === 'function' ? renderAbonnements : function() { showToast('Module abonnements non installé', 'error'); goScreen('dashboard'); },
    'nouvel-abonnement': typeof initNouvelAbonnement === 'function' ? initNouvelAbonnement : function() { showToast('Module abonnements non installé', 'error'); goScreen('dashboard'); },
    'detail-abonnement': function() {},
    'releves': function() { if (typeof loadReleves==='function') loadReleves(); },
    'messages': function() { if (typeof loadConversations==='function') loadConversations().then(renderConversations); },
    'chat': function() {},
    'dashboard': _safe(typeof renderDashboard!=='undefined'?renderDashboard:undefined,'renderDashboard'),
    'nouvelle': function() { if (typeof initNouvelle==='function') initNouvelle(); if (typeof remplirPickerBCPourDevis === 'function') { const sel = el('f-bc-lie'); if (sel) { sel.innerHTML = '<option value="">Aucun</option>' + (STATE.bonsCommande || []).map(function(bc) { return '<option value="' + bc.id + '">' + escapeHTML(bc.ref||'') + ' — ' + escapeHTML(bc.fournisseur||'') + '</option>'; }).join(''); } } },
    'devis-list': _safe(typeof renderDevisList!=='undefined'?renderDevisList:undefined,'renderDevisList'),
    'nouveau-devis': function() { if (typeof initNouveauDevis==='function') initNouveauDevis(); if (typeof remplirPickerBCPourDevis==='function') remplirPickerBCPourDevis(); },
    'avoir': _safe(typeof initAvoir!=='undefined'?initAvoir:undefined,'initAvoir'),
    'bon-commande': _safe(typeof initBonCommande!=='undefined'?initBonCommande:undefined,'initBonCommande'),
    'bon-livraison': _safe(typeof initBonLivraison!=='undefined'?initBonLivraison:undefined,'initBonLivraison'),
    'bons-commande-list': function() { if (typeof loadBonsCommande==='function') loadBonsCommande(); },
    'bons-livraison-list': function() { if (typeof loadBonsLivraison==='function') loadBonsLivraison(); },
    'clients': _safe(typeof renderClients!=='undefined'?renderClients:undefined,'renderClients'),
    'nouveau-client': _safe(typeof initNouveauClient!=='undefined'?initNouveauClient:undefined,'initNouveauClient'),
    'detail-client': function() {},
    'modifier-client': function() {},
    'produits': _safe(typeof renderProduits!=='undefined'?renderProduits:undefined,'renderProduits'),
    'nouveau-produit': _safe(typeof initNouveauProduit!=='undefined'?initNouveauProduit:undefined,'initNouveauProduit'),
    'modifier-produit': function() {},
    'stats': function() { if (typeof renderStats==='function') renderStats(); if (typeof renderStatsDashboard==='function') renderStatsDashboard(); if (typeof verifierRappels==='function') verifierRappels(); },
    'tva': _safe(typeof renderTVA!=='undefined'?renderTVA:undefined,'renderTVA'),
    'position-financiere': _safe(typeof renderPositionFinanciere!=='undefined'?renderPositionFinanciere:undefined,'renderPositionFinanciere'),
    'rapport-stock': function() { if (typeof renderRapportStock === 'function') renderRapportStock(); },
    'dashboard-avance': function() { if (typeof renderDashboardAvance === 'function') renderDashboardAvance(); },
    'recherche': _safe(typeof initRecherche!=='undefined'?initRecherche:undefined,'initRecherche'),
    'notifications': _safe(typeof renderNotifScreen!=='undefined'?renderNotifScreen:undefined,'renderNotifScreen'),
    'audit': _safe(typeof renderJournalAudit!=='undefined'?renderJournalAudit:undefined,'renderJournalAudit'),
    'profil': function() { if (typeof renderProfil==='function') renderProfil(); setTimeout(function(){ if (typeof renderMonComptable==='function') renderMonComptable(); }, 300); },
    'comptable': _safe(typeof renderComptableDashboard!=='undefined'?renderComptableDashboard:undefined,'renderComptableDashboard'),
    'comptable-profil': function() { if (typeof renderComptableProfil==='function') renderComptableProfil(); if (typeof chargerEquipeCabinet === 'function') chargerEquipeCabinet(); },
    'cpt-entreprise': function() {},
    'brouillons': _safe(typeof renderBrouillons!=='undefined'?renderBrouillons:undefined,'renderBrouillons'),
    'relances': _safe(typeof renderRelances!=='undefined'?renderRelances:undefined,'renderRelances'),
    'parametres': function() { if (typeof renderParametres==='function') renderParametres(); if (typeof afficherStatutDGI === 'function') afficherStatutDGI(); if (typeof afficherParametresRelance === 'function') afficherParametresRelance(); if (typeof chargerEquipe === 'function') chargerEquipe(); },
    'historique-paiements': function() {},
    'acomptes': function() {},
    'employes': function() { if (typeof loadEmployes==='function') loadEmployes(); },
    'nouvel-employe': function() {},
  };
  if (actions[name]) actions[name]();
}

// FIX MAJEUR: initRecherche() n'existait nulle part (même souci que
// renderTVA — cassait toute la navigation). rechercheGlobale() non plus,
// alors que le champ de recherche l'appelait déjà depuis longtemps.
function initRecherche() {
  const input = el('search-global');
  if (input) input.value = '';
  const results = el('search-results');
  if (results) results.innerHTML = '<div style="text-align:center;padding:30px;color:#9C9186;font-size:12px">Tapez pour rechercher parmi vos factures, devis, clients et achats</div>';
  setTimeout(function() { input?.focus(); }, 150);
}

function rechercheGlobale() {
  const q = (el('search-global')?.value || '').trim().toLowerCase();
  const results = el('search-results');
  if (!results) return;
  if (q.length < 2) {
    results.innerHTML = '<div style="text-align:center;padding:30px;color:#9C9186;font-size:12px">Tapez au moins 2 caractères</div>';
    return;
  }

  const blocs = [];

  const facturesTrouvees = (STATE.factures || []).filter(function(f) {
    return (f.ref||'').toLowerCase().includes(q) || (f.client||'').toLowerCase().includes(q);
  }).slice(0, 8);
  if (facturesTrouvees.length) {
    blocs.push('<div style="font-size:11px;font-weight:700;color:#9C9186;text-transform:uppercase;padding:10px 0 6px">🧾 Factures</div>' +
      facturesTrouvees.map(function(f) {
        return '<div class="card" onclick="openDetail(' + f.id + ')"><div class="card-ico" style="background:#FBF0DA">🧾</div><div class="card-body"><div class="card-name">' + escapeHTML(f.client||'') + '</div><div class="card-ref">' + (f.ref||'') + '</div></div><div class="card-end"><div class="card-amount">' + fmt(f.ttc||0) + ' MAD</div></div></div>';
      }).join(''));
  }

  const devisTrouves = (STATE.devis || []).filter(function(d) {
    return (d.ref||'').toLowerCase().includes(q) || (d.client||'').toLowerCase().includes(q);
  }).slice(0, 8);
  if (devisTrouves.length) {
    blocs.push('<div style="font-size:11px;font-weight:700;color:#9C9186;text-transform:uppercase;padding:10px 0 6px">📝 Devis</div>' +
      devisTrouves.map(function(d) {
        return '<div class="card" onclick="openDetailDevis(' + d.id + ')"><div class="card-ico" style="background:#F7EFDC">📝</div><div class="card-body"><div class="card-name">' + escapeHTML(d.client||'') + '</div><div class="card-ref">' + (d.ref||'') + '</div></div><div class="card-end"><div class="card-amount">' + fmt(d.ttc||0) + ' MAD</div></div></div>';
      }).join(''));
  }

  const clientsTrouves = (STATE.clients || []).filter(function(c) {
    return (c.nom||'').toLowerCase().includes(q) || (c.tel||'').includes(q);
  }).slice(0, 8);
  if (clientsTrouves.length) {
    blocs.push('<div style="font-size:11px;font-weight:700;color:#9C9186;text-transform:uppercase;padding:10px 0 6px">👤 Clients</div>' +
      clientsTrouves.map(function(c) {
        return '<div class="card" onclick="ouvrirModifClient(' + c.id + ')"><div class="card-ico" style="background:#E9F4F3">👤</div><div class="card-body"><div class="card-name">' + escapeHTML(c.nom||'') + '</div><div class="card-ref">' + (c.tel||'') + '</div></div></div>';
      }).join(''));
  }

  const achatsTrouves = (STATE.achats || []).filter(function(a) {
    return (a.fournisseur||'').toLowerCase().includes(q) || (a.ref_fournisseur||'').toLowerCase().includes(q);
  }).slice(0, 8);
  if (achatsTrouves.length) {
    blocs.push('<div style="font-size:11px;font-weight:700;color:#9C9186;text-transform:uppercase;padding:10px 0 6px">🛒 Achats</div>' +
      achatsTrouves.map(function(a) {
        return '<div class="card" onclick="ouvrirDetailAchat(' + a.id + ')"><div class="card-ico" style="background:#F5E4E1">🛒</div><div class="card-body"><div class="card-name">' + escapeHTML(a.fournisseur||'') + '</div><div class="card-ref">' + (a.ref_fournisseur||'') + '</div></div><div class="card-end"><div class="card-amount">' + fmt(a.ttc||0) + ' MAD</div></div></div>';
      }).join(''));
  }

  results.innerHTML = blocs.length ? blocs.join('') : '<div style="text-align:center;padding:30px;color:#9C9186;font-size:12px">Aucun résultat pour "' + escapeHTML(q) + '"</div>';
}
