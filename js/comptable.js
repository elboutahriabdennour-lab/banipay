// BANIPAY — comptable.js — Espace Comptable Professionnel

// Seuils pour calcul état
const SEUIL_ACTION = 0.3;  // < 30% contrôlé = action requise
const SEUIL_EN_COURS = 0.95; // < 95% = en cours

// ============================================================
// CHARGEMENT ESPACE COMPTABLE
// ============================================================

async function loadComptableApp() {
  const uid = sb.user?.id;
  const email = sb.user?.email;
  if (!uid || !email) return;

  try {
    // Charger invitations acceptées
    const invitations = await fetch(
      SUPABASE_URL + '/rest/v1/invitations_comptable?comptable_email=eq.' + encodeURIComponent(email) + '&statut=eq.acceptee&select=*',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    ).then(function(r) { return r.json(); });

    CPT.entreprises = invitations || [];

    if (CPT.entreprises.length > 0) {
      const ids = CPT.entreprises.map(function(i) { return i.entreprise_id; });

      // Charger profils + factures en parallèle
      const [profils, toutesFactures, tousControles] = await Promise.all([
        fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=in.(' + ids.join(',') + ')&select=*',
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }).then(function(r) { return r.json(); }),
        fetch(SUPABASE_URL + '/rest/v1/factures?user_id=in.(' + ids.join(',') + ')&select=*&order=created_at.desc',
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }).then(function(r) { return r.json(); }),
        fetch(SUPABASE_URL + '/rest/v1/controles_factures?entreprise_id=in.(' + ids.join(',') + ')&select=*',
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }).then(function(r) { return r.json(); }),
      ]);

      CPT.entreprises.forEach(function(inv) {
        inv.profil = (profils || []).find(function(p) { return p.id === inv.entreprise_id; }) || {};
        inv._factures = (toutesFactures || []).filter(function(f) { return f.user_id === inv.entreprise_id; });
        inv._controles = (tousControles || []).filter(function(c) { return c.entreprise_id === inv.entreprise_id; });
        inv._etat = calculerEtat(inv);
      });
    }

    CPT.allFactures = [];
    CPT.allControles = [];
    CPT.entreprises.forEach(function(inv) {
      CPT.allFactures = CPT.allFactures.concat(inv._factures || []);
      CPT.allControles = CPT.allControles.concat(inv._controles || []);
    });

    renderComptableDashboard();
  } catch(e) {
    console.error('loadComptableApp:', e);
    showToast('Erreur chargement', 'error');
  }
}

// ============================================================
// CALCUL ÉTAT ENTREPRISE
// ============================================================

function calculerEtat(inv) {
  const factures = inv._factures || [];
  const controles = inv._controles || [];
  if (!factures.length) return 'vert';

  const total = factures.length;
  const lettres = controles.filter(function(c) { return c.lettre; }).length;
  const tvaVerif = controles.filter(function(c) { return c.tva_verifie; }).length;
  const consultes = controles.filter(function(c) { return c.consulte; }).length;

  const txLettrage = total > 0 ? lettres / total : 1;
  const txTVA = total > 0 ? tvaVerif / total : 1;
  const txConsulte = total > 0 ? consultes / total : 1;
  const txGlobal = (txLettrage + txTVA + txConsulte) / 3;

  if (txGlobal >= SEUIL_EN_COURS) return 'vert';
  if (txGlobal >= SEUIL_ACTION) return 'orange';
  return 'rouge';
}

function etatLabel(etat) {
  if (etat === 'vert') return '🟢 À jour';
  if (etat === 'orange') return '🟠 En cours';
  return '🔴 Action requise';
}

function etatColor(etat) {
  if (etat === 'vert') return '#059669';
  if (etat === 'orange') return '#D97706';
  return '#EF4444';
}

// ============================================================
// DASHBOARD COMPTABLE
// ============================================================

