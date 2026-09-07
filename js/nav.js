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
  if (typeof ajouterNotificationsDepassementChantier === 'function') ajouterNotificationsDepassementChantier();
  if (typeof ajouterNotificationsContratsAExpirer === 'function') ajouterNotificationsContratsAExpirer();

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
    const count = (STATE.notifications || []).filter(function(n) {
      return n.raw ? !n.raw.lue : true;
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
        SUPABASE_URL + '/rest/v1/invitations_comptable?entreprise_email=eq.' + encodeURIComponent(emailEnt.toLowerCase()) + '&statut=eq.en_attente&order=created_at.desc',
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
  let separateurAjoute = false;
  return allNotifs.map(function(n) {
    const estLue = n.raw ? !!n.raw.lue : false;
    let separateur = '';
    if (estLue && !separateurAjoute) {
      separateurAjoute = true;
      separateur = '<div style="padding:8px 16px 4px;font-size:10px;font-weight:700;color:#9C9186;text-transform:uppercase">Historique</div>';
    }
    const typeReel = n.raw && n.raw.type;
    const isDoc = typeReel === 'facture_recue' || typeReel === 'devis_recu';
    const isReponse = typeReel === 'devis_reponse' || typeReel === 'facture_reponse';
    const isDemande = typeReel === 'demande_devis';
    const isInvitationCpt = typeReel === 'invitation_comptable';
    const estCliquable = isDoc || isReponse || isDemande || isInvitationCpt;
    let meta = {};
    try { meta = JSON.parse((n.raw && n.raw.meta) || '{}'); } catch(e3) {}
    return separateur + '<div class="notif-item' + (estLue ? '' : ' notif-unread') +
      (isDoc ? ' notif-doc-view' : '') + (isReponse ? ' notif-reponse-view' : '') + (isDemande ? ' notif-demande-view' : '') + (isInvitationCpt ? ' notif-invitation-cpt-view' : '') +
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
      (isInvitationCpt ? '<div style="font-size:10px;color:#9C9186;margin-top:4px">👆 Toucher pour accepter ou refuser</div>' : '') +
      (n._relanceFactureId ? '<button class="btn-envoyer-relance" data-facture-id="' + n._relanceFactureId + '" data-type-relance="' + n._relanceType + '" style="margin-top:8px;width:100%;padding:6px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">📤 Envoyer la relance</button>' : '') +
      (n._relanceAchatId ? '<button class="btn-vu-relance-achat" data-achat-id="' + n._relanceAchatId + '" data-type-relance="' + n._relanceAchatType + '" style="margin-top:8px;width:100%;padding:6px;background:#6B5F54;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">👍 Vu, ne plus rappeler aujourd\'hui</button>' : '') +
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
  const btnVuAchat = e.target.closest('.btn-vu-relance-achat');
  if (btnVuAchat) {
    const aid = parseInt(btnVuAchat.dataset.achatId);
    const type = btnVuAchat.dataset.typeRelance;
    if (typeof marquerRelanceAchatVue === 'function') await marquerRelanceAchatVue(aid, type);
    fermerNotifDropdown();
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
    const rRef = await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + btnR.dataset.id, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'refusee' })
    });
    if (!rRef.ok) { showToast('Erreur lors du refus', 'error'); return true; }
    showToast('Invitation refusée', 'success');
    await genNotifications();
    renderNotifScreen();
    fermerNotifDropdown();
    return true;
  }

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
      await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + docId, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody)
      });
      if (nid && !btnDAtt) {
        await fetch(SUPABASE_URL + '/rest/v1/rpc/marquer_notification_lue', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (sb.token || SUPABASE_KEY), 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_id: nid })
        });
      }
      if (btnDA && t === 'facture' && typeof enregistrerAchatDepuisFactureAcceptee === 'function') {
        await enregistrerAchatDepuisFactureAcceptee(docId);
      }
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

  const btnConv = e.target.closest('.btn-convertir-facture');
  if (btnConv) {
    const docId = parseInt(btnConv.dataset.docid);
    fermerNotifDropdown();
    if (docId && typeof convertirEnFacture === 'function') convertirEnFacture(docId);
    return true;
  }

  const notifDemande = e.target.closest('.notif-demande-view');
  if (notifDemande && !e.target.closest('button')) {
    fermerNotifDropdown();
    if (typeof loadDemandesDevis === 'function') loadDemandesDevis();
    goScreen('demandes-devis', null);
    return true;
  }

  const notifReponse = e.target.closest('.notif-reponse-view');
  if (notifReponse && !e.target.closest('button')) {
    const t = notifReponse.dataset.type;
    const docId = notifReponse.dataset.docid;
    fermerNotifDropdown();
    if (t === 'devis' && docId) { goScreen('devis-list', null); setTimeout(function() { if (typeof openDetailDevis === 'function') openDetailDevis(parseInt(docId)); }, 150); }
    else if (t === 'facture' && docId) { goScreen('mes-factures', null); setTimeout(function() { if (typeof openDetail === 'function') openDetail(parseInt(docId)); }, 150); }
    return true;
  }

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
  const notifInvCpt = e.target.closest('.notif-invitation-cpt-view');
  if (notifInvCpt && !e.target.closest('button')) {
    fermerNotifDropdown();
    goScreen('comptable', null);
    setTimeout(function() {
      if (typeof switchCptNav === 'function') switchCptNav('notifs');
    }, 400);
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

  list.innerHTML = htmlListeNotifications(alertes);

  if (list.dataset.clickBound === '1') return;
  list.dataset.clickBound = '1';
  list.addEventListener('click', function(e) { gererClicNotification(e); });
}

