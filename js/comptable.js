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

function creerFiltreCpt() {
  const div = document.createElement('div');
  div.style.cssText = 'padding:10px 16px;display:flex;gap:8px;overflow-x:auto;border-bottom:1px solid #F1F5F9;background:#fff';
  const btns = [
    { label: '☐ Non lettrées', key: 'lettrage', val: false, bg: '#FFFBEB', color: '#D97706' },
    { label: '☐ TVA non vérifiée', key: 'tva', val: false, bg: '#F3E8FF', color: '#9333EA' },
    { label: '📝 Avec remarque', key: 'remarque', val: true, bg: '#FEF2F2', color: '#EF4444' },
  ];
  btns.forEach(function(b) {
    const btn = document.createElement('button');
    const active = (b.val === false ? CPT.filtres[b.key] === false : CPT.filtres[b.key]);
    btn.textContent = b.label;
    btn.style.cssText = 'padding:5px 10px;border:none;border-radius:16px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;background:' + (active ? b.bg : '#F1F5F9') + ';color:' + (active ? b.color : '#64748B');
    btn.onclick = function() { appliquerFiltreCpt(b.key, b.val); };
    div.appendChild(btn);
  });
  const btnAll = document.createElement('button');
  btnAll.textContent = 'Tous';
  btnAll.style.cssText = 'padding:5px 10px;border:none;border-radius:16px;font-size:11px;cursor:pointer;font-family:inherit;background:#F1F5F9;color:#64748B';
  btnAll.onclick = function() { CPT.filtres = {lettrage:null,tva:null,statut:null,remarque:null}; renderCptFactures(); };
  div.appendChild(btnAll);
  return div.outerHTML;
}

