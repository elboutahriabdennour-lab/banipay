// ZELTO — nav.js

// ============================================================
// NOTIFICATIONS (événements réels, stockés en base, vraiment marquables
// comme lus) — séparé des ALERTES (état de l'activité, recalculé à
// chaque fois, voir genAlertes() plus bas). Les deux étaient mélangés
// avant : une alerte de stock bas revenait à chaque ouverture même après
// "tout marquer comme lu", puisqu'elle n'a pas de statut lu en base — ce
// n'est pas un événement ponctuel, c'est un état actuel.
// ============================================================
async function genNotifications() {
  STATE.notifications = [];
  const email = sb.user?.email;

  if (email) {
    try {
      // FIX: fonction RPC SECURITY DEFINER — élimine toute dépendance à une
      // policy RLS (authenticated ou anon) sur notifications_app, qui
      // s'est révélée peu fiable des deux côtés.
      const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_mes_notifications', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (sb.token || SUPABASE_KEY), 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_email: email })
      });
      const notifs = resp.ok ? ((await resp.json()) || []) : [];
      if (!resp.ok) {
        const errText = await resp.text().catch(function(){return '';});
        console.warn('get_mes_notifications a échoué', resp.status, errText);
      }
      notifs.forEach(function(n) {
        STATE.notifications.push({ type: 'info', icon: n.type === 'invitation_comptable' ? '🤝' : '🔔', title: n.titre || '', body: n.corps || '', id: n.id, raw: n });
      });
    } catch(e2) {}
  }

  mettreAJourBadgeNotif();
  if (typeof genAlertes === 'function') genAlertes();
}

// ============================================================
// ALERTES (état actuel de l'activité — pas des événements, pas de statut
// lu en base : chacune disparaît d'elle-même une fois le problème réglé,
// ex. la facture payée, le stock réapprovisionné). Vues séparément de la
// cloche, dans l'écran "Alertes" dédié.
// ============================================================
function genAlertes() {
  STATE.alertes = [];
  const dansTroisJours = new Date();
  dansTroisJours.setDate(dansTroisJours.getDate() + 3);
  const aujourdHui = new Date();

  (STATE.factures || []).filter(f => f.statut === 'retard').forEach(f => {
    STATE.alertes.push({ type: 'danger', icon: '⚠️', title: 'Facture ' + f.ref + ' en retard', body: 'Client: ' + f.client });
  });

  (STATE.factures || []).filter(function(f) {
    if (f.statut === 'payee' || f.statut === 'retard' || !f.echeance) return false;
    const ech = new Date(f.echeance);
    return ech >= aujourdHui && ech <= dansTroisJours;
  }).forEach(function(f) {
    STATE.alertes.push({ type: 'warning', icon: '⏰', title: 'Échéance proche — ' + f.ref, body: 'Client: ' + f.client + ' · Échéance le ' + f.echeance });
  });

  (STATE.produits || []).filter(function(p) {
    return p.stock != null && p.seuil_alerte != null && Number(p.stock) <= Number(p.seuil_alerte);
  }).forEach(function(p) {
    STATE.alertes.push({ type: 'warning', icon: '📦', title: 'Stock bas — ' + p.nom, body: (p.stock) + ' ' + (p.unite||'u') + ' restant(s) (seuil: ' + p.seuil_alerte + ')' });
  });

  if (STATE.abonnements && STATE.abonnements.length) {
    (STATE.abonnements || []).filter(function(a) {
      if (a.statut !== 'actif' || !a.prochaine_date) return false;
      const prochaine = new Date(a.prochaine_date);
      return prochaine >= aujourdHui && prochaine <= dansTroisJours;
    }).forEach(function(a) {
      STATE.alertes.push({ type: 'info', icon: '🔁', title: 'Facturation récurrente proche — ' + a.client, body: 'Prochaine génération le ' + a.prochaine_date });
    });
  }

  if (typeof ajouterNotificationsRelances === 'function') ajouterNotificationsRelances();

  const ilYA7Jours = new Date();
  ilYA7Jours.setDate(ilYA7Jours.getDate() - 7);
  (STATE.devis || []).filter(function(d) {
    return (d.statut === 'envoye' || d.statut === 'en_attente') && d.date_emission && new Date(d.date_emission) <= ilYA7Jours;
  }).forEach(function(d) {
    STATE.alertes.push({ type: 'warning', icon: '📝', title: 'Devis sans réponse — ' + d.ref, body: 'Envoyé le ' + d.date_emission + ' à ' + d.client + ' — pensez à relancer' });
  });

  (STATE.bonsCommande || []).filter(function(bc) {
    return bc.statut === 'envoye' && bc.date_commande && new Date(bc.date_commande) <= ilYA7Jours;
  }).forEach(function(bc) {
    STATE.alertes.push({ type: 'warning', icon: '📋', title: 'Bon de commande sans réponse — ' + bc.ref, body: 'Envoyé le ' + bc.date_commande + ' à ' + bc.fournisseur + ' — pensez à relancer' });
  });
}