function renderComptableDashboard() {
  const email = sb.user?.email || '';
  const nom = sb.user?.user_metadata?.nom || email.split('@')[0] || 'Comptable';
  const cabinet = sb.user?.user_metadata?.cabinet || '';

  const av = el('comptable-avatar');
  if (av) av.textContent = nom.split(' ').slice(0, 2).map(function(w) { return w[0] || ''; }).join('').toUpperCase() || 'C';
  setEl('cpt-nom-display', nom + (cabinet ? ' · ' + cabinet : ''));
  setEl('cpt-email-display', email);

  // KPIs globaux
  const totalEnt = CPT.entreprises.length;
  const totalFac = CPT.allFactures.length;
  const nonLettres = totalFac - CPT.allControles.filter(function(c) { return c.lettre; }).length;
  const tvaAVerif = totalFac - CPT.allControles.filter(function(c) { return c.tva_verifie; }).length;
  const entAction = CPT.entreprises.filter(function(e) { return e._etat === 'rouge'; }).length;
  const docsAControler = totalFac - CPT.allControles.filter(function(c) { return c.consulte; }).length;

  const kpiEl = el('cpt-kpis-grid');
  if (kpiEl) {
    kpiEl.innerHTML = [
      { val: totalEnt, label: 'Entreprises', color: '#4338CA', bg: '#EEF2FF', filter: 'entreprises' },
      { val: docsAControler, label: 'À contrôler', color: '#2563EB', bg: '#EFF6FF', filter: 'docs' },
      { val: nonLettres, label: 'Non lettrées', color: '#D97706', bg: '#FFFBEB', filter: 'lettrage' },
      { val: tvaAVerif, label: 'TVA à vérifier', color: '#9333EA', bg: '#F3E8FF', filter: 'tva' },
      { val: entAction, label: 'Action requise', color: '#EF4444', bg: '#FEF2F2', filter: 'action' },
    ].map(function(k) {
      return '<div onclick="filtrerParKPI(\'' + k.filter + '\')" style="background:' + k.bg + ';border-radius:14px;padding:14px;text-align:center;cursor:pointer;border:1px solid ' + k.color + '20">' +
        '<div style="font-size:24px;font-weight:900;color:' + k.color + '">' + k.val + '</div>' +
        '<div style="font-size:10px;color:' + k.color + ';font-weight:600;margin-top:2px">' + k.label + '</div>' +
      '</div>';
    }).join('');
  }

  // Liste entreprises
  renderListeEntreprises();
}

