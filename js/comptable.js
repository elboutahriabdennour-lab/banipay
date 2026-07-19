// BANIPAY — comptable.js — Espace Comptable

// ============================================================
// CHARGEMENT ESPACE COMPTABLE
// ============================================================

async function loadComptableApp() {
  const uid = sb.user?.id;
  const email = sb.user?.email;
  if (!uid || !email) return;

  try {
    // Charger les invitations acceptées pour cet email de comptable
    const invitations = await fetch(
      SUPABASE_URL + '/rest/v1/invitations_comptable?comptable_email=eq.' + encodeURIComponent(email) + '&statut=eq.acceptee&select=*',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    ).then(r => r.json());

    CPT.entreprises = invitations || [];

    // Pour chaque invitation, charger le profil de l'entreprise
    if (CPT.entreprises.length > 0) {
      const entrepriseIds = CPT.entreprises.map(function(i) { return i.entreprise_id; });
      const profils = await fetch(
        SUPABASE_URL + '/rest/v1/profils_entreprise?id=in.(' + entrepriseIds.join(',') + ')&select=*',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
      ).then(r => r.json());

      CPT.entreprises.forEach(function(inv) {
        inv.profil = (profils||[]).find(function(p) { return p.id === inv.entreprise_id; }) || {};
      });

      // Load factures for stats
      await Promise.all(CPT.entreprises.map(async function(inv) {
        try {
          const facs = await fetch(
            SUPABASE_URL + '/rest/v1/factures?user_id=eq.' + inv.entreprise_id + '&select=ttc,tva,statut',
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
          ).then(function(r) { return r.json(); });
          inv._factures = facs || [];
        } catch(e) { inv._factures = []; }
      }));
    }

    renderComptableDashboard();
  } catch(e) {
    console.error('loadComptableApp:', e);
    showToast('Erreur chargement espace comptable', 'error');
  }
}

// ============================================================
// DASHBOARD COMPTABLE
// ============================================================

function renderComptableDashboard() {
  const email = sb.user?.email || '';
  const nom = sb.user?.user_metadata?.nom || email.split('@')[0] || 'Comptable';
  const cabinet = sb.user?.user_metadata?.cabinet || '';

  // Header
  const av = el('comptable-avatar');
  if (av) av.textContent = nom.split(' ').slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase() || 'C';
  setEl('cpt-nom-display', nom + (cabinet ? ' · ' + cabinet : ''));
  setEl('cpt-email-display', email);

  // Stats globales
  const totalFac = CPT.entreprises.reduce(function(s, inv) { return s + (inv._factures||[]).length; }, 0);
  const totalTVA = CPT.entreprises.reduce(function(s, inv) {
    return s + (inv._factures||[]).filter(function(f){return f.statut==='payee';}).reduce(function(s2,f){return s2+(Number(f.tva)||0);}, 0);
  }, 0);

  setEl('cpt-nb-ent', CPT.entreprises.length);
  setEl('cpt-nb-fac', totalFac);
  setEl('cpt-tva-total', Math.round(totalTVA).toLocaleString('fr-FR'));
  setEl('cpt-nb-entreprises', CPT.entreprises.length + ' entreprise(s)');
  setEl('cpt-sub', 'Connecté en tant que comptable');

  // Render liste entreprises
  const list = el('cpt-entreprises-list');
  if (!list) return;

  if (!CPT.entreprises.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🏢</div><div class="empty-title">Aucune entreprise</div><div>Attendez qu\'une entreprise vous invite</div></div>';
    return;
  }

  list.innerHTML = CPT.entreprises.map(function(inv) {
    const p = inv.profil || {};
    const initiales = (p.raison||'?').split(' ').slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase() || '?';
    const facs = inv._factures || [];
    const caTotal = facs.reduce(function(s,f){return s+(Number(f.ttc)||0);},0);
    const div = document.createElement('div');
    div.style.cssText = 'background:#fff;border-radius:16px;padding:16px;margin-bottom:10px;border:1px solid #E2E8F0;cursor:pointer;display:flex;align-items:center;gap:12px';
    div.dataset.eid = inv.entreprise_id;
    div.onclick = function() { ouvrirEntreprise(this.dataset.eid); };
    div.innerHTML =
      '<div style="width:44px;height:44px;border-radius:12px;background:#EEF2FF;color:#4338CA;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + initiales + '</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;font-weight:700;color:#0F172A">' + escapeHTML(p.raison||'Entreprise') + '</div>' +
        '<div style="font-size:11px;color:#64748B;margin-top:2px">' + (p.secteur||'') + (p.ville?' · '+p.ville:'') + '</div>' +
        '<div style="font-size:11px;color:#059669;font-weight:600;margin-top:2px">' + facs.length + ' factures · ' + Math.round(caTotal).toLocaleString('fr-FR') + ' MAD</div>' +
      '</div>' +
      '<div style="color:#4338CA;font-size:18px">›</div>' +
    '</div>';
    return div.outerHTML;
  }).join('');
}