function mettreAJourBadgeNotif() {
  const badge = document.getElementById('notif-badge');
  if (badge) {
    // FIX: depuis que get_mes_notifications() renvoie aussi l'historique
    // des notifications déjà lues (voir migration_phase27), le badge ne
    // doit compter que celles qui restent à traiter — sinon il afficherait
    // un chiffre qui ne baisse jamais vraiment.
    const count = (STATE.notifications || []).filter(function(n) {
      return n.raw ? !n.raw.lue : true; // notifications locales (relances, etc.) toujours comptées
    }).length;
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
  // FIX (audit) : sans le fallback entrepriseId, un membre d'équipe ne
  // voyait jamais les invitations comptable en attente de l'entreprise —
  // la requête filtrait sur son propre id.
  const uid = STATE.entrepriseId || sb.user?.id;
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

// NOUVEAU: horodatage relatif façon Facebook ("à l'instant", "il y a 5
// min", "il y a 2h", "hier", "il y a 3 jours"...) — jusqu'ici aucune
// notification n'affichait quand elle était arrivée.
function tempsRelatif(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'à l\'instant';
  if (diffMin < 60) return 'il y a ' + diffMin + ' min';
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return 'il y a ' + diffH + 'h';
  const diffJ = Math.floor(diffH / 24);
  if (diffJ === 1) return 'hier';
  if (diffJ < 7) return 'il y a ' + diffJ + 'j';
  return date.toLocaleDateString('fr-FR');
}

function htmlListeNotifications(allNotifs) {
  if (!allNotifs.length) return '';
  const typeIco = { tva_declaree:'📊', remarque_comptable:'📝', devis:'📝', facture:'🧾', invitation_comptable:'🤝', invitation_acceptee:'✅', facture_recue:'🧾', devis_recu:'📝', bc_repondu:'📋', bc_recu:'📋', demande_devis:'📥', devis_reponse:'✅', facture_reponse:'✅', avoir_recu:'↩️', bl_recu:'📦', ticket_reponse:'🎫', forfait_change:'📦', invitation_equipe:'🤝', invitation_equipe_cabinet:'🤝' };
  // NOUVEAU: séparateur visuel avant la première notification déjà lue —
  // rend l'historique explicite plutôt que de mélanger silencieusement
  // non-lues et déjà traitées dans la même liste.
  let separateurAjoute = false;
  return allNotifs.map(function(n) {
    const estLue = n.raw ? !!n.raw.lue : false;
    let separateur = '';
    if (estLue && !separateurAjoute) {
      separateurAjoute = true;
      separateur = '<div style="padding:8px 16px 4px;font-size:10px;font-weight:700;color:#9C9186;text-transform:uppercase">Historique</div>';
    }
    const typeReel = n.raw && n.raw.type;
    // isDoc : devis/facture REÇU(E) — ouvre le document avec Accepter/
    // Attente/Refuser (comportement déjà en place).
    const isDoc = typeReel === 'facture_recue' || typeReel === 'devis_recu';
    // isReponse : NOUVEAU — l'émetteur est notifié que SON devis/facture a
    // été accepté(e)/refusé(e)/mis(e) en attente. Si accepté ET que c'est
    // un devis : bouton direct pour le convertir en facture.
    const isReponse = typeReel === 'devis_reponse' || typeReel === 'facture_reponse';
    // isDemande : NOUVEAU — un client a demandé un devis. Ouvre l'écran
    // dédié qui montre le message complet (pas tronqué) + bouton "Créer
    // le devis".
    const isDemande = typeReel === 'demande_devis';
    const estCliquable = isDoc || isReponse || isDemande;
    let meta = {};
    try { meta = JSON.parse((n.raw && n.raw.meta) || '{}'); } catch(e3) {}
    return separateur + '<div class="notif-item' + (estLue ? '' : ' notif-unread') +
      (isDoc ? ' notif-doc-view' : '') + (isReponse ? ' notif-reponse-view' : '') + (isDemande ? ' notif-demande-view' : '') +
      '" ' + (estCliquable ? 'data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" data-nid="' + (n.id||'') + '" style="cursor:pointer"' : '') + '>' +
      (!estLue ? '<div style="width:9px;height:9px;border-radius:50%;background:#1F6F72;flex-shrink:0;margin-top:6px"></div>' : '<div style="width:9px;flex-shrink:0"></div>') +
      '<div class="notif-ico">' + (typeIco[typeReel] || n.icon || '🔔') + '</div>' +
      '<div class="notif-body"><div class="notif-title">' + escapeHTML(n.title||'') + '</div>' +
      '<div class="notif-msg">' + escapeHTML(n.body||'') + '</div>' +
      (n.raw && n.raw.created_at ? '<div style="font-size:10px;color:#9C9186;margin-top:2px">' + tempsRelatif(n.raw.created_at) + '</div>' : '') +
      (isDoc ? '<div style="font-size:10px;color:#9C9186;margin-top:4px">👆 Toucher pour voir le document</div><div style="display:flex;gap:6px;margin-top:8px">' +
        '<button class="btn-doc-accept" data-nid="' + (n.id||'') + '" data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="flex:1;padding:6px 2px;background:#6E8F4E;color:#fff;border:none;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">✅ Accepter</button>' +
        '<button class="btn-doc-attente" data-nid="' + (n.id||'') + '" data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="flex:1;padding:6px 2px;background:#F7EFDC;color:#B8860B;border:none;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">⏳ Attente</button>' +
        '<button class="btn-doc-refuse" data-nid="' + (n.id||'') + '" data-type="' + (meta.doc_type||'') + '" data-docid="' + (meta.doc_id||'') + '" style="flex:1;padding:6px 2px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;font-size:10px;font-weight:600;cursor:pointer;font-family:inherit">❌ Refuser</button>' +
      '</div>' : '') +
      (isReponse && meta.action === 'accepter' && meta.doc_type === 'devis' ? '<button class="btn-convertir-facture" data-docid="' + (meta.doc_id||'') + '" style="margin-top:8px;width:100%;padding:7px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">🧾 Convertir en facture</button>' : '') +
      (isDemande ? '<div style="font-size:10px;color:#9C9186;margin-top:4px">👆 Toucher pour voir la demande complète et y répondre</div>' : '') +
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

    // FIX (audit) : sans le fallback, l'invitation était rattachée à
    // l'id du membre d'équipe qui clique, pas à la vraie entreprise.
    await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + invId, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'acceptee', entreprise_id: (STATE.entrepriseId || sb.user?.id) })
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
            user_id: (STATE.entrepriseId || sb.user?.id),
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
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (sb.token || SUPABASE_KEY), 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_id: nid })
        });
      }
      // FIX/NOUVEAU: quand une FACTURE reçue via compte Zelto est
      // acceptée, elle s'enregistre automatiquement côté achats du client
      // — plus besoin de la ressaisir manuellement.
      if (btnDA && t === 'facture' && typeof enregistrerAchatDepuisFactureAcceptee === 'function') {
        await enregistrerAchatDepuisFactureAcceptee(docId);
      }
      // NOUVEAU: quand un DEVIS reçu via compte Zelto est accepté, un bon
      // de commande se génère automatiquement chez le client, adressé à
      // l'entreprise émettrice — formalise la commande sans ressaisie.
      if (btnDA && t === 'devis' && typeof enregistrerBCDepuisDevisAccepte === 'function') {
        await enregistrerBCDepuisDevisAccepte(docId);
      }
      showToast(btnDA ? '✅ Accepté' : btnDAtt ? '⏳ Mis en attente' : '❌ Refusé', 'success');
      await genNotifications();
      renderNotifScreen();
    } catch(e4) {
      showToast('Erreur: ' + e4.message, 'error');
    }
    return true;
  }

  // NOUVEAU : bouton "Convertir en facture" sur une notification de
  // réponse (devis accepté).
  const btnConv = e.target.closest('.btn-convertir-facture');
  if (btnConv) {
    const docId = parseInt(btnConv.dataset.docid);
    fermerNotifDropdown();
    if (docId && typeof convertirEnFacture === 'function') convertirEnFacture(docId);
    return true;
  }

  // NOUVEAU : toucher une notification "demande de devis" ouvre l'écran
  // dédié — message complet (pas tronqué à 100 caractères comme dans
  // l'aperçu de la notification) + bouton "Créer le devis".
  const notifDemande = e.target.closest('.notif-demande-view');
  if (notifDemande && !e.target.closest('button')) {
    fermerNotifDropdown();
    if (typeof loadDemandesDevis === 'function') loadDemandesDevis();
    goScreen('demandes-devis', null);
    return true;
  }

  // NOUVEAU : toucher une notification de réponse (hors bouton) ouvre le
  // document concerné, pour voir son détail complet.
  const notifReponse = e.target.closest('.notif-reponse-view');
  if (notifReponse && !e.target.closest('button')) {
    const t = notifReponse.dataset.type;
    const docId = notifReponse.dataset.docid;
    fermerNotifDropdown();
    if (t === 'devis' && docId) { goScreen('devis-list', null); setTimeout(function() { if (typeof openDetailDevis === 'function') openDetailDevis(parseInt(docId)); }, 150); }
    else if (t === 'facture' && docId) { goScreen('mes-factures', null); setTimeout(function() { if (typeof openDetail === 'function') openDetail(parseInt(docId)); }, 150); }
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

  if (typeof genAlertes === 'function') genAlertes();
  const alertes = STATE.alertes || [];

  if (!alertes.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">✅</div><div class="empty-title">Aucune alerte</div><div>Tout est à jour — rien qui demande votre attention pour le moment</div></div>';
    return;
  }

  // Les alertes n'ont pas de statut "lu" en base (ce ne sont pas des
  // événements ponctuels) — htmlListeNotifications gère très bien ce cas
  // (n.raw absent => jamais "lue", pas de bouton d'action), donc on la
  // réutilise telle quelle plutôt que de dupliquer le HTML.
  list.innerHTML = htmlListeNotifications(alertes);

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

// NOUVEAU: "Tout marquer comme lu" en un clic, façon Facebook — jusqu'ici
// il fallait traiter chaque notification une par une.
async function marquerToutesNotificationsLues() {
  const email = sb.user?.email;
  if (!email) return;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/marquer_toutes_notifications_lues', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (sb.token || SUPABASE_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email })
    });
    // FIX (audit workflow) : fetch() ne lève une exception qu'en cas
    // d'échec réseau, pas en cas d'erreur HTTP — sans cette vérification,
    // un échec silencieux affichait quand même "Tout marqué comme lu"
    // alors que les notifications restaient non lues en base.
    if (!r.ok) { showToast('Erreur — réessayez', 'error'); return; }
    showToast('✅ Tout marqué comme lu', 'success');
    fermerNotifDropdown();
    await genNotifications();
    if (document.getElementById('notif-list')) renderNotifScreen();
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

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
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<button onclick="marquerToutesNotificationsLues()" style="background:none;color:#1F6F72;border:none;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">Tout marquer comme lu</button>' +
        '<button onclick="fermerNotifDropdown()" style="background:#EAE4DA;color:#6B5F54;border:none;border-radius:50%;width:26px;height:26px;font-size:14px;cursor:pointer;font-family:inherit">✕</button>' +
      '</div>' +
    '</div>' +
    (allNotifs.length || invitationsCpt.length ? contenu : '<div class="empty"><div class="empty-ico">🔔</div><div class="empty-title">Aucune notification</div></div>') +
    '<div style="padding:10px 16px;border-top:1px solid #E3DCCF"><button onclick="fermerNotifDropdown();goScreen(\'notifications\',null)" style="width:100%;padding:8px;background:none;color:#9C9186;border:none;font-size:11px;cursor:pointer;font-family:inherit;text-decoration:underline">⚠️ Voir les alertes (retards, stock bas...)</button></div>';

  document.body.appendChild(panel);
  panel.addEventListener('click', function(e) { gererClicNotification(e); });
  setTimeout(function() { document.addEventListener('click', _fermerNotifDropdownSiExterieur, true); }, 50);

  // Ouvrir la cloche = tout marquer comme lu, sans exception. Le badge ne
  // doit plus jamais rester affiché une fois le panneau consulté — il ne
  // réapparaîtra que si une VRAIE nouvelle notification arrive ensuite.
  const aMarquer = allNotifs.filter(function(n) { return n.raw && n.id; });
  for (const n of aMarquer) {
    try {
      await fetch(SUPABASE_URL + '/rest/v1/rpc/marquer_notification_lue', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (sb.token || SUPABASE_KEY), 'Content-Type': 'application/json' },
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
    showToast('❌ Erreur lors de l\'ouverture des notifications', 'error');
  }
}