function renderListeEntreprises(filtre) {
  const list = el('cpt-entreprises-list');
  if (!list) return;

  let ents = CPT.entreprises;
  if (filtre === 'action') ents = ents.filter(function(e) { return e._etat === 'rouge'; });
  if (filtre === 'orange') ents = ents.filter(function(e) { return e._etat === 'orange'; });

  if (!ents.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🏢</div><div class="empty-title">Aucune entreprise</div><div>Invitez vos clients à vous donner accès</div></div>';
    return;
  }

  list.innerHTML = ents.map(function(inv) {
    const p = inv.profil || {};
    const f = inv._factures || [];
    const c = inv._controles || [];
    const total = f.length;
    const lettres = c.filter(function(x) { return x.lettre; }).length;
    const tvaOk = c.filter(function(x) { return x.tva_verifie; }).length;
    const txL = total > 0 ? Math.round(lettres / total * 100) : 100;
    const txT = total > 0 ? Math.round(tvaOk / total * 100) : 100;
    const etat = inv._etat || 'vert';
    const initiales = (p.raison || '?').split(' ').slice(0, 2).map(function(w) { return w[0] || ''; }).join('').toUpperCase() || '?';

    return '<div onclick="ouvrirEntreprise(\'' + inv.entreprise_id + '\')" style="background:#fff;border-radius:16px;padding:16px;margin-bottom:10px;border:1px solid #E2E8F0;cursor:pointer">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">' +
        '<div style="width:44px;height:44px;border-radius:12px;background:#EEF2FF;color:#4338CA;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + initiales + '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;font-weight:700;color:#0F172A">' + escapeHTML(p.raison || 'Entreprise') + '</div>' +
          '<div style="font-size:11px;color:#64748B">' + (p.secteur || '') + (p.ville ? ' · ' + p.ville : '') + '</div>' +
        '</div>' +
        '<div style="font-size:12px;font-weight:700;color:' + etatColor(etat) + '">' + etatLabel(etat) + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
        '<div style="text-align:center;background:#F8FAFC;border-radius:8px;padding:6px">' +
          '<div style="font-size:11px;font-weight:700;color:#0F172A">' + total + '</div>' +
          '<div style="font-size:9px;color:#94A3B8">Documents</div>' +
        '</div>' +
        '<div style="text-align:center;background:#FFFBEB;border-radius:8px;padding:6px">' +
          '<div style="font-size:11px;font-weight:700;color:#D97706">' + txL + '%</div>' +
          '<div style="font-size:9px;color:#94A3B8">Lettrage</div>' +
        '</div>' +
        '<div style="text-align:center;background:#F3E8FF;border-radius:8px;padding:6px">' +
          '<div style="font-size:11px;font-weight:700;color:#9333EA">' + txT + '%</div>' +
          '<div style="font-size:9px;color:#94A3B8">TVA</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function filtrerParKPI(filtre) {
  if (filtre === 'entreprises' || filtre === 'action') {
    renderListeEntreprises(filtre === 'action' ? 'action' : null);
    el('cpt-entreprises-list')?.scrollIntoView({ behavior: 'smooth' });
  }
}

// ============================================================
// FICHE ENTREPRISE
// ============================================================

async function ouvrirEntreprise(entrepriseId) {
  CPT.currentEntrepriseId = entrepriseId;
  const inv = CPT.entreprises.find(function(e) { return e.entreprise_id === entrepriseId; });
  if (!inv) return;

  CPT.currentProfil = inv.profil || {};
  CPT.currentFactures = inv._factures || [];
  CPT.currentDevis = [];
  CPT.currentControles = inv._controles || {};

  // Load devis
  try {
    const devis = await fetch(
      SUPABASE_URL + '/rest/v1/devis?user_id=eq.' + entrepriseId + '&order=created_at.desc&select=*',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    ).then(function(r) { return r.json(); });
    CPT.currentDevis = devis || [];
  } catch(e) {}

  renderFicheEntreprise();
  goScreen('cpt-entreprise');
}

function renderFicheEntreprise() {
  const p = CPT.currentProfil || {};
  const f = CPT.currentFactures || [];
  const c = CPT.currentControles || [];
  const inv = CPT.entreprises.find(function(e) { return e.entreprise_id === CPT.currentEntrepriseId; });
  const etat = inv ? inv._etat : 'vert';

  setEl('cpt-ent-nom', p.raison || 'Entreprise');
  setEl('cpt-ent-sub', (p.secteur || '') + (p.ville ? ' · ' + p.ville : ''));

  const total = f.length;
  const lettres = c.filter(function(x) { return x.lettre; }).length;
  const nonLettres = total - lettres;
  const tvaOk = c.filter(function(x) { return x.tva_verifie; }).length;
  const tvaKo = total - tvaOk;
  const txL = total > 0 ? Math.round(lettres / total * 100) : 100;
  const txT = total > 0 ? Math.round(tvaOk / total * 100) : 100;
  const txG = Math.round((txL + txT) / 2);

  const kpis = el('cpt-ent-kpis');
  if (kpis) kpis.innerHTML =
    '<div style="padding:16px">' +
      '<div style="background:' + etatColor(etat) + '20;border-radius:12px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">' +
        '<span style="font-size:13px;font-weight:700;color:' + etatColor(etat) + '">' + etatLabel(etat) + '</span>' +
        '<span style="font-size:11px;color:#64748B">Contrôle global: ' + txG + '%</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">' +
        '<div style="background:#EFF6FF;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:20px;font-weight:800;color:#2563EB">' + total + '</div>' +
          '<div style="font-size:10px;color:#2563EB">Factures</div>' +
        '</div>' +
        '<div style="background:#FFFBEB;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:20px;font-weight:800;color:#D97706">' + nonLettres + '</div>' +
          '<div style="font-size:10px;color:#D97706">Non lettrées</div>' +
        '</div>' +
        '<div style="background:#F3E8FF;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:20px;font-weight:800;color:#9333EA">' + tvaKo + '</div>' +
          '<div style="font-size:10px;color:#9333EA">TVA à vérifier</div>' +
        '</div>' +
      '</div>' +
      // Barres de progression
      '<div style="margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748B;margin-bottom:4px"><span>Lettrage</span><span style="font-weight:700">' + txL + '%</span></div>' +
        '<div style="height:8px;background:#F1F5F9;border-radius:4px"><div style="height:100%;background:#D97706;border-radius:4px;width:' + txL + '%"></div></div>' +
      '</div>' +
      '<div style="margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748B;margin-bottom:4px"><span>Vérification TVA</span><span style="font-weight:700">' + txT + '%</span></div>' +
        '<div style="height:8px;background:#F1F5F9;border-radius:4px"><div style="height:100%;background:#9333EA;border-radius:4px;width:' + txT + '%"></div></div>' +
      '</div>' +
      '<div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748B;margin-bottom:4px"><span>Contrôle global</span><span style="font-weight:700">' + txG + '%</span></div>' +
        '<div style="height:8px;background:#F1F5F9;border-radius:4px"><div style="height:100%;background:#4338CA;border-radius:4px;width:' + txG + '%"></div></div>' +
      '</div>' +
    '</div>';

  cptEntTab('factures');
}

// ============================================================
// ONGLETS ENTREPRISE
// ============================================================

function cptEntTab(tab) {
  CPT.currentTab = tab;
  ['factures', 'devis', 'avoirs', 'infos'].forEach(function(t) {
    const btn = el('cpt-tab-' + t);
    if (btn) {
      btn.style.background = t === tab ? '#4338CA' : '#F1F5F9';
      btn.style.color = t === tab ? '#fff' : '#64748B';
    }
  });
  if (tab === 'factures') renderCptFactures();
  else if (tab === 'devis') renderCptDevis();
  else if (tab === 'avoirs') renderCptTVA();
  else if (tab === 'infos') renderCptInfos();
}

// Filtres actifs
CPT.filtres = { lettrage: null, tva: null, statut: null };

function appliquerFiltreCpt(type, val) {
  CPT.filtres[type] = CPT.filtres[type] === val ? null : val;
  renderCptFactures();
}

function renderCptFactures() {
  const list = el('cpt-ent-content');
  if (!list) return;
  let f = CPT.currentFactures || [];

  // Appliquer filtres
  if (CPT.filtres.lettrage === false) {
    const lettres = (CPT.currentControles || []).filter(function(c) { return c.lettre; }).map(function(c) { return c.facture_id; });
    f = f.filter(function(fac) { return !lettres.includes(fac.id); });
  }
  if (CPT.filtres.tva === false) {
    const tvaOk = (CPT.currentControles || []).filter(function(c) { return c.tva_verifie; }).map(function(c) { return c.facture_id; });
    f = f.filter(function(fac) { return !tvaOk.includes(fac.id); });
  }

  const statutBg = { payee: '#ECFDF5', attente: '#FFFBEB', retard: '#FEF2F2', brouillon: '#F1F5F9', envoyee: '#EFF6FF', annulee: '#F1F5F9' };
  const statutColor = { payee: '#059669', attente: '#D97706', retard: '#EF4444', brouillon: '#94A3B8', envoyee: '#2563EB', annulee: '#94A3B8' };
  const statutLabel = { payee: 'Payée', attente: 'En attente', retard: 'En retard', brouillon: 'Brouillon', envoyee: 'Envoyée', annulee: 'Annulée' };

  list.innerHTML =
    // Filtres rapides
    '<div style="padding:12px 16px;display:flex;gap:8px;overflow-x:auto;border-bottom:1px solid #F1F5F9">' +
      '<button onclick="appliquerFiltreCpt(\'lettrage\',false)" style="padding:6px 12px;border:none;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;background:' + (CPT.filtres.lettrage === false ? '#FFFBEB' : '#F1F5F9') + ';color:' + (CPT.filtres.lettrage === false ? '#D97706' : '#64748B') + '">☐ Non lettrées</button>' +
      '<button onclick="appliquerFiltreCpt(\'tva\',false)" style="padding:6px 12px;border:none;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;background:' + (CPT.filtres.tva === false ? '#F3E8FF' : '#F1F5F9') + ';color:' + (CPT.filtres.tva === false ? '#9333EA' : '#64748B') + '">☐ TVA non vérifiée</button>' +
      '<button onclick="CPT.filtres={lettrage:null,tva:null,statut:null};renderCptFactures()" style="padding:6px 12px;border:none;border-radius:20px;font-size:11px;cursor:pointer;font-family:inherit;background:#F1F5F9;color:#64748B">Tous</button>' +
    '</div>' +
    (f.length ? f.map(function(fac) {
      const ctrl = (CPT.currentControles || []).find(function(c) { return c.facture_id === fac.id; }) || {};
      return '<div style="padding:14px 16px;border-bottom:1px solid #F8FAFC;cursor:pointer" onclick="ouvrirFactureComptable(\'' + fac.id + '\')">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<span style="font-size:13px;font-weight:700">' + escapeHTML(fac.ref || '') + '</span>' +
          '<span style="font-size:13px;font-weight:700">' + fmt(fac.ttc || 0) + ' MAD</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<span style="font-size:11px;color:#64748B">' + escapeHTML(fac.client || '') + ' · ' + (fac.date_emission || '') + '</span>' +
          '<span style="background:' + (statutBg[fac.statut] || '#F1F5F9') + ';color:' + (statutColor[fac.statut] || '#64748B') + ';font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px">' + (statutLabel[fac.statut] || fac.statut || '') + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<span style="font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600;background:' + (ctrl.lettre ? '#ECFDF5' : '#FEF2F2') + ';color:' + (ctrl.lettre ? '#059669' : '#EF4444') + '">' + (ctrl.lettre ? '☑ Lettré' : '☐ Non lettré') + '</span>' +
          '<span style="font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600;background:' + (ctrl.tva_verifie ? '#F3E8FF' : '#FEF2F2') + ';color:' + (ctrl.tva_verifie ? '#9333EA' : '#EF4444') + '">' + (ctrl.tva_verifie ? '☑ TVA OK' : '☐ TVA') + '</span>' +
          (ctrl.consulte ? '<span style="font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600;background:#ECFDF5;color:#059669">☑ Consulté</span>' : '') +
        '</div>' +
      '</div>';
    }).join('') : '<div class="empty"><div class="empty-ico">🧾</div><div class="empty-title">Aucune facture</div></div>');
}

// ============================================================
// DÉTAIL FACTURE — VUE COMPTABLE
// ============================================================

async function ouvrirFactureComptable(factureId) {
  const fac = (CPT.currentFactures || []).find(function(f) { return f.id === factureId; });
  if (!fac) return;

  CPT.currentFactureId = factureId;

  // Charger contrôle existant
  let ctrl = (CPT.currentControles || []).find(function(c) { return c.facture_id === factureId; }) || {};

  // Charger remarques
  let remarques = [];
  try {
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/remarques_comptable?facture_id=eq.' + factureId + '&order=created_at.desc',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    remarques = await r.json() || [];
  } catch(e) {}

  // Marquer comme consulté
  if (!ctrl.consulte) {
    await sauvegarderControle(factureId, { consulte: true, consulte_at: new Date().toISOString() });
    ctrl.consulte = true;
  }

  const lignes = typeof fac.lignes === 'string' ? JSON.parse(fac.lignes || '[]') : (fac.lignes || []);

  const overlay = document.createElement('div');
  overlay.id = 'fac-comptable-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#F8FAFC;overflow-y:auto;font-family:inherit';

  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';

  overlay.innerHTML =
    // Header
    '<div style="background:linear-gradient(135deg,#1E1B4B,#4338CA);padding:14px 20px;position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:12px">' +
      '<button onclick="document.getElementById(\'fac-comptable-overlay\').remove()" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">←</button>' +
      '<div><div style="font-size:14px;font-weight:700;color:#fff">' + escapeHTML(fac.ref || '') + '</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.5)">' + escapeHTML(fac.client || '') + '</div></div>' +
      '<button onclick="ouvrirPDFComptable(\'' + factureId + '\')" style="margin-left:auto;background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">📄 PDF</button>' +
    '</div>' +

    // Infos facture
    '<div style="margin:16px;background:#fff;border-radius:16px;padding:16px;border:1px solid #E2E8F0">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
        '<div><div style="font-size:11px;color:#94A3B8">Date</div><div style="font-size:13px;font-weight:600">' + (fac.date_emission || '—') + '</div></div>' +
        '<div style="text-align:right"><div style="font-size:11px;color:#94A3B8">Montant TTC</div><div style="font-size:16px;font-weight:800;color:#0F172A">' + fmt(fac.ttc || 0) + ' MAD</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<div style="flex:1"><div style="font-size:11px;color:#94A3B8">HT</div><div style="font-size:12px;font-weight:600">' + fmt(fac.ht || 0) + ' MAD</div></div>' +
        '<div style="flex:1"><div style="font-size:11px;color:#94A3B8">TVA</div><div style="font-size:12px;font-weight:600;color:#9333EA">' + fmt(fac.tva || 0) + ' MAD</div></div>' +
        '<div style="flex:1"><div style="font-size:11px;color:#94A3B8">Mode paiement</div><div style="font-size:12px;font-weight:600">' + (fac.paiement || '—') + '</div></div>' +
      '</div>' +
    '</div>' +

    // Checklist comptable
    '<div style="margin:0 16px 16px;background:#fff;border-radius:16px;padding:16px;border:1px solid #E2E8F0">' +
      '<div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:14px">✅ Checklist comptable</div>' +

      // Consulté
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F1F5F9">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:600">Document consulté</div>' +
          (ctrl.consulte_at ? '<div style="font-size:10px;color:#94A3B8">Le ' + new Date(ctrl.consulte_at).toLocaleDateString('fr-FR') + ' à ' + new Date(ctrl.consulte_at).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}) + '</div>' : '') +
        '</div>' +
        '<div style="width:24px;height:24px;border-radius:6px;background:' + (ctrl.consulte ? '#059669' : '#F1F5F9') + ';display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px">' + (ctrl.consulte ? '✓' : '') + '</div>' +
      '</div>' +

      // Lettrage
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F1F5F9" id="ctrl-lettrage-row">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:600">Lettrage effectué</div>' +
          (ctrl.lettre && ctrl.lettre_at ? '<div style="font-size:10px;color:#94A3B8">Le ' + new Date(ctrl.lettre_at).toLocaleDateString('fr-FR') + ' par ' + (ctrl.lettre_par || nom) + '</div>' : '') +
        '</div>' +
        '<button id="btn-lettrage" onclick="toggleLettrage(\'' + factureId + '\')" style="width:32px;height:32px;border-radius:8px;border:2px solid ' + (ctrl.lettre ? '#D97706' : '#E2E8F0') + ';background:' + (ctrl.lettre ? '#FFFBEB' : '#fff') + ';font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">' + (ctrl.lettre ? '☑' : '☐') + '</button>' +
      '</div>' +

      // TVA
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:600">TVA vérifiée</div>' +
          (ctrl.tva_verifie && ctrl.tva_verifie_at ? '<div style="font-size:10px;color:#94A3B8">Le ' + new Date(ctrl.tva_verifie_at).toLocaleDateString('fr-FR') + ' par ' + (ctrl.tva_verifie_par || nom) + '</div>' : '') +
        '</div>' +
        '<button id="btn-tva" onclick="toggleTVA(\'' + factureId + '\')" style="width:32px;height:32px;border-radius:8px;border:2px solid ' + (ctrl.tva_verifie ? '#9333EA' : '#E2E8F0') + ';background:' + (ctrl.tva_verifie ? '#F3E8FF' : '#fff') + ';font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">' + (ctrl.tva_verifie ? '☑' : '☐') + '</button>' +
      '</div>' +
    '</div>' +

    // Remarques
    '<div style="margin:0 16px 16px;background:#fff;border-radius:16px;padding:16px;border:1px solid #E2E8F0">' +
      '<div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:12px">📝 Remarques comptables</div>' +
      '<div id="remarques-list">' +
        (remarques.length ? remarques.map(function(r) {
          return '<div style="background:' + (r.statut === 'resolue' ? '#ECFDF5' : '#FFFBEB') + ';border-radius:10px;padding:12px;margin-bottom:8px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
              '<div style="font-size:11px;font-weight:600;color:' + (r.statut === 'resolue' ? '#059669' : '#D97706') + '">' + (r.comptable_nom || r.comptable_email || '') + '</div>' +
              '<div style="display:flex;gap:6px;align-items:center">' +
                '<div style="font-size:10px;color:#94A3B8">' + new Date(r.created_at).toLocaleDateString('fr-FR') + '</div>' +
                (r.statut !== 'resolue' ? '<button onclick="resoudreRemarque(\'' + r.id + '\')" style="font-size:10px;background:#059669;color:#fff;border:none;border-radius:6px;padding:3px 8px;cursor:pointer;font-family:inherit">Résoudre</button>' : '<span style="font-size:10px;color:#059669;font-weight:600">✓ Résolue</span>') +
              '</div>' +
            '</div>' +
            '<div style="font-size:12px;color:#0F172A">' + escapeHTML(r.contenu) + '</div>' +
          '</div>';
        }).join('') : '<div style="text-align:center;color:#94A3B8;font-size:12px;padding:10px">Aucune remarque</div>') +
      '</div>' +
      '<textarea id="nouvelle-remarque" style="width:100%;padding:10px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:13px;font-family:inherit;resize:none;margin-top:10px;outline:none;box-sizing:border-box" rows="2" placeholder="Ajouter une remarque..."></textarea>' +
      '<button onclick="ajouterRemarque(\'' + factureId + '\')" style="width:100%;margin-top:8px;padding:10px;background:#4338CA;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Ajouter la remarque</button>' +
    '</div>' +

    '<div style="height:40px"></div>';

  document.body.appendChild(overlay);
}