function renderCptFactures() {
  const list = el('cpt-ent-content');
  if (!list) return;
  let f = CPT.currentFactures || [];

  if (CPT.filtres.lettrage === false) {
    const lettres = (CPT.currentControles || []).filter(function(c) { return c.lettre; }).map(function(c) { return c.facture_id; });
    f = f.filter(function(fac) { return !lettres.includes(String(fac.id)); });
  }
  if (CPT.filtres.tva === false) {
    const tvaOk = (CPT.currentControles || []).filter(function(c) { return c.tva_verifie; }).map(function(c) { return c.facture_id; });
    f = f.filter(function(fac) { return !tvaOk.includes(String(fac.id)); });
  }
  if (CPT.filtres.remarque) {
    const avecRemarque = (CPT.currentRemarques || []).filter(function(r) { return r.statut === 'ouverte'; }).map(function(r) { return r.facture_id; });
    f = f.filter(function(fac) { return avecRemarque.includes(String(fac.id)); });
  }

  const statutBg = { payee:'#ECFDF5', attente:'#FFFBEB', retard:'#FEF2F2', brouillon:'#F1F5F9', envoyee:'#EFF6FF', annulee:'#F1F5F9' };
  const statutColor = { payee:'#059669', attente:'#D97706', retard:'#EF4444', brouillon:'#94A3B8', envoyee:'#2563EB', annulee:'#94A3B8' };
  const statutLabel = { payee:'Payée', attente:'En attente', retard:'En retard', brouillon:'Brouillon', envoyee:'Envoyée', annulee:'Annulée' };

  list.innerHTML =
    creerFiltreCpt() +
    // En-tête colonnes
    '<div style="display:grid;grid-template-columns:1fr 44px 44px;padding:8px 16px;background:#F8FAFC;border-bottom:1px solid #F1F5F9">' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#94A3B8">Facture</div>' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#D97706;text-align:center">Lett.</div>' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9333EA;text-align:center">TVA</div>' +
    '</div>' +
    (f.length ? f.map(function(fac) {
      const ctrl = (CPT.currentControles || []).find(function(c) { return String(c.facture_id) === String(fac.id); }) || {};
      const remarques = (CPT.currentRemarques || []).filter(function(r) { return String(r.facture_id) === String(fac.id) && r.statut === 'ouverte'; });
      return '<div style="display:grid;grid-template-columns:1fr 44px 44px;padding:12px 16px;border-bottom:1px solid #F8FAFC;align-items:center">' +
        // Facture info (cliquable pour ouvrir détail)
        '<div class="fac-row-click" data-fid="' + fac.id + '" style="cursor:pointer">' +
          '<div style="font-size:12px;font-weight:700">' + escapeHTML(fac.ref || '') + '</div>' +
          '<div style="font-size:11px;color:#64748B">' + escapeHTML(fac.client || '') + ' · ' + fmt(fac.ttc || 0) + ' MAD</div>' +
          '<div style="display:flex;gap:6px;margin-top:3px;align-items:center">' +
            '<span style="background:' + (statutBg[fac.statut] || '#F1F5F9') + ';color:' + (statutColor[fac.statut] || '#64748B') + ';font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px">' + (statutLabel[fac.statut] || '') + '</span>' +
            (remarques.length ? '<span style="font-size:9px;color:#EF4444;font-weight:600">📝 ' + remarques.length + ' remarque(s)</span>' : '') +
          '</div>' +
        '</div>' +
        // Checkbox lettrage (contrôle rapide inline)
        '<div style="display:flex;justify-content:center">' +
          '<button class="btn-lettr" data-facid="' + fac.id + '" data-lettre="' + (ctrl.lettre ? '1' : '0') + '" style="width:30px;height:30px;border-radius:8px;border:2px solid ' + (ctrl.lettre ? '#D97706' : '#E2E8F0') + ';background:' + (ctrl.lettre ? '#FFFBEB' : '#fff') + ';font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit">' + (ctrl.lettre ? '☑' : '☐') + '</button>' +
        '</div>' +
        // Checkbox TVA (contrôle rapide inline)
        '<div style="display:flex;justify-content:center">' +
          '<button class="btn-tva" data-facid="' + fac.id + '" data-tva="' + (ctrl.tva_verifie ? '1' : '0') + '" style="width:30px;height:30px;border-radius:8px;border:2px solid ' + (ctrl.tva_verifie ? '#9333EA' : '#E2E8F0') + ';background:' + (ctrl.tva_verifie ? '#F3E8FF' : '#fff') + ';font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit">' + (ctrl.tva_verifie ? '☑' : '☐') + '</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<div class="empty"><div class="empty-ico">🧾</div><div class="empty-title">Aucune facture</div></div>');

  // Event delegation for inline controls
  list.addEventListener('click', function(e) {
    const row = e.target.closest('.fac-row-click');
    if (row) { ouvrirFactureComptable(row.dataset.fid); return; }
    const btnL = e.target.closest('.btn-lettr');
    if (btnL) { toggleLettrageRapide(btnL.dataset.facid, btnL); return; }
    const btnT = e.target.closest('.btn-tva');
    if (btnT) { toggleTVARapide(btnT.dataset.facid, btnT); return; }
  }, { once: true });
}

// Contrôle rapide inline depuis la liste
async function toggleLettrageRapide(factureId, btn) {
  const isLettree = btn.dataset.lettre === '1';
  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';
  if (isLettree) {
    if (!confirm('Retirer le lettrage ?')) return;
    await sauvegarderControle(factureId, { lettre: false, lettre_at: null, lettre_par: null });
    btn.dataset.lettre = '0';
    btn.textContent = '☐'; btn.style.borderColor = '#E2E8F0'; btn.style.background = '#fff';
  } else {
    await sauvegarderControle(factureId, { lettre: true, lettre_at: new Date().toISOString(), lettre_par: nom });
    btn.dataset.lettre = '1';
    btn.textContent = '☑'; btn.style.borderColor = '#D97706'; btn.style.background = '#FFFBEB';
  }
  ajouterHistorique(isLettree ? 'Lettrage retiré — ' : 'Lettrage effectué — ', factureId);
  showToast('Lettrage mis à jour', 'success');
  // Refresh état entreprise
  const inv = CPT.entreprises.find(function(e) { return e.entreprise_id === CPT.currentEntrepriseId; });
  if (inv) { inv._etat = calculerEtat(inv); }
}

async function toggleTVARapide(factureId, btn) {
  const isTVA = btn.dataset.tva === '1';
  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';
  if (isTVA) {
    await sauvegarderControle(factureId, { tva_verifie: false, tva_verifie_at: null, tva_verifie_par: null });
    btn.dataset.tva = '0';
    btn.textContent = '☐'; btn.style.borderColor = '#E2E8F0'; btn.style.background = '#fff';
  } else {
    await sauvegarderControle(factureId, { tva_verifie: true, tva_verifie_at: new Date().toISOString(), tva_verifie_par: nom });
    btn.dataset.tva = '1';
    btn.textContent = '☑'; btn.style.borderColor = '#9333EA'; btn.style.background = '#F3E8FF';
  }
  ajouterHistorique(isTVA ? 'TVA non vérifiée — ' : 'TVA vérifiée — ', factureId);
  showToast('TVA mise à jour', 'success');
}


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

// ============================================================
// VUE "À TRAITER" — GLOBALE
// ============================================================

async function renderVueATraiter() {
  const list = el('cpt-ent-content');
  if (!list) return;

  // Collecter tous les éléments à traiter de toutes les entreprises
  const items = [];

  CPT.entreprises.forEach(function(inv) {
    const p = inv.profil || {};
    const facs = inv._factures || [];
    const ctrls = inv._controles || [];
    const rems = inv._remarques || [];

    // Factures non lettrées
    const lettresIds = ctrls.filter(function(c) { return c.lettre; }).map(function(c) { return String(c.facture_id); });
    const nonLettrees = facs.filter(function(f) { return !lettresIds.includes(String(f.id)); });
    if (nonLettrees.length) {
      items.push({ entreprise: p.raison || 'Entreprise', type: 'lettrage', count: nonLettrees.length, eid: inv.entreprise_id, label: nonLettrees.length + ' facture(s) non lettrée(s)', color: '#D97706', bg: '#FFFBEB' });
    }

    // TVA non vérifiée
    const tvaIds = ctrls.filter(function(c) { return c.tva_verifie; }).map(function(c) { return String(c.facture_id); });
    const tvaKo = facs.filter(function(f) { return !tvaIds.includes(String(f.id)); });
    if (tvaKo.length) {
      items.push({ entreprise: p.raison || 'Entreprise', type: 'tva', count: tvaKo.length, eid: inv.entreprise_id, label: tvaKo.length + ' TVA non vérifiée(s)', color: '#9333EA', bg: '#F3E8FF' });
    }

    // Remarques ouvertes
    const remsOuvertes = rems.filter(function(r) { return r.statut === 'ouverte'; });
    if (remsOuvertes.length) {
      items.push({ entreprise: p.raison || 'Entreprise', type: 'remarque', count: remsOuvertes.length, eid: inv.entreprise_id, label: remsOuvertes.length + ' remarque(s) ouverte(s)', color: '#EF4444', bg: '#FEF2F2' });
    }
  });

  // KPIs globaux à traiter
  const totalLettrage = items.filter(function(i) { return i.type === 'lettrage'; }).reduce(function(s, i) { return s + i.count; }, 0);
  const totalTVA = items.filter(function(i) { return i.type === 'tva'; }).reduce(function(s, i) { return s + i.count; }, 0);
  const totalRem = items.filter(function(i) { return i.type === 'remarque'; }).reduce(function(s, i) { return s + i.count; }, 0);

  list.innerHTML =
    '<div style="padding:16px">' +
      '<div style="font-size:14px;font-weight:700;color:#0F172A;margin-bottom:12px">📥 À traiter</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">' +
        '<div style="background:#FFFBEB;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:22px;font-weight:800;color:#D97706">' + totalLettrage + '</div>' +
          '<div style="font-size:10px;color:#D97706">Non lettrées</div>' +
        '</div>' +
        '<div style="background:#F3E8FF;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:22px;font-weight:800;color:#9333EA">' + totalTVA + '</div>' +
          '<div style="font-size:10px;color:#9333EA">TVA à vérifier</div>' +
        '</div>' +
        '<div style="background:#FEF2F2;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:22px;font-weight:800;color:#EF4444">' + totalRem + '</div>' +
          '<div style="font-size:10px;color:#EF4444">Remarques</div>' +
        '</div>' +
      '</div>' +

      (items.length ?
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94A3B8;margin-bottom:10px">Par entreprise</div>' +
        items.map(function(item) {
          return '<div style="background:#fff;border-radius:12px;padding:14px;border:1px solid ' + item.bg.replace('F', 'E') + ';margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">' +
            '<div>' +
              '<div style="font-size:12px;font-weight:700">' + escapeHTML(item.entreprise) + '</div>' +
              '<div style="font-size:11px;color:' + item.color + ';font-weight:600;margin-top:2px">' + item.label + '</div>' +
            '</div>' +
            '<button data-eid="' + item.eid + '" data-filtre="' + item.type + '" class="btn-voir-ent" style="background:' + item.bg + ';color:' + item.color + ';border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">Voir →</button>' +
          '</div>';
        }).join('') :
        '<div style="text-align:center;padding:40px;color:#94A3B8"><div style="font-size:40px;margin-bottom:12px">✅</div><div style="font-size:14px;font-weight:600">Tout est à jour !</div></div>'
      ) +
    '</div>';

  // Event delegation for "Voir" buttons
  list.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-voir-ent');
    if (btn) {
      const eid = btn.dataset.eid;
      const filtre = btn.dataset.filtre;
      ouvrirEntreprise(eid).then(function() {
        CPT.filtres = { lettrage: filtre === 'lettrage' ? false : null, tva: filtre === 'tva' ? false : null, remarque: filtre === 'remarque' || null };
        setTimeout(renderCptFactures, 300);
      });
    }
  }, { once: true });
}