// ============================================================
// VUE ENTREPRISE
// ============================================================

async function ouvrirEntreprise(entrepriseId) {
  CPT.currentEntrepriseId = entrepriseId;

  try {
    // Charger données entreprise
    const [factures, devis, profil] = await Promise.all([
      fetch(SUPABASE_URL + '/rest/v1/factures?user_id=eq.' + entrepriseId + '&order=created_at.desc&select=*',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }).then(r => r.json()),
      fetch(SUPABASE_URL + '/rest/v1/devis?user_id=eq.' + entrepriseId + '&order=created_at.desc&select=*',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }).then(r => r.json()),
      fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + entrepriseId + '&select=*',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }).then(r => r.json()),
    ]);

    CPT.currentFactures = factures || [];
    CPT.currentDevis = devis || [];
    CPT.currentProfil = (profil && profil[0]) || {};

    renderCptEntreprise();
    goScreen('cpt-entreprise');
  } catch(e) {
    showToast('Erreur chargement données', 'error');
  }
}

function renderCptEntreprise() {
  const p = CPT.currentProfil || {};
  const f = CPT.currentFactures || [];
  const d = CPT.currentDevis || [];

  setEl('cpt-ent-nom', p.raison || 'Entreprise');
  setEl('cpt-ent-sub', (p.secteur||'') + (p.ville?' · '+p.ville:''));

  // KPIs
  const caTotal = f.reduce(function(s,x){return s+(Number(x.ttc)||0);}, 0);
  const caEncaisse = f.filter(function(x){return x.statut==='payee';}).reduce(function(s,x){return s+(Number(x.ttc)||0);}, 0);
  const caAttente = f.filter(function(x){return ['attente','envoyee'].includes(x.statut);}).reduce(function(s,x){return s+(Number(x.ttc)||0);}, 0);
  const caRetard = f.filter(function(x){return x.statut==='retard';}).reduce(function(s,x){return s+(Number(x.ttc)||0);}, 0);

  const kpis = el('cpt-ent-kpis');
  if (kpis) kpis.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px 20px">' +
      '<div style="background:#EFF6FF;border-radius:12px;padding:14px;text-align:center">' +
        '<div style="font-size:10px;color:#2563EB;font-weight:700;text-transform:uppercase">CA Total</div>' +
        '<div style="font-size:18px;font-weight:800;color:#0F172A;margin-top:4px">' + fmt(caTotal) + '</div>' +
        '<div style="font-size:10px;color:#64748B">MAD TTC</div>' +
      '</div>' +
      '<div style="background:#ECFDF5;border-radius:12px;padding:14px;text-align:center">' +
        '<div style="font-size:10px;color:#059669;font-weight:700;text-transform:uppercase">Encaissé</div>' +
        '<div style="font-size:18px;font-weight:800;color:#059669;margin-top:4px">' + fmt(caEncaisse) + '</div>' +
        '<div style="font-size:10px;color:#64748B">' + (caTotal>0?Math.round(caEncaisse/caTotal*100):0) + '%</div>' +
      '</div>' +
      '<div style="background:#FFFBEB;border-radius:12px;padding:14px;text-align:center">' +
        '<div style="font-size:10px;color:#D97706;font-weight:700;text-transform:uppercase">En attente</div>' +
        '<div style="font-size:18px;font-weight:800;color:#D97706;margin-top:4px">' + fmt(caAttente) + '</div>' +
        '<div style="font-size:10px;color:#64748B">MAD</div>' +
      '</div>' +
      '<div style="background:#FEF2F2;border-radius:12px;padding:14px;text-align:center">' +
        '<div style="font-size:10px;color:#EF4444;font-weight:700;text-transform:uppercase">En retard</div>' +
        '<div style="font-size:18px;font-weight:800;color:#EF4444;margin-top:4px">' + fmt(caRetard) + '</div>' +
        '<div style="font-size:10px;color:#64748B">MAD</div>' +
      '</div>' +
    '</div>';

  // Default tab: factures
  cptEntTab('factures');
}