// ============================================================
// CONTRÔLES (lettrage, TVA)
// ============================================================

async function sauvegarderControle(factureId, data) {
  const uid = sb.user?.id;
  const email = sb.user?.email;
  if (!uid) return;

  try {
    // Upsert contrôle
    const payload = Object.assign({
      facture_id: factureId,
      entreprise_id: CPT.currentEntrepriseId,
      comptable_id: uid,
      comptable_email: email,
    }, data);

    await fetch(SUPABASE_URL + '/rest/v1/controles_factures', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(payload)
    });

    // Update local state
    if (!CPT.currentControles) CPT.currentControles = [];
    let local = CPT.currentControles.find(function(c) { return c.facture_id === factureId; });
    if (local) { Object.assign(local, data); }
    else { CPT.currentControles.push(Object.assign({ facture_id: factureId }, data)); }

    // Update in entreprise
    const inv = CPT.entreprises.find(function(e) { return e.entreprise_id === CPT.currentEntrepriseId; });
    if (inv) {
      let lc = (inv._controles || []).find(function(c) { return c.facture_id === factureId; });
      if (lc) { Object.assign(lc, data); }
      else { if (!inv._controles) inv._controles = []; inv._controles.push(Object.assign({ facture_id: factureId }, data)); }
      inv._etat = calculerEtat(inv);
    }
  } catch(e) {
    showToast('Erreur sauvegarde', 'error');
  }
}