// Ouvre le PDF d'un devis/facture reçu directement depuis sa notification,
// avec les mêmes boutons Accepter/Attente/Refuser que le lien public.
async function voirDocumentDepuisNotification(type, docId) {
  if (!type || !docId) {
    showToast('❌ Impossible d\'ouvrir cette notification', 'error');
    return;
  }
  showToast('⏳ Chargement du document...');
  try {
    const table = type === 'devis' ? 'devis' : 'factures';
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + docId + '&select=*', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (sb.token || SUPABASE_KEY) }
    });
    const data = await r.json();
    const doc = data && data[0];
    if (!doc) { showToast('❌ Document introuvable', 'error'); return; }

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
        bAcc.onclick = function() { traiterActionDocument(docId, type, 'accepter', null, doc.token_public); };
        const bAtt = document.createElement('button');
        bAtt.textContent = '⏳ Attente';
        bAtt.style.cssText = 'flex:1;padding:12px 4px;background:#B8860B;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit';
        bAtt.onclick = function() { traiterActionDocument(docId, type, 'attente', null, doc.token_public); };
        const bRef = document.createElement('button');
        bRef.textContent = '❌ Refuser';
        bRef.style.cssText = 'flex:1;padding:12px 4px;background:#8E2E24;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit';
        bRef.onclick = function() { traiterActionDocument(docId, type, 'refuser', null, doc.token_public); };
        btnBar.appendChild(bAcc);
        btnBar.appendChild(bAtt);
        btnBar.appendChild(bRef);
        screen.appendChild(btnBar);
      }, 400);
    }
  } catch(e) {
    console.error('voirDocumentDepuisNotification: exception', e);
    showToast('❌ Erreur lors de l\'ouverture du document', 'error');
  }
}