// ============================================================
// HISTORIQUE DES ACTIONS
// ============================================================

function ajouterHistorique(action, factureId) {
  if (!CPT.historique) CPT.historique = [];
  const fac = (CPT.currentFactures || []).find(function(f) { return String(f.id) === String(factureId); });
  const ref = fac ? fac.ref : factureId;
  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';
  CPT.historique.unshift({
    date: new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}),
    action: action + ref,
    comptable: nom
  });
  // Garder max 100 entrées
  if (CPT.historique.length > 100) CPT.historique = CPT.historique.slice(0, 100);
}

function renderHistorique() {
  const list = el('cpt-ent-content');
  if (!list) return;
  const hist = CPT.historique || [];
  list.innerHTML = '<div style="padding:16px">' +
    '<div style="font-size:14px;font-weight:700;color:#0F172A;margin-bottom:14px">📋 Historique des actions</div>' +
    (hist.length ? hist.map(function(h) {
      return '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #F8FAFC;align-items:flex-start">' +
        '<div style="width:6px;height:6px;border-radius:50%;background:#4338CA;margin-top:5px;flex-shrink:0"></div>' +
        '<div>' +
          '<div style="font-size:12px;font-weight:600;color:#0F172A">' + escapeHTML(h.action) + '</div>' +
          '<div style="font-size:10px;color:#94A3B8;margin-top:2px">' + h.date + ' · ' + escapeHTML(h.comptable) + '</div>' +
        '</div>' +
      '</div>';
    }).join('') : '<div style="text-align:center;color:#94A3B8;padding:40px">Aucune action enregistrée</div>') +
  '</div>';
}