async function toggleLettrage(factureId) {
  const ctrl = (CPT.currentControles || []).find(function(c) { return c.facture_id === factureId; }) || {};
  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';

  if (ctrl.lettre) {
    if (!confirm('Voulez-vous retirer le lettrage de cette facture ?')) return;
    await sauvegarderControle(factureId, { lettre: false, lettre_at: null, lettre_par: null });
    const btn = el('btn-lettrage');
    if (btn) { btn.textContent = '☐'; btn.style.borderColor = '#E2E8F0'; btn.style.background = '#fff'; }
    showToast('Lettrage retiré', 'success');
  } else {
    const now = new Date().toISOString();
    await sauvegarderControle(factureId, { lettre: true, lettre_at: now, lettre_par: nom });
    const btn = el('btn-lettrage');
    if (btn) { btn.textContent = '☑'; btn.style.borderColor = '#D97706'; btn.style.background = '#FFFBEB'; }
    showToast('☑ Lettrage enregistré', 'success');
  }
}

async function toggleTVA(factureId) {
  const ctrl = (CPT.currentControles || []).find(function(c) { return c.facture_id === factureId; }) || {};
  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';

  if (ctrl.tva_verifie) {
    await sauvegarderControle(factureId, { tva_verifie: false, tva_verifie_at: null, tva_verifie_par: null });
    const btn = el('btn-tva');
    if (btn) { btn.textContent = '☐'; btn.style.borderColor = '#E2E8F0'; btn.style.background = '#fff'; }
    showToast('TVA non vérifiée', 'success');
  } else {
    const now = new Date().toISOString();
    await sauvegarderControle(factureId, { tva_verifie: true, tva_verifie_at: now, tva_verifie_par: nom });
    const btn = el('btn-tva');
    if (btn) { btn.textContent = '☑'; btn.style.borderColor = '#9333EA'; btn.style.background = '#F3E8FF'; }
    showToast('☑ TVA vérifiée', 'success');
  }
}