function goScreen(name) {
  const publicScreens = ['auth', 'definir-mot-passe'];
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
    'mes-factures': _safe(typeof renderFactureList!=='undefined'?renderFactureList:undefined,'renderFactureList'),
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
    'comptable-profil': function() { if (typeof renderComptableProfil==='function') renderComptableProfil(); if (typeof chargerEquipeCabinet === 'function') chargerEquipeCabinet(); if (typeof chargerMesInvitationsCabinet === 'function') chargerMesInvitationsCabinet(); },
    'cpt-entreprise': function() {},
    'brouillons': _safe(typeof renderBrouillons!=='undefined'?renderBrouillons:undefined,'renderBrouillons'),
    'relances': _safe(typeof renderRelances!=='undefined'?renderRelances:undefined,'renderRelances'),
    'parametres': function() { if (typeof renderParametres==='function') renderParametres(); if (typeof afficherStatutDGI === 'function') afficherStatutDGI(); if (typeof afficherParametresRelance === 'function') afficherParametresRelance(); if (typeof chargerEquipe === 'function') chargerEquipe(); if (typeof chargerMesInvitationsEquipe === 'function') chargerMesInvitationsEquipe(); if (typeof appliquerLangueInterface === 'function') appliquerLangueInterface(); },
    'historique-paiements': function() {},
    'acomptes': function() {},
    'employes': function() { if (typeof loadEmployes==='function') loadEmployes(); },
    'nouvel-employe': function() {},
    'bc-recus': function() { if (typeof loadBCRecus==='function') loadBCRecus(); },
    'hub-achats': function() { if (typeof renderHubAchats==='function') renderHubAchats(); },
    'hub-ventes': function() { if (typeof renderHubVentes==='function') renderHubVentes(); },
    'demandes-devis': function() { if (typeof loadDemandesDevis==='function') loadDemandesDevis(); },
    'support': function() { if (typeof initChatbot==='function') setTimeout(initChatbot, 100); },
    'qui-sommes-nous': function() {},
    'mon-forfait': function() { if (typeof chargerMonForfait==='function') chargerMonForfait(); },
    'espace-support': function() {},
    'devis-recus': function() { if (typeof chargerDevisRecusAcceptes==='function') chargerDevisRecusAcceptes(); },
    'demande-devis-fournisseur': function() {},
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
