// ============================================================
// BANIPAY — nav.js — Navigation (goScreen, toast, notifications)
// ============================================================

function genNotifications() {
  STATE.notifications = [];
  const today_d = new Date();
  // Factures en retard
  STATE.factures.filter(f => f.statut === 'retard').forEach(f => {
    STATE.notifications.push({ type: 'danger', icon: '⚠️', title: `Facture ${f.ref} en retard`, body: `Client: ${f.client} · ${fmt(f.ttc)} MAD`, factureId: f.id });
  });
  // Devis expirés
  STATE.devis.filter(d => {
    if (d.statut !== 'envoye') return false;
    const exp = new Date(d.date_emission);
    exp.setDate(exp.getDate() + (d.validite || 30));
    return exp < today_d;
  }).forEach(d => {
    STATE.notifications.push({ type: 'warning', icon: '📝', title: `Devis ${d.ref} expiré`, body: `Client: ${d.client}`, devisId: d.id });
  });
  // Update badge
  const badge = el('notif-badge');
  if (badge) {
    badge.textContent = STATE.notifications.length;
    badge.style.display = STATE.notifications.length > 0 ? 'flex' : 'none';
  }
}


// ===== DASHBOARD.JS =====
// ============================================================
// BANIPAY — Dashboard
// ============================================================

function badgeF(s) { return {attente:'En attente',retard:'Retard',payee:'Payée',envoyee:'Envoyée'}[s]||s; }

function badgeDV(s) { return {envoye:'Envoyé',accepte:'Accepté',refuse:'Refusé',converti:'→Facture',expire:'Expiré'}[s]||s; }

function renderNotifScreen() {
  const list = el('notif-list');
  if (!list) return;
  if (!STATE.notifications.length) {
    list.innerHTML = `<div class="empty"><div class="empty-ico">🔔</div><div class="empty-title">Aucune notification</div></div>`;
    return;
  }
  const colors = { danger:'#FEF2F2', warning:'#FFFBEB', success:'#ECFDF5', info:'#EFF6FF' };
  const borders = { danger:'#EF4444', warning:'#D97706', success:'#059669', info:'#2563EB' };
  list.innerHTML = STATE.notifications.map((n,i) => `
    <div style="background:${colors[n.type]||'#F8FAFC'};border-radius:12px;padding:14px 16px;margin-bottom:8px;display:flex;gap:12px;border-left:3px solid ${borders[n.type]||'#2563EB'};cursor:pointer"
      onclick="${n.factureId ? `goScreen('detail');openDetail(${n.factureId})` : n.devisId ? `goScreen('detail-devis');openDetailDevis(${n.devisId})` : ''}">
      <div style="font-size:22px;flex-shrink:0">${n.icon}</div>
      <div>
        <div style="font-size:13px;font-weight:600;color:#0F172A">${n.title}</div>
        <div style="font-size:12px;color:#64748B;margin-top:2px">${n.body}</div>
      </div>
    </div>`).join('');
}

// ============================================================
// INIT APP
// ============================================================




// ============================================================
// BANIPAY — Système Comptable
// ============================================================

// STATE comptable
const CPT = {
  role: null,          // 'entreprise' | 'comptable'
  entreprises: [],     // liste des entreprises accessibles
  currentEntId: null,  // entreprise en cours de visualisation
  currentFactures: [],
  currentProfil: {},
  filterF: 'toutes',
};

// ============================================================
// ROLE SELECTION (inscription)
// ============================================================

function goScreen(name) {
  // Auth guard — protected screens require valid session
  const publicScreens = ['auth'];
  if (!publicScreens.includes(name) && !sb.token && !['portail','profil-public'].includes(name)) {
    if (name !== 'auth') { goScreen('auth'); return; }
  }
  hideToast();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const sc = el('screen-' + name);
  if (sc) { sc.classList.add('active'); sc.scrollTop = 0; }

  const actions = {
    'dashboard': renderDashboard,
    'nouvelle': initNouvelle,
    'devis-list': renderDevisList,
    'nouveau-devis': initNouveauDevis,
    'avoir': initAvoir,
    'bon-commande': initBonCommande,
    'bon-livraison': initBonLivraison,
    'clients': renderClients,
    'nouveau-client': initNouveauClient,
    'produits': renderProduits,
    'nouveau-produit': initNouveauProduit,
    'stats': renderStats,
    'tva': renderTVA,
    'recherche': initRecherche,
    'notifications': renderNotifScreen,
    'profil': renderProfil,
    'comptable': renderComptableDashboard,
    'comptable-profil': renderComptableProfil,
    'brouillons': renderBrouillons,
    'relances': renderRelances,
    'parametres': renderParametres,
  };
  if (actions[name]) actions[name]();
}