// ============================================================
// REMARQUES
// ============================================================

async function ajouterRemarque(factureId) {
  const contenu = (el('nouvelle-remarque')?.value || '').trim();
  if (!contenu) { showToast('Écrivez une remarque', 'error'); return; }

  const uid = sb.user?.id;
  const email = sb.user?.email;
  const nom = sb.user?.user_metadata?.nom || email?.split('@')[0] || 'Comptable';

  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/remarques_comptable', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        facture_id: factureId,
        entreprise_id: CPT.currentEntrepriseId,
        comptable_id: uid,
        comptable_email: email,
        comptable_nom: nom,
        contenu: contenu,
        statut: 'ouverte'
      })
    });

    if (r.ok) {
      // Notifier l'entreprise
      const fac = (CPT.currentFactures || []).find(function(f) { return f.id === factureId; });
      await fetch(SUPABASE_URL + '/rest/v1/notifications_app', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + sb.token,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id: CPT.currentEntrepriseId,
          type: 'remarque_comptable',
          titre: 'Remarque comptable',
          corps: 'Votre comptable a ajouté une remarque sur la facture ' + (fac?.ref || ''),
          facture_id: factureId,
          lue: false
        })
      });

      if (el('nouvelle-remarque')) el('nouvelle-remarque').value = '';
      showToast('✅ Remarque ajoutée', 'success');

      // Reload overlay
      document.getElementById('fac-comptable-overlay')?.remove();
      await ouvrirFactureComptable(factureId);
    }
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