// ============================================================
// TRI DES ENTREPRISES
// ============================================================

CPT.triActuel = 'action';

function trierEntreprises(critere) {
  CPT.triActuel = critere;
  const sorted = CPT.entreprises.slice().sort(function(a, b) {
    const etatOrder = { rouge: 0, orange: 1, vert: 2 };
    if (critere === 'action') return (etatOrder[a._etat] || 2) - (etatOrder[b._etat] || 2);
    if (critere === 'lettrage') {
      const txA = txLettrage(a); const txB = txLettrage(b);
      return txA - txB;
    }
    if (critere === 'tva') {
      const txA = txTVA(a); const txB = txTVA(b);
      return txA - txB;
    }
    if (critere === 'nom') return (a.profil?.raison || '').localeCompare(b.profil?.raison || '');
    return 0;
  });
  CPT.entreprises = sorted;
  renderListeEntreprises();
}

function txLettrage(inv) {
  const f = inv._factures || []; const c = inv._controles || [];
  return f.length ? c.filter(function(x){return x.lettre;}).length / f.length : 1;
}
function txTVA(inv) {
  const f = inv._factures || []; const c = inv._controles || [];
  return f.length ? c.filter(function(x){return x.tva_verifie;}).length / f.length : 1;
}

// ============================================================
// GESTION ENTREPRISES PAR LE COMPTABLE
// ============================================================