// ============================================================
// PANNEAU DÉROULANT FAÇON FACEBOOK (depuis la cloche du dashboard)
// ============================================================

async function marquerToutesNotificationsLues() {
  const email = sb.user?.email;
  if (!email) return;
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/marquer_toutes_notifications_lues', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + (sb.token || SUPABASE_KEY), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email })
    });
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
    const idsMarques = aMarquer.map(function(n) { return n.id; });
    STATE.notifications = STATE.notifications.filter(function(n) { return !idsMarques.includes(n.id); });
    mettreAJourBadgeNotif();
  }
  } catch(e) {
    console.error('toggleNotifDropdown: exception', e);
    showToast('❌ Erreur lors de l\'ouverture des notifications', 'error');
  }
}

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

// FIX (retour utilisateur) : chaque bouton retour avait une cible fixe
// codée en dur (souvent 'dashboard'), sans savoir d'où l'utilisateur
// venait réellement — ouvrir "Devis" ou "Factures" depuis le hub Ventes
// puis appuyer sur retour ramenait à l'accueil au lieu du hub Ventes,
// sautant un niveau de navigation. Corrigé avec une vraie pile d'écrans
// visités : goScreen() enregistre maintenant chaque écran affiché, et
// goBack() revient exactement à l'écran précédent, quel qu'il soit.
STATE._historiqueEcrans = STATE._historiqueEcrans || [];