async function resoudreRemarque(remarqueId) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/remarques_comptable?id=eq.' + remarqueId, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ statut: 'resolue' })
    });
    showToast('✅ Remarque résolue', 'success');
    const factureId = CPT.currentFactureId;
    document.getElementById('fac-comptable-overlay')?.remove();
    await ouvrirFactureComptable(factureId);
  } catch(e) {
    showToast('Erreur', 'error');
  }
}

// ============================================================
// PDF COMPTABLE
// ============================================================

function ouvrirPDFComptable(factureId) {
  const fac = (CPT.currentFactures || []).find(function(f) { return f.id === factureId; });
  if (!fac) return;
  const lignes = typeof fac.lignes === 'string' ? JSON.parse(fac.lignes || '[]') : (fac.lignes || []);
  genDocPDF({
    type: 'FACTURE', ref: fac.ref, color: '#2563EB',
    emetteur: CPT.currentProfil || {},
    destinataire: { nom: fac.client, chantier: fac.chantier },
    date: fac.date_emission, echeance: fac.echeance,
    paiement: fac.paiement, statut: fac.statut,
    lignes: lignes, note: fac.note || '',
    ht: fac.ht, tva: fac.tva, ttc: fac.ttc,
    devise: fac.devise || 'MAD',
    montant_recu: fac.montant_recu || 0,
    showStamp: fac.statut === 'payee',
    doc_id: factureId,
    doc_url: window.location.origin + window.location.pathname + '?doc=' + factureId,
  });
}

// ============================================================
// ONGLETS DEVIS / TVA / INFOS
// ============================================================

