// BANIPAY — nav.js

async function genNotifications() {
  STATE.notifications = [];
  const email = sb.user?.email;
  const uid = sb.user?.id;

  // Factures en retard
  (STATE.factures || []).filter(f => f.statut === 'retard').forEach(f => {
    STATE.notifications.push({ type: 'danger', icon: '⚠️', title: 'Facture ' + f.ref + ' en retard', body: 'Client: ' + f.client });
  });

  // Devis acceptés non lus
  (STATE.devis || []).filter(d => d.statut === 'accepte' && !d.notif_lue).forEach(d => {
    STATE.notifications.push({ type: 'success', icon: '✅', title: 'Devis ' + d.ref + ' accepté', body: 'Client: ' + d.client });
  });

  // Invitations comptable en attente (depuis notifications_app par email destinataire)
  if (email) {
    try {
      const resp = await fetch(
        SUPABASE_URL + '/rest/v1/notifications_app?destinataire_email=eq.' + encodeURIComponent(email.toLowerCase()) + '&lue=eq.false&order=created_at.desc&limit=10',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
      );
      const notifs = await resp.json() || [];
      notifs.forEach(function(n) {
        STATE.notifications.push({ type: 'info', icon: n.type === 'invitation_comptable' ? '🤝' : '🔔', title: n.titre || '', body: n.corps || '', id: n.id });
      });
    } catch(e2) {}
  }

  // Badge cloche mis à jour avec le nombre réel de notifications non lues
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

  // Load invitations from comptables (en_attente)
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
    html += '<div style="padding:10px 20px 4px;font-size:11px;font-weight:700;color:#4338CA;text-transform:uppercase">Invitations en attente</div>';
    html += invitationsCpt.map(function(inv) {
      return '<div style="margin:8px 20px;background:#EEF2FF;border-radius:14px;padding:16px;border:1px solid #C7D2FE">' +
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">' +
          '<div style="font-size:24px">📊</div>' +
          '<div>' +
            '<div style="font-size:13px;font-weight:700">' + escapeHTML(inv.comptable_email||'') + '</div>' +
            '<div style="font-size:11px;color:#4338CA">Souhaite accéder à vos documents</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn-accept-cpt-inv" data-id="' + inv.id + '" style="flex:1;padding:10px;background:#059669;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">✅ Accepter</button>' +
          '<button class="btn-refuse-cpt-inv" data-id="' + inv.id + '" style="flex:1;padding:10px;background:#FEF2F2;color:#EF4444;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">❌ Refuser</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  if (allNotifs.length) {
    const typeIco = { tva_declaree:'📊', remarque_comptable:'📝', devis:'📝', facture:'🧾', invitation_comptable:'🤝', invitation_acceptee:'✅' };
    html += allNotifs.map(function(n) {
      return '<div class="notif-item' + (n.lue ? '' : ' notif-unread') + '">' +
        '<div class="notif-ico">' + (typeIco[n.type] || '🔔') + '</div>' +
        '<div class="notif-body"><div class="notif-title">' + escapeHTML(n.titre||'') + '</div>' +
        '<div class="notif-msg">' + escapeHTML(n.corps||'') + '</div></div>' +
      '</div>';
    }).join('');
  }

  list.innerHTML = html;

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
    }
  }, { once: true });
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
    'nouvelle-achat': function() { calcAchatTotaux(); },
    'avoir-list': renderAvoirList,
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