async function ouvrirGestionEntreprises() {
  const email = sb.user?.email;
  if (!email) return;

  let invites = [];
  try {
    invites = await fetch(
      SUPABASE_URL + '/rest/v1/invitations_comptable?comptable_email=eq.' + encodeURIComponent(email) + '&order=created_at.desc&select=*',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    ).then(function(r) { return r.json(); }) || [];
  } catch(e) {}

  const overlay = document.createElement('div');
  overlay.id = 'gestion-ent-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:flex-end';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:20px 20px 0 0;padding:24px;width:100%;max-height:85vh;overflow-y:auto';

  const statutColor = { en_attente:'#D97706', acceptee:'#059669', refusee:'#EF4444', revoquee:'#94A3B8', archivee:'#94A3B8' };
  const statutLabel = { en_attente:'⏳ En attente', acceptee:'✅ Active', refusee:'❌ Refusée', revoquee:'🚫 Révoquée', archivee:'📦 Archivée' };

  box.innerHTML = '<div style="width:40px;height:4px;background:#E2E8F0;border-radius:2px;margin:0 auto 20px"></div>' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:16px">🏢 Mes entreprises</div>' +
    '<div style="background:#EEF2FF;border-radius:14px;padding:16px;margin-bottom:16px">' +
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#4338CA;margin-bottom:10px">Inviter une entreprise</div>' +
      '<input id="invite-ent-email" style="width:100%;padding:10px;border:1.5px solid #C7D2FE;border-radius:10px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:8px" type="email" placeholder="email@entreprise.ma">' +
      '<button id="btn-send-invite-ent" style="width:100%;padding:11px;background:#4338CA;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📧 Envoyer l\'invitation</button>' +
    '</div>' +
    '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94A3B8;margin-bottom:10px">Portefeuille (' + invites.length + ')</div>' +
    invites.map(function(inv) {
      return '<div style="background:#fff;border-radius:12px;border:1px solid #F1F5F9;padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:600">' + escapeHTML(inv.entreprise_email || inv.entreprise_id || '') + '</div>' +
          '<div style="font-size:11px;margin-top:2px;color:' + (statutColor[inv.statut] || '#64748B') + ';font-weight:600">' + (statutLabel[inv.statut] || inv.statut) + '</div>' +
        '</div>' +
        (inv.statut === 'acceptee' ?
          '<button data-inv="' + inv.id + '" data-action="archiver" class="btn-inv-action" style="background:#F1F5F9;color:#64748B;border:none;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:inherit">Archiver</button>' :
          inv.statut === 'en_attente' ?
          '<button data-inv="' + inv.id + '" data-action="revoquer" class="btn-inv-action" style="background:#FEF2F2;color:#EF4444;border:none;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:inherit">Annuler</button>' : ''
        ) +
      '</div>';
    }).join('') +
    '<button id="btn-close-gestion" style="width:100%;margin-top:12px;padding:12px;background:#F1F5F9;color:#64748B;border:none;border-radius:10px;font-size:13px;cursor:pointer;font-family:inherit">Fermer</button>';

  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Events
  document.getElementById('btn-close-gestion').onclick = function() { overlay.remove(); };
  document.getElementById('btn-send-invite-ent').onclick = function() { envoyerInvitationEntreprise(); };

  box.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-inv-action');
    if (btn) {
      const action = btn.dataset.action;
      const invId = btn.dataset.inv;
      if (action === 'archiver' && confirm('Archiver cette entreprise ?')) {
        mettreAJourInvitation(invId, 'archivee');
      } else if (action === 'revoquer' && confirm('Annuler cette invitation ?')) {
        mettreAJourInvitation(invId, 'revoquee');
      }
    }
  });
}