function renderCptDevis() {
  const list = el('cpt-ent-content');
  if (!list) return;
  const d = CPT.currentDevis || [];
  if (!d.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">📝</div><div class="empty-title">Aucun devis</div></div>';
    return;
  }
  const statutColor = { envoye: '#D97706', accepte: '#059669', refuse: '#EF4444', brouillon: '#94A3B8' };
  const statutLabel = { envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', brouillon: 'Brouillon' };
  list.innerHTML = d.map(function(dv) {
    return '<div style="padding:14px 16px;border-bottom:1px solid #F8FAFC">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
        '<span style="font-size:13px;font-weight:700">' + escapeHTML(dv.ref || '') + '</span>' +
        '<span style="font-size:13px;font-weight:700">' + fmt(dv.ttc || 0) + ' MAD</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between">' +
        '<span style="font-size:11px;color:#64748B">' + escapeHTML(dv.client || '') + ' · ' + (dv.date_emission || '') + '</span>' +
        '<span style="font-size:10px;font-weight:600;color:' + (statutColor[dv.statut] || '#64748B') + '">' + (statutLabel[dv.statut] || dv.statut || '') + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderCptTVA() {
  const list = el('cpt-ent-content');
  if (!list) return;
  const f = CPT.currentFactures || [];
  const byMonth = {};
  f.filter(function(x) { return x.statut === 'payee'; }).forEach(function(fac) {
    const key = (fac.date_emission || '').substring(0, 7);
    if (!key) return;
    if (!byMonth[key]) byMonth[key] = { ht: 0, tva: 0, ttc: 0, count: 0 };
    byMonth[key].ht += Number(fac.ht) || 0;
    byMonth[key].tva += Number(fac.tva) || 0;
    byMonth[key].ttc += Number(fac.ttc) || 0;
    byMonth[key].count++;
  });
  const totalTVA = Object.values(byMonth).reduce(function(s, m) { return s + m.tva; }, 0);
  list.innerHTML = '<div style="padding:16px">' +
    '<div style="background:#F3E8FF;border-radius:12px;padding:14px;margin-bottom:16px;display:flex;justify-content:space-between">' +
      '<div style="font-size:12px;font-weight:600;color:#9333EA">TVA totale collectée</div>' +
      '<div style="font-size:18px;font-weight:800;color:#9333EA">' + fmt(totalTVA) + ' MAD</div>' +
    '</div>' +
    Object.keys(byMonth).sort().reverse().map(function(m) {
      const d = byMonth[m];
      return '<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #F1F5F9">' +
        '<div><div style="font-size:12px;font-weight:600">' + m + '</div><div style="font-size:10px;color:#94A3B8">' + d.count + ' facture(s)</div></div>' +
        '<div style="text-align:right"><div style="font-size:11px;color:#64748B">HT: ' + fmt(d.ht) + '</div><div style="font-size:13px;font-weight:700;color:#9333EA">TVA: ' + fmt(d.tva) + ' MAD</div></div>' +
      '</div>';
    }).join('') +
    '<button onclick="exportCptTVA()" style="width:100%;margin-top:16px;padding:12px;background:#9333EA;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📥 Exporter TVA CSV</button>' +
  '</div>';
}

function renderCptInfos() {
  const list = el('cpt-ent-content');
  if (!list) return;
  const p = CPT.currentProfil || {};
  const fields = [
    ['Secteur', p.secteur], ['Forme juridique', p.forme], ['RC', p.rc],
    ['Identifiant fiscal', p.identifiant_fiscal], ['ICE', p.ice],
    ['Patente', p.patente], ['CNSS', p.cnss],
    ['Adresse', p.adresse ? p.adresse + (p.ville ? ', ' + p.ville : '') : null],
    ['Tél', p.tel], ['Email', p.email],
    ['Banque', p.banque], ['RIB', p.rib],
  ].filter(function(x) { return x[1]; });

  list.innerHTML = '<div style="padding:16px">' +
    '<div style="background:#fff;border-radius:16px;border:1px solid #E2E8F0;padding:16px">' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:14px">' + escapeHTML(p.raison || '—') + '</div>' +
      fields.map(function(x) {
        return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F8FAFC;font-size:12px">' +
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
  const payees = f.filter(function(x) { return x.statut === 'payee'; });
  if (!payees.length) { showToast('Aucune facture payée', 'error'); return; }
  const headers = ['Mois', 'Référence', 'Client', 'HT', 'TVA', 'TTC'];
  const rows = payees.map(function(fac) {
    return [(fac.date_emission || '').substring(0, 7), fac.ref || '', fac.client || '',
      (Number(fac.ht) || 0).toFixed(2), (Number(fac.tva) || 0).toFixed(2), (Number(fac.ttc) || 0).toFixed(2)];
  });
  const csv = [headers].concat(rows).map(function(r) {
    return r.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tva_' + (p.raison || 'entreprise').replace(/\s+/g, '_') + '_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
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
  if (confirm('Se déconnecter ?')) { sb.logout(); goScreen('auth'); }
}

// Fonctions legacy
function renderDashboardComptable() { renderComptableDashboard(); }
function cptFilterF() {}
function genTokenInvitation() {}
function getLienInvitation() {}
function ouvrirInvitation() {}
function copierLienInvitation() {}
function partagerInvitationWhatsApp() {}
async function traiterInvitation() {}
async function refuserInvitation() {}
function renderClientPortal() {}
function acceptClientQuote() {}
function refuseClientQuote() {}