function goScreen(name, options) {
  // FIX (bug trouvé — bouton déconnexion) : sb.logout() (config.js) vide
  // entièrement STATE avant de le réinitialiser partiellement — sans
  // jamais recréer _historiqueEcrans. Sans cette ligne, l'appel suivant
  // à goScreen('auth') plantait immédiatement sur .push() d'un tableau
  // devenu undefined, bloquant l'écran en plein milieu de la
  // déconnexion. Remise ici, à chaque appel, pour que goScreen() se
  // répare toute seule quelle que soit la raison de la disparition.
  STATE._historiqueEcrans = STATE._historiqueEcrans || [];
  const skipHistory = options === null || (options && options.skipHistory);
  const ecranActuel = document.querySelector('.screen.active')?.id?.replace('screen-', '');
  if (!skipHistory && ecranActuel && ecranActuel !== name) {
    STATE._historiqueEcrans.push(ecranActuel);
    if (STATE._historiqueEcrans.length > 30) STATE._historiqueEcrans.shift();
  }
  const publicScreens = ['auth', 'definir-mot-passe'];
  if (!publicScreens.includes(name) && !sb.token && !['portail','profil-public'].includes(name)) {
    if (name !== 'auth') { goScreen('auth'); return; }
  }
  hideToast();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const sc = el('screen-' + name);
  if (sc) { sc.classList.add('active'); sc.scrollTop = 0; }

  const _noNav = ['auth','comptable','cpt-entreprise','comptable-profil','pdf-viewer','chat'];
  const _bottomNav = document.querySelector('.bottom-nav');
  if (_bottomNav) _bottomNav.style.display = _noNav.includes(name) ? 'none' : 'flex';

  const _navMap = {'dashboard':'nav-home','nouvelle':'nav-home','detail':'nav-home',
    'devis-list':'nav-devis','nouveau-devis':'nav-devis','detail-devis':'nav-devis',
    'clients':'nav-clients','nouveau-client':'nav-clients','detail-client':'nav-clients',
    'profil':'nav-profil','stats':'nav-profil','parametres':'nav-profil','archive':'nav-profil'};
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  const _activeNav = _navMap[name];
  if (_activeNav) { const _nb = document.getElementById(_activeNav); if(_nb) _nb.classList.add('active'); }

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
    'stats': function() { if (typeof renderStats==='function') renderStats(); if (typeof renderStatsDashboard==='function') renderStatsDashboard(); if (typeof verifierRappels==='function') verifierRappels(); if (typeof renderRapportMargeChantiers==='function') renderRapportMargeChantiers(); },
    'tva': _safe(typeof renderTVA!=='undefined'?renderTVA:undefined,'renderTVA'),
    'position-financiere': _safe(typeof renderPositionFinanciere!=='undefined'?renderPositionFinanciere:undefined,'renderPositionFinanciere'),
    'rapport-stock': function() { if (typeof renderRapportStock === 'function') renderRapportStock(); },
    'dashboard-avance': function() { if (typeof renderDashboardAvance === 'function') renderDashboardAvance(); },
    'recherche': _safe(typeof initRecherche!=='undefined'?initRecherche:undefined,'initRecherche'),
    'notifications': _safe(typeof renderNotifScreen!=='undefined'?renderNotifScreen:undefined,'renderNotifScreen'),
    'audit': _safe(typeof renderJournalAudit!=='undefined'?renderJournalAudit:undefined,'renderJournalAudit'),
    'profil': function() { if (typeof renderProfil==='function') renderProfil(); setTimeout(function(){ if (typeof renderMonComptable==='function') renderMonComptable(); }, 300); if (typeof chargerMesParrainages === 'function') chargerMesParrainages(); },
    'comptable': _safe(typeof renderComptableDashboard!=='undefined'?renderComptableDashboard:undefined,'renderComptableDashboard'),
    'comptable-profil': function() { if (typeof renderComptableProfil==='function') renderComptableProfil(); if (typeof chargerEquipeCabinet === 'function') chargerEquipeCabinet(); if (typeof chargerMesInvitationsCabinet === 'function') chargerMesInvitationsCabinet(); },
    'cpt-entreprise': function() {},
    'brouillons': _safe(typeof renderBrouillons!=='undefined'?renderBrouillons:undefined,'renderBrouillons'),
    'relances': _safe(typeof renderRelances!=='undefined'?renderRelances:undefined,'renderRelances'),
    'parametres': function() { if (typeof renderParametres==='function') renderParametres(); if (typeof afficherStatutDGI === 'function') afficherStatutDGI(); if (typeof afficherParametresRelance === 'function') afficherParametresRelance(); if (typeof afficherParametresRelanceAchats === 'function') afficherParametresRelanceAchats(); if (typeof chargerEquipe === 'function') chargerEquipe(); if (typeof chargerMesInvitationsEquipe === 'function') chargerMesInvitationsEquipe(); if (typeof appliquerLangueInterface === 'function') appliquerLangueInterface(); },
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

// NOUVEAU (retour utilisateur) : revient exactement à l'écran précédent
// réellement visité, plutôt qu'à une cible fixe. ecranDeSecours sert de
// repli si l'historique est vide (lien direct, rechargement de page).
function goBack(ecranDeSecours) {
  const precedent = STATE._historiqueEcrans.pop();
  goScreen(precedent || ecranDeSecours || 'dashboard', { skipHistory: true });
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