async function envoyerInvitationEntreprise() {
  const emailEnt = (document.getElementById('invite-ent-email')?.value || '').trim().toLowerCase();
  if (!emailEnt || !emailEnt.includes('@')) { showToast('Email invalide', 'error'); return; }
  const emailCpt = sb.user?.email;

  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ comptable_email: emailCpt, entreprise_email: emailEnt, statut: 'en_attente', sens: 'comptable_vers_entreprise' })
    });
    if (r.ok || r.status === 201) {
      const inviteUrl = window.location.origin + window.location.pathname + '?invite_cpt=' + encodeURIComponent(emailCpt) + '&pour=' + encodeURIComponent(emailEnt);
      if (navigator.share) {
        try { await navigator.share({ title: 'Invitation BaniPay', text: 'Invitation comptable BaniPay: ' + inviteUrl }); }
        catch(e2) { navigator.clipboard?.writeText(inviteUrl); }
      } else {
        navigator.clipboard?.writeText(inviteUrl);
      }
      showToast('\u2705 Invitation envoyée !', 'success');
      document.getElementById('gestion-ent-overlay')?.remove();
    }
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function mettreAJourInvitation(invId, statut) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + invId, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: statut })
    });
    showToast('Mis à jour', 'success');
    document.getElementById('gestion-ent-overlay')?.remove();
    await loadComptableApp();
  } catch(e) { showToast('Erreur', 'error'); }
}

// ============================================================
// NAVIGATION ESPACE COMPTABLE
// ============================================================