function cptEntTab(tab) {
  CPT.currentTab = tab;
  const tabs = ['factures','devis','tva','infos'];
  tabs.forEach(function(t) {
    const btn = el('cpt-tab-' + t);
    if (btn) {
      btn.style.background = t === tab ? '#4338CA' : '#F1F5F9';
      btn.style.color = t === tab ? '#fff' : '#64748B';
    }
  });

  if (tab === 'factures') renderCptFactures();
  else if (tab === 'devis') renderCptDevis();
  else if (tab === 'tva') renderCptTVA();
  else if (tab === 'infos') renderCptInfos();
}

function renderCptFactures() {
  const list = el('cpt-ent-content');
  if (!list) return;
  const f = CPT.currentFactures || [];
  if (!f.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🧾</div><div class="empty-title">Aucune facture</div></div>';
    return;
  }
  const statutBg = {payee:'#ECFDF5', attente:'#FFFBEB', retard:'#FEF2F2', brouillon:'#F1F5F9'};
  const statutColor = {payee:'#059669', attente:'#D97706', retard:'#EF4444', brouillon:'#94A3B8'};
  const statutLabel = {payee:'Payée', attente:'En attente', retard:'En retard', brouillon:'Brouillon', envoyee:'Envoyée', annulee:'Annulée'};
  list.innerHTML = f.map(function(fac) {
    return '<div class="card" style="margin:0 20px 10px">' +
      '<div style="flex:1">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div style="font-size:13px;font-weight:700">' + escapeHTML(fac.ref||'') + '</div>' +
          '<div style="font-size:13px;font-weight:700;color:#0F172A">' + fmt(fac.ttc||0) + ' MAD</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">' +
          '<div style="font-size:12px;color:#64748B">' + escapeHTML(fac.client||'') + '</div>' +
          '<div style="background:' + (statutBg[fac.statut]||'#F1F5F9') + ';color:' + (statutColor[fac.statut]||'#64748B') + ';font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px">' + (statutLabel[fac.statut]||fac.statut||'') + '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:#94A3B8;margin-top:2px">' + (fac.date_emission||'') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderCptDevis() {
  const list = el('cpt-ent-content');
  if (!list) return;
  const d = CPT.currentDevis || [];
  if (!d.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">📝</div><div class="empty-title">Aucun devis</div></div>';
    return;
  }
  list.innerHTML = d.map(function(dv) {
    return '<div class="card" style="margin:0 20px 10px">' +
      '<div style="flex:1">' +
        '<div style="display:flex;justify-content:space-between">' +
          '<div style="font-size:13px;font-weight:700">' + escapeHTML(dv.ref||'') + '</div>' +
          '<div style="font-size:13px;font-weight:700">' + fmt(dv.ttc||0) + ' MAD</div>' +
        '</div>' +
        '<div style="font-size:12px;color:#64748B;margin-top:2px">' + escapeHTML(dv.client||'') + ' · ' + (dv.statut||'') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderCptTVA() {
  const list = el('cpt-ent-content');
  if (!list) return;
  const f = CPT.currentFactures || [];

  // Group by month
  const byMonth = {};
  f.filter(function(x){return x.statut==='payee';}).forEach(function(fac) {
    const key = (fac.date_emission||'').substring(0,7);
    if (!key) return;
    if (!byMonth[key]) byMonth[key] = {ht:0, tva:0, ttc:0};
    byMonth[key].ht += Number(fac.ht)||0;
    byMonth[key].tva += Number(fac.tva)||0;
    byMonth[key].ttc += Number(fac.ttc)||0;
  });

  const rows = Object.keys(byMonth).sort().reverse().map(function(m) {
    const d = byMonth[m];
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #F1F5F9">' +
      '<div style="font-size:12px;font-weight:600">' + m + '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:11px;color:#64748B">HT: ' + fmt(d.ht) + ' MAD</div>' +
        '<div style="font-size:12px;font-weight:700;color:#D97706">TVA: ' + fmt(d.tva) + ' MAD</div>' +
      '</div>' +
    '</div>';
  }).join('');

  const totalTVA = Object.values(byMonth).reduce(function(s,m){return s+m.tva;}, 0);

  list.innerHTML = '<div style="padding:16px 20px">' +
    '<div style="background:#FFFBEB;border-radius:12px;padding:14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">' +
      '<div style="font-size:12px;font-weight:600;color:#D97706">TVA totale collectée</div>' +
      '<div style="font-size:18px;font-weight:800;color:#D97706">' + fmt(totalTVA) + ' MAD</div>' +
    '</div>' +
    (rows || '<div style="text-align:center;color:#94A3B8;padding:20px">Aucune facture payée</div>') +
    '<button onclick="exportCptTVA()" style="width:100%;margin-top:16px;padding:12px;background:#D97706;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📥 Exporter TVA CSV</button>' +
  '</div>';
}

function renderCptInfos() {
  const list = el('cpt-ent-content');
  if (!list) return;
  const p = CPT.currentProfil || {};
  list.innerHTML = '<div style="padding:16px 20px">' +
    '<div style="background:#fff;border-radius:12px;border:1px solid #F1F5F9;padding:16px">' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:12px">' + escapeHTML(p.raison||'—') + '</div>' +
      [
        ['Secteur', p.secteur],['Forme juridique', p.forme],['RC', p.rc],
        ['Identifiant fiscal', p.identifiant_fiscal],['ICE', p.ice],
        ['Patente', p.patente],['CNSS', p.cnss],
        ['Adresse', p.adresse ? p.adresse + (p.ville?', '+p.ville:'') : null],
        ['Tél', p.tel],['Email', p.email],
        ['Banque', p.banque],['RIB', p.rib],
      ].filter(function(x){return x[1];}).map(function(x) {
        return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:12px">' +
          '<span style="color:#64748B">' + x[0] + '</span>' +
          '<span style="font-weight:600">' + escapeHTML(String(x[1])) + '</span>' +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';
}

function exportCptTVA() {
  const f = CPT.currentFactures || [];
  const p = CPT.currentProfil || {};
  const payees = f.filter(function(x){return x.statut==='payee';});
  if (!payees.length) { showToast('Aucune facture payée', 'error'); return; }

  const headers = ['Mois','Référence','Client','HT','TVA','TTC'];
  const rows = payees.map(function(fac) {
    return [
      (fac.date_emission||'').substring(0,7),
      fac.ref||'', fac.client||'',
      (Number(fac.ht)||0).toFixed(2),
      (Number(fac.tva)||0).toFixed(2),
      (Number(fac.ttc)||0).toFixed(2)
    ];
  });

  const csv = [headers].concat(rows).map(function(r) {
    return r.map(function(v) { return '"' + String(v).replace(/"/g,'""') + '"'; }).join(',');
  }).join('\n');

  const blob = new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tva_' + (p.raison||'entreprise').replace(/\s+/g,'_') + '_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);}, 3000);
  showToast('\u2705 Export TVA téléchargé !', 'success');
}

// ============================================================
// PROFIL COMPTABLE
// ============================================================

function renderComptableProfil() {
  const email = sb.user?.email || '';
  const meta = sb.user?.user_metadata || {};
  setEl('cpt-profil-email', email);
  setEl('cpt-profil-nom', meta.nom || email.split('@')[0]);
  setEl('cpt-profil-cabinet', meta.cabinet || '');
}

function quitterComptable() {
  if (confirm('Se déconnecter ?')) {
    sb.logout();
    goScreen('auth');
  }
}

// Fonctions legacy (compatibilité)
function renderDashboardComptable() { renderComptableDashboard(); }
function cptFilterF(f) {}
function genTokenInvitation() {}
function getLienInvitation() {}
function ouvrirInvitation() {}
function copierLienInvitation() {}
function partagerInvitationWhatsApp() {}
async function traiterInvitation(token) {}
async function refuserInvitation() {}
function renderClientPortal() {}
function acceptClientQuote() {}
function refuseClientQuote() {}