function switchCptNav(tab) {
  // Update nav buttons
  ['dashboard','entreprises','traiter','historique'].forEach(function(t) {
    const btn = document.getElementById('cpt-nav-' + t);
    if (!btn) return;
    if (t === tab) {
      btn.style.background = 'rgba(255,255,255,0.9)';
      btn.style.color = '#4338CA';
    } else {
      btn.style.background = 'rgba(255,255,255,0.15)';
      btn.style.color = 'rgba(255,255,255,0.7)';
    }
  });

  const content = el('cpt-main-content');
  if (!content) return;

  if (tab === 'dashboard') {
    // KPIs + liste entreprises
    const totalFac = (CPT.allFactures || []).length;
    const nonLettres = totalFac - (CPT.allControles || []).filter(function(c){return c.lettre;}).length;
    const tvaKo = totalFac - (CPT.allControles || []).filter(function(c){return c.tva_verifie;}).length;
    const entAction = (CPT.entreprises || []).filter(function(e){return e._etat==='rouge';}).length;
    const docsAControler = totalFac - (CPT.allControles || []).filter(function(c){return c.consulte;}).length;

    content.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:16px 16px 8px">' +
        kpiBox((CPT.entreprises||[]).length, 'Entreprises', '#4338CA', '#EEF2FF') +
        kpiBox(docsAControler, 'À contrôler', '#2563EB', '#EFF6FF') +
        kpiBox(nonLettres, 'Non lettrées', '#D97706', '#FFFBEB') +
        kpiBox(tvaKo, 'TVA à vérifier', '#9333EA', '#F3E8FF') +
      '</div>' +
      '<div style="padding:0 16px 4px;display:flex;justify-content:space-between;align-items:center">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94A3B8">Entreprises</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button onclick="trierEntreprises(\'action\')" style="font-size:10px;padding:4px 8px;border:none;border-radius:8px;background:#EEF2FF;color:#4338CA;cursor:pointer;font-family:inherit;font-weight:600">Priorité</button>' +
          '<button onclick="trierEntreprises(\'lettrage\')" style="font-size:10px;padding:4px 8px;border:none;border-radius:8px;background:#F1F5F9;color:#64748B;cursor:pointer;font-family:inherit">Lettrage</button>' +
          '<button onclick="trierEntreprises(\'nom\')" style="font-size:10px;padding:4px 8px;border:none;border-radius:8px;background:#F1F5F9;color:#64748B;cursor:pointer;font-family:inherit">Nom</button>' +
        '</div>' +
      '</div>' +
      '<div id="cpt-entreprises-list" style="padding:0 16px"></div>' +
      '<div style="padding:12px 16px 20px;display:flex;gap:8px">' +
        '<button onclick="ouvrirGestionEntreprises()" style="flex:1;padding:11px;background:#EEF2FF;color:#4338CA;border:1.5px solid #C7D2FE;border-radius:12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">➕ Gérer entreprises</button>' +
        '<button onclick="renderComptableProfil();goScreen(\'comptable-profil\',null)" style="flex:1;padding:11px;background:#fff;color:#64748B;border:1.5px solid #E2E8F0;border-radius:12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">👤 Mon profil</button>' +
      '</div>';

    renderListeEntreprises();

  } else if (tab === 'entreprises') {
    content.innerHTML =
      '<div style="padding:16px">' +
        '<div style="display:flex;gap:8px;margin-bottom:14px">' +
          '<button onclick="trierEntreprises(\'action\')" style="flex:1;padding:8px;border:none;border-radius:10px;background:#EEF2FF;color:#4338CA;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">🔴 Priorité</button>' +
          '<button onclick="trierEntreprises(\'lettrage\')" style="flex:1;padding:8px;border:none;border-radius:10px;background:#FFFBEB;color:#D97706;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">Lettrage ↑</button>' +
          '<button onclick="trierEntreprises(\'tva\')" style="flex:1;padding:8px;border:none;border-radius:10px;background:#F3E8FF;color:#9333EA;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">TVA ↑</button>' +
          '<button onclick="trierEntreprises(\'nom\')" style="flex:1;padding:8px;border:none;border-radius:10px;background:#F1F5F9;color:#64748B;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit">A-Z</button>' +
        '</div>' +
      '</div>' +
      '<div id="cpt-entreprises-list" style="padding:0 16px"></div>' +
      '<div style="padding:12px 16px">' +
        '<button onclick="ouvrirGestionEntreprises()" style="width:100%;padding:12px;background:#4338CA;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">➕ Inviter une entreprise</button>' +
      '</div>';
    renderListeEntreprises();

  } else if (tab === 'traiter') {
    // Use cpt-ent-content temporarily
    const tmp = document.createElement('div');
    tmp.id = 'cpt-ent-content';
    content.innerHTML = '';
    content.appendChild(tmp);
    renderVueATraiter();

  } else if (tab === 'historique') {
    const tmp = document.createElement('div');
    tmp.id = 'cpt-ent-content';
    content.innerHTML = '';
    content.appendChild(tmp);
    renderHistorique();
  }
}

function kpiBox(val, label, color, bg) {
  return '<div style="background:' + bg + ';border-radius:14px;padding:14px;text-align:center;border:1px solid ' + color + '20">' +
    '<div style="font-size:26px;font-weight:900;color:' + color + '">' + val + '</div>' +
    '<div style="font-size:10px;color:' + color + ';font-weight:600;margin-top:2px">' + label + '</div>' +
  '</div>';
}

// Override renderComptableDashboard to use new navigation
function renderComptableDashboard() {
  const email = sb.user?.email || '';
  const nom = sb.user?.user_metadata?.nom || email.split('@')[0] || 'Comptable';
  const cabinet = sb.user?.user_metadata?.cabinet || '';

  const av = el('comptable-avatar');
  if (av) av.textContent = nom.split(' ').slice(0, 2).map(function(w){return w[0]||'';}).join('').toUpperCase() || 'C';
  setEl('cpt-nom-display', nom + (cabinet ? ' · ' + cabinet : ''));
  setEl('cpt-email-display', email);
  setEl('cpt-nb-entreprises', (CPT.entreprises||[]).length + ' entreprise(s)');

  // Load remarques for all entreprises
  CPT.entreprises.forEach(function(inv) {
    inv._remarques = inv._remarques || [];
  });

  switchCptNav('dashboard');
}
