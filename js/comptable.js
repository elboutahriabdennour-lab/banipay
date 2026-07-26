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
      const ids = CPT.entreprises.map(function(i) { return i.entreprise_id; }).filter(function(id) { return id && id !== 'null'; });
      if (!ids.length) {
        renderComptableDashboard();
    chargerNotificationsComptable(); // Load notification badge
        return;
      }

      // FIX: lecture des factures via RPC (contourne la RLS) — l'ancien
      // fetch direct utilisait la session du comptable pour lire des lignes
      // appartenant à une AUTRE entreprise, ce qui était presque certainement
      // bloqué par la RLS et renvoyait une liste vide (d'où l'impression de
      // ne "rien pouvoir ouvrir" : il n'y avait simplement rien à afficher).
      const profils = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=in.(' + ids.join(',') + ')&select=*',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }).then(function(r) { return r.json(); });

      let toutesFactures = [];
      for (const eid of ids) {
        try {
          const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_factures_entreprise', {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_entreprise_id: eid })
          });
          if (r.ok) {
            toutesFactures = toutesFactures.concat((await r.json()) || []);
          } else {
            console.warn('get_factures_entreprise a échoué pour', eid, r.status, await r.text().catch(function(){return '';}));
          }
        } catch(eRpc) { console.warn('get_factures_entreprise erreur:', eRpc); }
      }
      console.log('loadComptableApp: ' + toutesFactures.length + ' facture(s) rechargée(s) (via RPC).');

      // FIX: lecture des contrôles via la fonction RPC (contourne la RLS,
      // qui bloquait probablement le SELECT direct pour le comptable) —
      // un appel par entreprise puisque la fonction ne prend qu'un id à la fois.
      let tousControles = [];
      for (const eid of ids) {
        try {
          const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_controles_entreprise', {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_entreprise_id: eid })
          });
          if (r.ok) {
            const rows = await r.json();
            tousControles = tousControles.concat(rows || []);
          } else {
            console.warn('get_controles_entreprise a échoué pour', eid, r.status, await r.text().catch(function(){return '';}));
          }
        } catch(eRpc) { console.warn('get_controles_entreprise erreur:', eRpc); }
      }

      // FIX: diagnostic — si tousControles revient systématiquement vide (0)
      // alors qu'on sait avoir déjà écrit des lignes (voir la vérification
      // de relecture dans sauvegarderControle), c'est la confirmation que
      // le SELECT sur controles_factures est bloqué par RLS pour ce compte
      // comptable — cause la plus probable du "l'app ne se souvient pas".
      console.log('loadComptableApp: ' + (tousControles ? tousControles.length : 0) + ' ligne(s) de contrôle rechargée(s) depuis controles_factures (via RPC).');

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

// Retrouve le nom d'affichage (raison sociale) d'une entreprise déjà chargée
// dans CPT.entreprises à partir de son id ou de son email — retombe sur l'email si inconnu
function nomEntreprise(entrepriseId, entrepriseEmailFallback) {
  const inv = (CPT.entreprises || []).find(function(e) {
    return e.entreprise_id === entrepriseId || (entrepriseEmailFallback && e.entreprise_email === entrepriseEmailFallback);
  });
  if (inv && inv.profil && inv.profil.raison) return inv.profil.raison;
  return entrepriseEmailFallback || 'Entreprise';
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
  if (etat === 'vert') return '#6E8F4E';
  if (etat === 'orange') return '#B8860B';
  return '#B23A2E';
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
    const nomAffiche = p.raison || inv.entreprise_email || 'Entreprise';
    const initiales = (nomAffiche || '?').split(' ').slice(0, 2).map(function(w) { return w[0] || ''; }).join('').toUpperCase() || '?';

    return '<div onclick="ouvrirEntreprise(\'' + inv.entreprise_id + '\')" style="background:#fff;border-radius:16px;padding:16px;margin-bottom:10px;border:1px solid #E3DCCF;cursor:pointer">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">' +
        '<div style="width:44px;height:44px;border-radius:12px;background:#FBF0DA;color:#1F6F72;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + initiales + '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:13px;font-weight:700;color:#2A2420">' + escapeHTML(nomAffiche) + '</div>' +
          '<div style="font-size:11px;color:#6B5F54">' + (p.secteur || '') + (p.ville ? ' · ' + p.ville : '') + '</div>' +
        '</div>' +
        '<div style="font-size:12px;font-weight:700;color:' + etatColor(etat) + '">' + etatLabel(etat) + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
        '<div style="text-align:center;background:#F1EEE8;border-radius:8px;padding:6px">' +
          '<div style="font-size:11px;font-weight:700;color:#2A2420">' + total + '</div>' +
          '<div style="font-size:9px;color:#9C9186">Documents</div>' +
        '</div>' +
        '<div style="text-align:center;background:#F7EFDC;border-radius:8px;padding:6px">' +
          '<div style="font-size:11px;font-weight:700;color:#B8860B">' + txL + '%</div>' +
          '<div style="font-size:9px;color:#9C9186">Lettrage</div>' +
        '</div>' +
        '<div style="text-align:center;background:#EDE6F0;border-radius:8px;padding:6px">' +
          '<div style="font-size:11px;font-weight:700;color:#7C5CA6">' + txT + '%</div>' +
          '<div style="font-size:9px;color:#9C9186">TVA</div>' +
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

  // Load devis — via RPC pour contourner la RLS cross-compte
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_devis_entreprise', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_entreprise_id: entrepriseId })
    });
    CPT.currentDevis = r.ok ? ((await r.json()) || []) : [];
    if (!r.ok) console.warn('get_devis_entreprise a échoué', r.status, await r.text().catch(function(){return '';}));
  } catch(e) { CPT.currentDevis = []; }

  renderFicheEntreprise();
  goScreen('cpt-entreprise');
}

function renderFicheEntreprise() {
  const p = CPT.currentProfil || {};
  const f = CPT.currentFactures || [];
  const c = CPT.currentControles || [];
  const inv = CPT.entreprises.find(function(e) { return e.entreprise_id === CPT.currentEntrepriseId; });
  const etat = inv ? inv._etat : 'vert';

  setEl('cpt-ent-nom', p.raison || inv?.entreprise_email || 'Entreprise');
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
        '<span style="font-size:11px;color:#6B5F54">Contrôle global: ' + txG + '%</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">' +
        '<div style="background:#E9F4F3;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:20px;font-weight:800;color:#C9971F">' + total + '</div>' +
          '<div style="font-size:10px;color:#C9971F">Factures</div>' +
        '</div>' +
        '<div style="background:#F7EFDC;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:20px;font-weight:800;color:#B8860B">' + nonLettres + '</div>' +
          '<div style="font-size:10px;color:#B8860B">Non lettrées</div>' +
        '</div>' +
        '<div style="background:#EDE6F0;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:20px;font-weight:800;color:#7C5CA6">' + tvaKo + '</div>' +
          '<div style="font-size:10px;color:#7C5CA6">TVA à vérifier</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#6B5F54;margin-bottom:4px"><span>Lettrage</span><span style="font-weight:700">' + txL + '%</span></div>' +
        '<div style="height:8px;background:#EAE4DA;border-radius:4px"><div style="height:100%;background:#B8860B;border-radius:4px;width:' + txL + '%"></div></div>' +
      '</div>' +
      '<div style="margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#6B5F54;margin-bottom:4px"><span>Vérification TVA</span><span style="font-weight:700">' + txT + '%</span></div>' +
        '<div style="height:8px;background:#EAE4DA;border-radius:4px"><div style="height:100%;background:#7C5CA6;border-radius:4px;width:' + txT + '%"></div></div>' +
      '</div>' +
      '<div>' +
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#6B5F54;margin-bottom:4px"><span>Contrôle global</span><span style="font-weight:700">' + txG + '%</span></div>' +
        '<div style="height:8px;background:#EAE4DA;border-radius:4px"><div style="height:100%;background:#1F6F72;border-radius:4px;width:' + txG + '%"></div></div>' +
      '</div>' +
    '</div>';

  cptEntTab('factures');
}

// ============================================================
// ONGLETS ENTREPRISE
// ============================================================

function cptEntTab(tab) {
  CPT.currentTab = tab;
  ['factures', 'devis', 'avoirs', 'infos', 'releves'].forEach(function(t) {
    const btn = el('cpt-tab-' + t);
    if (btn) {
      btn.style.background = t === tab ? '#1F6F72' : '#EAE4DA';
      btn.style.color = t === tab ? '#fff' : '#6B5F54';
    }
  });
  if (tab === 'factures') renderCptFactures();
  else if (tab === 'devis') renderCptDevis();
  else if (tab === 'avoirs') renderCptTVA();
  else if (tab === 'infos') renderCptInfos();
  else if (tab === 'releves') renderCptReleves();
}

// Filtres actifs
CPT.filtres = { lettrage: null, tva: null, statut: null };

function appliquerFiltreCpt(type, val) {
  CPT.filtres[type] = CPT.filtres[type] === val ? null : val;
  renderCptFactures();
}

function creerFiltreCpt() {
  // FIX: cette fonction construisait les boutons via DOM + btn.onclick, puis
  // renvoyait div.outerHTML — qui NE SÉRIALISE PAS les gestionnaires de clic
  // attachés en JS (onclick assigné en propriété, pas en attribut HTML).
  // Résultat : ces boutons de filtre étaient inertes une fois réinjectés via
  // innerHTML. Réécrit en HTML pur avec data-attributes, géré par le même
  // écouteur délégué que L/T dans renderCptFactures().
  const btns = [
    { label: '☐ Non lettrées', key: 'lettrage', val: 'false', bg: '#F7EFDC', color: '#B8860B' },
    { label: '☐ TVA non vérifiée', key: 'tva', val: 'false', bg: '#EDE6F0', color: '#7C5CA6' },
    { label: '📝 Avec remarque', key: 'remarque', val: 'true', bg: '#F5E4E1', color: '#B23A2E' },
  ];
  const boutonsHtml = btns.map(function(b) {
    const active = (b.val === 'false' ? CPT.filtres[b.key] === false : CPT.filtres[b.key]);
    return '<button class="btn-filtre-cpt" data-key="' + b.key + '" data-val="' + b.val + '" style="padding:5px 10px;border:none;border-radius:16px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;background:' + (active ? b.bg : '#EAE4DA') + ';color:' + (active ? b.color : '#6B5F54') + '">' + b.label + '</button>';
  }).join('');
  const boutonTous = '<button class="btn-filtre-cpt-tous" style="padding:5px 10px;border:none;border-radius:16px;font-size:11px;cursor:pointer;font-family:inherit;background:#EAE4DA;color:#6B5F54">Tous</button>';
  return '<div style="padding:10px 16px;display:flex;gap:8px;overflow-x:auto;border-bottom:1px solid #EAE4DA;background:#fff">' + boutonsHtml + boutonTous + '</div>';
}

// FIX: le conteneur des factures comptable est persistant entre les rendus
// (l'onglet "factures" réutilise le même noeud DOM). On ne fixe l'écouteur
// de clic qu'une seule fois par noeud (via un flag dataset) au lieu d'un
// listener { once:true } qui ne réagissait qu'au tout premier clic (L ou T
// ou ouverture de facture), rendant l'app "silencieuse" ensuite.
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

  const statutBg = { payee:'#EEF3E4', attente:'#F7EFDC', retard:'#F5E4E1', brouillon:'#EAE4DA', envoyee:'#E9F4F3', annulee:'#EAE4DA' };
  const statutColor = { payee:'#6E8F4E', attente:'#B8860B', retard:'#B23A2E', brouillon:'#9C9186', envoyee:'#C9971F', annulee:'#9C9186' };
  const statutLabel = { payee:'Payée', attente:'En attente', retard:'En retard', brouillon:'Brouillon', envoyee:'Envoyée', annulee:'Annulée' };

  list.innerHTML =
    creerFiltreCpt() +
    '<div style="display:grid;grid-template-columns:1fr 36px 36px;padding:8px 16px;background:#F1EEE8;border-bottom:1px solid #EAE4DA">' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9C9186">Facture</div>' +
      '<div style="font-size:11px;font-weight:800;color:#6E8F4E;text-align:center">L</div>' +
      '<div style="font-size:11px;font-weight:800;color:#7C5CA6;text-align:center">T</div>' +
    '</div>' +
    (f.length ? f.map(function(fac) {
      const ctrl = (CPT.currentControles || []).find(function(c) { return String(c.facture_id) === String(fac.id); }) || {};
      const remarques = (CPT.currentRemarques || []).filter(function(r) { return String(r.facture_id) === String(fac.id) && r.statut === 'ouverte'; });
      return '<div style="display:grid;grid-template-columns:1fr 44px 44px;padding:12px 16px;border-bottom:1px solid #F1EEE8;align-items:center">' +
        '<div class="fac-row-click" data-fid="' + fac.id + '" style="cursor:pointer">' +
          '<div style="font-size:12px;font-weight:700">' + escapeHTML(fac.ref || '') + '</div>' +
          '<div style="font-size:11px;color:#6B5F54">' + escapeHTML(fac.client || '') + ' · ' + fmt(fac.ttc || 0) + ' MAD</div>' +
          '<div style="display:flex;gap:6px;margin-top:3px;align-items:center">' +
            '<span style="background:' + (statutBg[fac.statut] || '#EAE4DA') + ';color:' + (statutColor[fac.statut] || '#6B5F54') + ';font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px">' + (statutLabel[fac.statut] || '') + '</span>' +
            (remarques.length ? '<span style="font-size:9px;color:#B23A2E;font-weight:600">📝 ' + remarques.length + ' remarque(s)</span>' : '') +
            '<span style="font-size:10px;font-weight:800;width:18px;height:18px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;background:' + (ctrl.lettre ? '#6E8F4E' : '#E3DCCF') + ';color:' + (ctrl.lettre ? '#fff' : '#9C9186') + '">L</span>' +
            '<span style="font-size:10px;font-weight:800;width:18px;height:18px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;background:' + (ctrl.tva_verifie ? '#7C5CA6' : '#E3DCCF') + ';color:' + (ctrl.tva_verifie ? '#fff' : '#9C9186') + '">T</span>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:center">' +
          '<button class="btn-lettr" data-facid="' + fac.id + '" data-lettre="' + (ctrl.lettre ? '1' : '0') + '" style="width:30px;height:30px;border-radius:8px;border:none;background:' + (ctrl.lettre ? '#6E8F4E' : '#EAE4DA') + ';font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;color:' + (ctrl.lettre ? '#fff' : '#CDBEA0') + '">L</button>' +
        '</div>' +
        '<div style="display:flex;justify-content:center">' +
          '<button class="btn-tva" data-facid="' + fac.id + '" data-tva="' + (ctrl.tva_verifie ? '1' : '0') + '" style="width:30px;height:30px;border-radius:8px;border:none;background:' + (ctrl.tva_verifie ? '#7C5CA6' : '#EAE4DA') + ';font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;color:' + (ctrl.tva_verifie ? '#fff' : '#CDBEA0') + '">T</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<div class="empty"><div class="empty-ico">🧾</div><div class="empty-title">Aucune facture</div></div>');

  // FIX: n'attacher l'écouteur qu'une seule fois sur ce noeud (persistant entre les rendus)
  if (list.dataset.clickBound !== '1') {
    list.dataset.clickBound = '1';
    list.addEventListener('click', function(e) {
      const row = e.target.closest('.fac-row-click');
      if (row) {
        const facId = row.dataset.fid;
        const fac = (CPT.currentFactures || []).find(function(f) { return String(f.id) === String(facId); });
        if (fac) {
          ouvrirPDFComptable(fac, CPT.currentProfil || {});
          setTimeout(function() { attacherControlsToViewer(facId); }, 300);
        }
        return;
      }
      const btnL = e.target.closest('.btn-lettr');
      if (btnL) { toggleLettrageRapide(btnL.dataset.facid, btnL); return; }
      const btnT = e.target.closest('.btn-tva');
      if (btnT) { toggleTVARapide(btnT.dataset.facid, btnT); return; }
      const btnFiltre = e.target.closest('.btn-filtre-cpt');
      if (btnFiltre) { appliquerFiltreCpt(btnFiltre.dataset.key, btnFiltre.dataset.val === 'true'); return; }
      const btnTous = e.target.closest('.btn-filtre-cpt-tous');
      if (btnTous) { CPT.filtres = {lettrage:null,tva:null,statut:null,remarque:null}; renderCptFactures(); return; }
    });
  }
}

// Contrôle rapide inline depuis la liste
async function toggleLettrageRapide(factureId, btn) {
  const isLettree = btn.dataset.lettre === '1';
  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';
  if (isLettree) {
    if (!confirm('Retirer le lettrage ?')) return;
    await sauvegarderControle(factureId, { lettre: false, lettre_at: null, lettre_par: null });
    btn.dataset.lettre = '0';
    btn.textContent = 'L'; btn.style.background = '#EAE4DA'; btn.style.color = '#CDBEA0';
  } else {
    await sauvegarderControle(factureId, { lettre: true, lettre_at: new Date().toISOString(), lettre_par: nom });
    btn.dataset.lettre = '1';
    btn.textContent = 'L'; btn.style.background = '#6E8F4E'; btn.style.color = '#fff';
  }
  ajouterHistorique(isLettree ? 'Lettrage retiré — ' : 'Lettrage effectué — ', factureId);
  showToast('Lettrage mis à jour', 'success');
  const inv = CPT.entreprises.find(function(e) { return e.entreprise_id === CPT.currentEntrepriseId; });
  if (inv) { inv._etat = calculerEtat(inv); }
}

async function toggleTVARapide(factureId, btn) {
  const isTVA = btn.dataset.tva === '1';
  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';
  if (isTVA) {
    await sauvegarderControle(factureId, { tva_verifie: false, tva_verifie_at: null, tva_verifie_par: null });
    btn.dataset.tva = '0';
    btn.textContent = 'T'; btn.style.background = '#EAE4DA'; btn.style.color = '#CDBEA0';
  } else {
    await sauvegarderControle(factureId, { tva_verifie: true, tva_verifie_at: new Date().toISOString(), tva_verifie_par: nom });
    btn.dataset.tva = '1';
    btn.textContent = 'T'; btn.style.background = '#7C5CA6'; btn.style.color = '#fff';
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
  const statutColor = { envoye: '#B8860B', accepte: '#6E8F4E', refuse: '#B23A2E', brouillon: '#9C9186' };
  const statutLabel = { envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', brouillon: 'Brouillon' };
  list.innerHTML = d.map(function(dv) {
    return '<div style="padding:14px 16px;border-bottom:1px solid #F1EEE8">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
        '<span style="font-size:13px;font-weight:700">' + escapeHTML(dv.ref || '') + '</span>' +
        '<span style="font-size:13px;font-weight:700">' + fmt(dv.ttc || 0) + ' MAD</span>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between">' +
        '<span style="font-size:11px;color:#6B5F54">' + escapeHTML(dv.client || '') + ' · ' + (dv.date_emission || '') + '</span>' +
        '<span style="font-size:10px;font-weight:600;color:' + (statutColor[dv.statut] || '#6B5F54') + '">' + (statutLabel[dv.statut] || dv.statut || '') + '</span>' +
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
    '<div style="background:#EDE6F0;border-radius:12px;padding:14px;margin-bottom:16px;display:flex;justify-content:space-between">' +
      '<div style="font-size:12px;font-weight:600;color:#7C5CA6">TVA totale collectée</div>' +
      '<div style="font-size:18px;font-weight:800;color:#7C5CA6">' + fmt(totalTVA) + ' MAD</div>' +
    '</div>' +
    Object.keys(byMonth).sort().reverse().map(function(m) {
      const d = byMonth[m];
      return '<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #EAE4DA">' +
        '<div><div style="font-size:12px;font-weight:600">' + m + '</div><div style="font-size:10px;color:#9C9186">' + d.count + ' facture(s)</div></div>' +
        '<div style="text-align:right"><div style="font-size:11px;color:#6B5F54">HT: ' + fmt(d.ht) + '</div><div style="font-size:13px;font-weight:700;color:#7C5CA6">TVA: ' + fmt(d.tva) + ' MAD</div></div>' +
      '</div>';
    }).join('') +
    '<div style="display:flex;gap:8px;margin-top:16px">' +
        '<button onclick="declarerTVAMois()" style="flex:1;padding:12px;background:#6E8F4E;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">✅ Déclarer TVA du mois</button>' +
        '<button onclick="exportCptTVA()" style="flex:1;padding:12px;background:#7C5CA6;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📥 Export CSV</button>' +
      '</div>' +
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
    '<div style="background:#fff;border-radius:16px;border:1px solid #E3DCCF;padding:16px">' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:14px">' + escapeHTML(p.raison || '—') + '</div>' +
      fields.map(function(x) {
        return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #F1EEE8;font-size:12px">' +
          '<span style="color:#6B5F54">' + x[0] + '</span>' +
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

  const items = [];

  CPT.entreprises.forEach(function(inv) {
    const p = inv.profil || {};
    const facs = inv._factures || [];
    const ctrls = inv._controles || [];
    const rems = inv._remarques || [];
    const nomAffiche = p.raison || inv.entreprise_email || 'Entreprise';

    const lettresIds = ctrls.filter(function(c) { return c.lettre; }).map(function(c) { return String(c.facture_id); });
    const nonLettrees = facs.filter(function(f) { return !lettresIds.includes(String(f.id)); });
    if (nonLettrees.length) {
      items.push({ entreprise: nomAffiche, type: 'lettrage', count: nonLettrees.length, eid: inv.entreprise_id, label: nonLettrees.length + ' facture(s) non lettrée(s)', color: '#B8860B', bg: '#F7EFDC' });
    }

    const tvaIds = ctrls.filter(function(c) { return c.tva_verifie; }).map(function(c) { return String(c.facture_id); });
    const tvaKo = facs.filter(function(f) { return !tvaIds.includes(String(f.id)); });
    if (tvaKo.length) {
      items.push({ entreprise: nomAffiche, type: 'tva', count: tvaKo.length, eid: inv.entreprise_id, label: tvaKo.length + ' TVA non vérifiée(s)', color: '#7C5CA6', bg: '#EDE6F0' });
    }

    const remsOuvertes = rems.filter(function(r) { return r.statut === 'ouverte'; });
    if (remsOuvertes.length) {
      items.push({ entreprise: nomAffiche, type: 'remarque', count: remsOuvertes.length, eid: inv.entreprise_id, label: remsOuvertes.length + ' remarque(s) ouverte(s)', color: '#B23A2E', bg: '#F5E4E1' });
    }
  });

  const totalLettrage = items.filter(function(i) { return i.type === 'lettrage'; }).reduce(function(s, i) { return s + i.count; }, 0);
  const totalTVA = items.filter(function(i) { return i.type === 'tva'; }).reduce(function(s, i) { return s + i.count; }, 0);
  const totalRem = items.filter(function(i) { return i.type === 'remarque'; }).reduce(function(s, i) { return s + i.count; }, 0);

  list.innerHTML =
    '<div style="padding:16px">' +
      '<div style="font-size:14px;font-weight:700;color:#2A2420;margin-bottom:12px">📥 À traiter</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px">' +
        '<div style="background:#F7EFDC;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:22px;font-weight:800;color:#B8860B">' + totalLettrage + '</div>' +
          '<div style="font-size:10px;color:#B8860B">Non lettrées</div>' +
        '</div>' +
        '<div style="background:#EDE6F0;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:22px;font-weight:800;color:#7C5CA6">' + totalTVA + '</div>' +
          '<div style="font-size:10px;color:#7C5CA6">TVA à vérifier</div>' +
        '</div>' +
        '<div style="background:#F5E4E1;border-radius:12px;padding:12px;text-align:center">' +
          '<div style="font-size:22px;font-weight:800;color:#B23A2E">' + totalRem + '</div>' +
          '<div style="font-size:10px;color:#B23A2E">Remarques</div>' +
        '</div>' +
      '</div>' +

      (items.length ?
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9C9186;margin-bottom:10px">Par entreprise</div>' +
        items.map(function(item) {
          return '<div style="background:#fff;border-radius:12px;padding:14px;border:1px solid ' + item.bg.replace('F', 'E') + ';margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">' +
            '<div>' +
              '<div style="font-size:12px;font-weight:700">' + escapeHTML(item.entreprise) + '</div>' +
              '<div style="font-size:11px;color:' + item.color + ';font-weight:600;margin-top:2px">' + item.label + '</div>' +
            '</div>' +
            '<button data-eid="' + item.eid + '" data-filtre="' + item.type + '" class="btn-voir-ent" style="background:' + item.bg + ';color:' + item.color + ';border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">Voir →</button>' +
          '</div>';
        }).join('') :
        '<div style="text-align:center;padding:40px;color:#9C9186"><div style="font-size:40px;margin-bottom:12px">✅</div><div style="font-size:14px;font-weight:600">Tout est à jour !</div></div>'
      ) +
    '</div>';

  // FIX: guard au lieu de {once:true} — ce noeud est recréé à chaque ouverture
  // de l'onglet mais autant garder la même logique de garde partout.
  if (list.dataset.clickBound !== '1') {
    list.dataset.clickBound = '1';
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
    });
  }
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
  if (CPT.historique.length > 100) CPT.historique = CPT.historique.slice(0, 100);
}

function renderHistorique() {
  const list = el('cpt-ent-content');
  if (!list) return;
  const hist = CPT.historique || [];
  list.innerHTML = '<div style="padding:16px">' +
    '<div style="font-size:14px;font-weight:700;color:#2A2420;margin-bottom:14px">📋 Historique des actions</div>' +
    (hist.length ? hist.map(function(h) {
      return '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #F1EEE8;align-items:flex-start">' +
        '<div style="width:6px;height:6px;border-radius:50%;background:#1F6F72;margin-top:5px;flex-shrink:0"></div>' +
        '<div>' +
          '<div style="font-size:12px;font-weight:600;color:#2A2420">' + escapeHTML(h.action) + '</div>' +
          '<div style="font-size:10px;color:#9C9186;margin-top:2px">' + h.date + ' · ' + escapeHTML(h.comptable) + '</div>' +
        '</div>' +
      '</div>';
    }).join('') : '<div style="text-align:center;color:#9C9186;padding:40px">Aucune action enregistrée</div>') +
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
    if (critere === 'nom') return (a.profil?.raison || a.entreprise_email || '').localeCompare(b.profil?.raison || b.entreprise_email || '');
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

  const statutColor = { en_attente:'#B8860B', acceptee:'#6E8F4E', refusee:'#B23A2E', revoquee:'#9C9186', archivee:'#9C9186' };
  const statutLabel = { en_attente:'⏳ En attente', acceptee:'✅ Active', refusee:'❌ Refusée', revoquee:'🚫 Révoquée', archivee:'📦 Archivée' };

  box.innerHTML = '<div style="width:40px;height:4px;background:#E3DCCF;border-radius:2px;margin:0 auto 20px"></div>' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:16px">🏢 Mes entreprises</div>' +
    '<div style="background:#FBF0DA;border-radius:14px;padding:16px;margin-bottom:16px">' +
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#1F6F72;margin-bottom:10px">Inviter une entreprise</div>' +
      '<input id="invite-ent-email" style="width:100%;padding:10px;border:1.5px solid #E8D9AE;border-radius:10px;font-size:13px;font-family:inherit;box-sizing:border-box;margin-bottom:8px" type="email" placeholder="email@entreprise.ma">' +
      '<button id="btn-send-invite-ent" style="width:100%;padding:11px;background:#1F6F72;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📧 Envoyer l\'invitation</button>' +
    '</div>' +
    '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9C9186;margin-bottom:10px">Portefeuille (' + invites.length + ')</div>' +
    invites.map(function(inv) {
      const nomAffiche = nomEntreprise(inv.entreprise_id, inv.entreprise_email);
      return '<div style="background:#fff;border-radius:12px;border:1px solid #EAE4DA;padding:14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:600">' + escapeHTML(nomAffiche) + '</div>' +
          '<div style="font-size:11px;margin-top:2px;color:' + (statutColor[inv.statut] || '#6B5F54') + ';font-weight:600">' + (statutLabel[inv.statut] || inv.statut) + '</div>' +
        '</div>' +
        (inv.statut === 'acceptee' ?
          '<button data-inv="' + inv.id + '" data-action="archiver" class="btn-inv-action" style="background:#EAE4DA;color:#6B5F54;border:none;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:inherit">Archiver</button>' :
          inv.statut === 'en_attente' ?
          '<button data-inv="' + inv.id + '" data-action="revoquer" class="btn-inv-action" style="background:#F5E4E1;color:#B23A2E;border:none;border-radius:8px;padding:6px 10px;font-size:11px;cursor:pointer;font-family:inherit">Annuler</button>' : ''
        ) +
      '</div>';
    }).join('') +
    '<button id="btn-close-gestion" style="width:100%;margin-top:12px;padding:12px;background:#EAE4DA;color:#6B5F54;border:none;border-radius:10px;font-size:13px;cursor:pointer;font-family:inherit">Fermer</button>';

  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  overlay.appendChild(box);
  document.body.appendChild(overlay);

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

function _cptEmptyState() {
  return '<div style="margin:16px;background:#FBF0DA;border-radius:16px;padding:20px;text-align:center">' +
    '<div style="font-size:32px;margin-bottom:10px">🤝</div>' +
    '<div style="font-size:14px;font-weight:700;color:#1F6F72;margin-bottom:6px">Aucune entreprise</div>' +
    '<div style="font-size:12px;color:#6B5F54;margin-bottom:14px">Invitez vos clients depuis votre profil</div>' +
    '<button class="btn-go-profil-cpt" style="padding:11px 20px;background:#1F6F72;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Inviter</button>' +
  '</div>';
}

function switchCptNav(tab) {
  ['dashboard','entreprises','traiter','historique','activite','notifs'].forEach(function(t) {
    const btn = document.getElementById('cpt-nav-' + t);
    if (!btn) return;
    if (t === tab) {
      btn.style.background = 'rgba(255,255,255,0.9)';
      btn.style.color = '#1F6F72';
    } else {
      btn.style.background = 'rgba(255,255,255,0.15)';
      btn.style.color = 'rgba(255,255,255,0.7)';
    }
  });

  const content = el('cpt-main-content');
  if (!content) return;

  if (tab === 'dashboard') {
    const totalFac = (CPT.allFactures || []).length;
    const nonLettres = totalFac - (CPT.allControles || []).filter(function(c){return c.lettre;}).length;
    const tvaKo = totalFac - (CPT.allControles || []).filter(function(c){return c.tva_verifie;}).length;
    const entAction = (CPT.entreprises || []).filter(function(e){return e._etat==='rouge';}).length;
    const docsAControler = totalFac - (CPT.allControles || []).filter(function(c){return c.consulte;}).length;
    const nbEnts = (CPT.entreprises||[]).length;

    content.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:16px 16px 8px">' +
        kpiBox(nbEnts, 'Entreprises', '#1F6F72', '#FBF0DA') +
        kpiBox(docsAControler, 'À contrôler', '#C9971F', '#E9F4F3') +
        kpiBox(nonLettres, 'Non lettrées', '#B8860B', '#F7EFDC') +
        kpiBox(tvaKo, 'TVA à vérifier', '#7C5CA6', '#EDE6F0') +
      '</div>' +

      (nbEnts === 0 ? _cptEmptyState() : '') +

      '<div style="padding:0 16px 4px;display:flex;justify-content:space-between;align-items:center">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9C9186">Mes entreprises</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="btn-tri-action" style="font-size:10px;padding:4px 8px;border:none;border-radius:8px;background:#FBF0DA;color:#1F6F72;cursor:pointer;font-family:inherit;font-weight:600">Priorité</button>' +
          '<button class="btn-tri-lettrage" style="font-size:10px;padding:4px 8px;border:none;border-radius:8px;background:#EAE4DA;color:#6B5F54;cursor:pointer;font-family:inherit">Lettrage</button>' +
          '<button class="btn-tri-nom" style="font-size:10px;padding:4px 8px;border:none;border-radius:8px;background:#EAE4DA;color:#6B5F54;cursor:pointer;font-family:inherit">Nom</button>' +
        '</div>' +
      '</div>' +
      '<div id="cpt-entreprises-list" style="padding:0 16px"></div>';

    renderListeEntreprises();
    content.addEventListener('click', function(e) {
      if (e.target.closest('.btn-go-profil-cpt')) { renderComptableProfil(); goScreen('comptable-profil', null); }
      if (e.target.closest('.btn-tri-action')) { trierEntreprises('action'); }
      if (e.target.closest('.btn-tri-lettrage')) { trierEntreprises('lettrage'); }
      if (e.target.closest('.btn-tri-nom')) { trierEntreprises('nom'); }
    });
  } else if (tab === 'entreprises') {
    content.innerHTML =
      '<div style="padding:16px">' +
        '<div style="display:flex;gap:8px;margin-bottom:14px">' +
          '<button onclick="trierEntreprises(\'action\')" style="flex:1;padding:8px;border:none;border-radius:10px;background:#FBF0DA;color:#1F6F72;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">🔴 Priorité</button>' +
          '<button onclick="trierEntreprises(\'lettrage\')" style="flex:1;padding:8px;border:none;border-radius:10px;background:#F7EFDC;color:#B8860B;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">Lettrage ↑</button>' +
          '<button onclick="trierEntreprises(\'tva\')" style="flex:1;padding:8px;border:none;border-radius:10px;background:#EDE6F0;color:#7C5CA6;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">TVA ↑</button>' +
          '<button onclick="trierEntreprises(\'nom\')" style="flex:1;padding:8px;border:none;border-radius:10px;background:#EAE4DA;color:#6B5F54;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit">A-Z</button>' +
        '</div>' +
      '</div>' +
      '<div id="cpt-entreprises-list" style="padding:0 16px"></div>' +
      '<div style="padding:12px 16px">' +
        '<button onclick="ouvrirGestionEntreprises()" style="width:100%;padding:12px;background:#1F6F72;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">➕ Inviter une entreprise</button>' +
      '</div>';
    renderListeEntreprises();

  } else if (tab === 'traiter') {
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

  } else if (tab === 'activite') {
    const tmp = document.createElement('div');
    tmp.id = 'cpt-ent-content';
    content.innerHTML = '';
    content.appendChild(tmp);
    renderActiviteClients();

  } else if (tab === 'notifs') {
    renderNotificationsComptable();
  }
}

function kpiBox(val, label, color, bg) {
  return '<div style="background:' + bg + ';border-radius:14px;padding:14px;text-align:center;border:1px solid ' + color + '20">' +
    '<div style="font-size:26px;font-weight:900;color:' + color + '">' + val + '</div>' +
    '<div style="font-size:10px;color:' + color + ';font-weight:600;margin-top:2px">' + label + '</div>' +
  '</div>';
}

function renderComptableDashboard() {
  const email = sb.user?.email || '';
  const nom = sb.user?.user_metadata?.nom || email.split('@')[0] || 'Comptable';
  const cabinet = sb.user?.user_metadata?.cabinet || '';

  const av = el('comptable-avatar');
  if (av) av.textContent = nom.split(' ').slice(0, 2).map(function(w){return w[0]||'';}).join('').toUpperCase() || 'C';
  setEl('cpt-nom-display', nom + (cabinet ? ' · ' + cabinet : ''));
  setEl('cpt-email-display', email);
  setEl('cpt-nb-entreprises', (CPT.entreprises||[]).length + ' entreprise(s)');
  chargerNotificationsComptable();

  CPT.entreprises.forEach(function(inv) {
    inv._remarques = inv._remarques || [];
  });

  switchCptNav('dashboard');
}

// ============================================================
// MODE ENTREPRISE POUR LE COMPTABLE
// ============================================================

async function basculerModeEntreprise() {
  // Le comptable bascule vers l'interface entreprise — ses propres données
  CPT.modeEntreprise = true;

  if (!STATE.factures || !STATE.factures.length) {
    showToast('\u23f3 Chargement...', 'success');
    await loadAll();
  }

  // Pill flottante discrète (remplace l'ancienne bannière pleine largeur)
  appendModeBanner();

  goScreen('dashboard');
}

function revenirEspaceComptable() {
  CPT.modeEntreprise = false;
  document.getElementById('cpt-mode-pill')?.remove();
  document.getElementById('mode-entreprise-banner')?.remove(); // nettoyage legacy si présent
  document.body.style.paddingTop = '';
  STATE.factures = []; STATE.devis = []; STATE.clients = [];
  STATE.produits = []; STATE.avoirs = []; STATE.achats = [];
  goScreen('comptable');
}


// ============================================================
// ACTIVITÉ EN TEMPS RÉEL DES CLIENTS
// ============================================================

async function renderActiviteClients() {
  const list = el('cpt-ent-content');
  if (!list) return;

  list.innerHTML = '<div style="padding:16px"><div style="font-size:14px;font-weight:700;color:#2A2420;margin-bottom:14px">🔴 Activité récente</div><div style="text-align:center;padding:20px;color:#9C9186">⏳ Chargement...</div></div>';

  try {
    const ids = (CPT.entreprises || []).map(function(e) { return e.entreprise_id; });
    if (!ids.length) {
      list.innerHTML = '<div class="empty"><div class="empty-ico">📡</div><div class="empty-title">Aucune entreprise</div></div>';
      return;
    }

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - 7);
    const dateLimitStr = dateLimit.toISOString().split('T')[0];

    const [recentFac, recentDev] = await Promise.all([
      fetch(SUPABASE_URL + '/rest/v1/factures?user_id=in.(' + ids.join(',') + ')&created_at=gte.' + dateLimitStr + '&order=created_at.desc&limit=50&select=*',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }).then(function(r) { return r.json(); }),
      fetch(SUPABASE_URL + '/rest/v1/devis?user_id=in.(' + ids.join(',') + ')&created_at=gte.' + dateLimitStr + '&order=created_at.desc&limit=30&select=*',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }).then(function(r) { return r.json(); }),
    ]);

    const events = [];

    (recentFac || []).forEach(function(f) {
      const inv = (CPT.entreprises || []).find(function(e) { return e.entreprise_id === f.user_id; });
      const entreprise = inv?.profil?.raison || inv?.entreprise_email || 'Entreprise';
      events.push({ date: f.created_at, type: 'facture', icon: '🧾', label: 'Nouvelle facture ' + (f.ref || ''), sous: f.client || '', montant: fmt(f.ttc || 0) + ' MAD', entreprise: entreprise, statut: f.statut, eid: f.user_id });
    });

    (recentDev || []).forEach(function(d) {
      const inv = (CPT.entreprises || []).find(function(e) { return e.entreprise_id === d.user_id; });
      const entreprise = inv?.profil?.raison || inv?.entreprise_email || 'Entreprise';
      events.push({ date: d.created_at, type: 'devis', icon: '📝', label: 'Nouveau devis ' + (d.ref || ''), sous: d.client || '', montant: fmt(d.ttc || 0) + ' MAD', entreprise: entreprise, statut: d.statut, eid: d.user_id });
    });

    events.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    if (!events.length) {
      list.innerHTML = '<div class="empty"><div class="empty-ico">📡</div><div class="empty-title">Aucune activité récente</div><div>Rien de nouveau ces 7 derniers jours</div></div>';
      return;
    }

    const statutColor = { payee: '#6E8F4E', attente: '#B8860B', retard: '#B23A2E', brouillon: '#9C9186', envoyee: '#C9971F', accepte: '#6E8F4E', refuse: '#B23A2E' };
    const statutLabel = { payee: 'Payée', attente: 'En attente', retard: 'En retard', brouillon: 'Brouillon', envoyee: 'Envoyée', accepte: 'Accepté', refuse: 'Refusé' };

    list.innerHTML = '<div style="padding:16px">' +
      '<div style="font-size:14px;font-weight:700;color:#2A2420;margin-bottom:4px">📡 Activité récente</div>' +
      '<div style="font-size:11px;color:#9C9186;margin-bottom:14px">7 derniers jours · ' + events.length + ' événement(s)</div>' +
      events.map(function(ev) {
        const dateStr = new Date(ev.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        return '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #F1EEE8;align-items:flex-start">' +
          '<div style="width:36px;height:36px;border-radius:10px;background:#F1EEE8;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">' + ev.icon + '</div>' +
          '<div style="flex:1">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
              '<div>' +
                '<div style="font-size:12px;font-weight:700;color:#2A2420">' + escapeHTML(ev.label) + '</div>' +
                '<div style="font-size:11px;color:#6B5F54;margin-top:1px">' + escapeHTML(ev.entreprise) + ' · ' + escapeHTML(ev.sous) + '</div>' +
              '</div>' +
              '<div style="text-align:right;flex-shrink:0">' +
                '<div style="font-size:12px;font-weight:700;color:#2A2420">' + ev.montant + '</div>' +
                '<div style="font-size:9px;color:' + (statutColor[ev.statut] || '#9C9186') + ';font-weight:600">' + (statutLabel[ev.statut] || ev.statut || '') + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="font-size:10px;color:#9C9186;margin-top:3px">' + dateStr + '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';

  } catch(e) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#B23A2E">Erreur: ' + e.message + '</div>';
  }
}

// ============================================================
// DÉCLARATION TVA MENSUELLE (notifie l'entreprise)
// ============================================================

async function declarerTVAMois(mois) {
  if (!mois) {
    const now = new Date();
    mois = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }
  if (!confirm('Déclarer la TVA vérifiée pour ' + mois + ' ? L\'entreprise sera notifiée.')) return;

  const uid = sb.user?.id;
  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';
  const email = sb.user?.email;

  try {
    const facsMois = (CPT.currentFactures || []).filter(function(f) {
      return (f.date_emission || '').startsWith(mois);
    });

    for (let i = 0; i < facsMois.length; i++) {
      const fac = facsMois[i];
      await sauvegarderControle(fac.id, {
        tva_verifie: true,
        tva_verifie_at: new Date().toISOString(),
        tva_verifie_par: nom
      });
    }

    const tvaTotale = facsMois.filter(function(f) { return f.statut === 'payee'; })
      .reduce(function(s, f) { return s + (Number(f.tva) || 0); }, 0);

    // FIX: destinataire_email manquant — la notification n'apparaissait jamais
    // côté entreprise car genNotifications() filtre justement sur ce champ.
    const inv = CPT.entreprises.find(function(e) { return e.entreprise_id === CPT.currentEntrepriseId; });
    const destinataireEmail = inv?.entreprise_email || '';

    await fetch(SUPABASE_URL + '/rest/v1/notifications_app', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        user_id: CPT.currentEntrepriseId,
        destinataire_email: destinataireEmail ? destinataireEmail.toLowerCase() : null,
        type: 'tva_declaree',
        titre: 'TVA vérifiée — ' + mois,
        corps: 'Votre comptable ' + nom + ' a vérifié la TVA de ' + mois + '. TVA collectée : ' + fmt(tvaTotale) + ' MAD sur ' + facsMois.length + ' facture(s).',
        lue: false
      })
    });

    ajouterHistorique('TVA déclarée — ' + mois + ' (' + facsMois.length + ' factures)', '');
    showToast('✅ TVA ' + mois + ' déclarée et entreprise notifiée !', 'success');
    renderCptTVA();

  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ============================================================
// REMARQUES COMPTABLE
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
      const fac = (CPT.currentFactures || []).find(function(f) { return f.id === factureId; });
      // FIX: destinataire_email manquant ici aussi
      const inv = CPT.entreprises.find(function(e) { return e.entreprise_id === CPT.currentEntrepriseId; });
      const destinataireEmail = inv?.entreprise_email || '';

      await fetch(SUPABASE_URL + '/rest/v1/notifications_app', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id: CPT.currentEntrepriseId,
          destinataire_email: destinataireEmail ? destinataireEmail.toLowerCase() : null,
          type: 'remarque_comptable',
          titre: 'Remarque comptable',
          corps: 'Votre comptable a ajouté une remarque sur la facture ' + (fac?.ref || ''),
          facture_id: factureId,
          lue: false
        })
      });
      ajouterHistorique('Remarque ajoutée — ', factureId);
      if (el('nouvelle-remarque')) el('nouvelle-remarque').value = '';
      showToast('✅ Remarque ajoutée', 'success');
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
    ajouterHistorique('Remarque résolue', '');
    showToast('✅ Remarque résolue', 'success');
    const factureId = CPT.currentFactureId;
    document.getElementById('fac-comptable-overlay')?.remove();
    await ouvrirFactureComptable(factureId);
  } catch(e) {
    showToast('Erreur', 'error');
  }
}

// ============================================================
// RELEVES BANCAIRES VUE COMPTABLE
// ============================================================

async function renderCptReleves() {
  const list = el('cpt-ent-content');
  if (!list) return;
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#9C9186">Chargement...</div>';
  try {
    const resp = await fetch(
      SUPABASE_URL + '/rest/v1/releves_bancaires?user_id=eq.' + CPT.currentEntrepriseId + '&order=annee.desc,mois.desc',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    const releves = await resp.json() || [];
    const moisLabels = ['','Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
    if (!releves.length) {
      list.innerHTML = '<div class="empty"><div class="empty-ico">🏦</div><div class="empty-title">Aucun releve</div><div>Aucun releve partage</div></div>';
      return;
    }
    list.innerHTML = '<div style="padding:16px">' +
      '<div style="font-size:14px;font-weight:700;margin-bottom:14px">🏦 Releves bancaires</div>' +
      releves.map(function(rv) {
        return '<div style="background:#fff;border-radius:14px;padding:14px;border:1px solid #E3DCCF;margin-bottom:10px;display:flex;align-items:center;gap:12px">' +
          '<div style="width:44px;height:44px;border-radius:12px;background:#EEF3E4;display:flex;align-items:center;justify-content:center;font-size:22px">🏦</div>' +
          '<div style="flex:1">' +
            '<div style="font-size:13px;font-weight:700">' + (moisLabels[parseInt(rv.mois)] || rv.mois) + ' ' + rv.annee + '</div>' +
            '<div style="font-size:11px;color:#6B5F54">' + escapeHTML(rv.banque || '') + '</div>' +
          '</div>' +
          '<span data-rid="' + rv.id + '" class="badge-releve" style="font-size:10px;padding:2px 8px;border-radius:6px;font-weight:600;cursor:pointer;background:' + (rv.vu_par_comptable ? '#EEF3E4' : '#F7EFDC') + ';color:' + (rv.vu_par_comptable ? '#6E8F4E' : '#B8860B') + '">' + (rv.vu_par_comptable ? 'Vu' : 'Marquer vu') + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
    list.addEventListener('click', async function handler(ev) {
      const badge = ev.target.closest('.badge-releve');
      if (!badge || badge.textContent === 'Vu') return;
      const rid = badge.dataset.rid;
      await fetch(SUPABASE_URL + '/rest/v1/releves_bancaires?id=eq.' + rid, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ vu_par_comptable: true })
      });
      badge.textContent = 'Vu';
      badge.style.background = '#EEF3E4';
      badge.style.color = '#6E8F4E';
      showToast('Releve marque comme vu', 'success');
    });
  } catch(ex) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#B23A2E">Erreur: ' + ex.message + '</div>';
  }
}

// ============================================================
// DETAIL FACTURE VUE COMPTABLE
// ============================================================

async function ouvrirFactureComptable(factureId) {
  const fac = (CPT.currentFactures || []).find(function(f) { return String(f.id) === String(factureId); });
  if (!fac) return;

  CPT.currentFactureId = factureId;

  const ctrl = (CPT.currentControles || []).find(function(c2) { return String(c2.facture_id) === String(factureId); }) || {};
  if (!ctrl.consulte) {
    await sauvegarderControle(factureId, { consulte: true, consulte_at: new Date().toISOString() });
  }

  let remarques = [];
  try {
    const resp = await fetch(
      SUPABASE_URL + '/rest/v1/remarques_comptable?facture_id=eq.' + factureId + '&order=created_at.desc',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    remarques = await resp.json() || [];
  } catch(e2) {}

  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';
  const ctrlFresh = (CPT.currentControles || []).find(function(c3) { return String(c3.facture_id) === String(factureId); }) || {};

  const overlay = document.createElement('div');
  overlay.id = 'fac-comptable-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#F1EEE8;overflow-y:auto;font-family:inherit';

  overlay.innerHTML =
    '<div style="background:linear-gradient(135deg,#241F1B,#1F6F72);padding:14px 20px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10">' +
      '<button class="close-fac-overlay" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">←</button>' +
      '<div style="flex:1"><div style="font-size:14px;font-weight:700;color:#fff">' + escapeHTML(fac.ref || '') + '</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.5)">' + escapeHTML(fac.client || '') + '</div></div>' +
      '<button class="btn-voir-pdf-cpt" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">📄 PDF</button>' +
    '</div>' +

    '<div style="margin:14px;background:#fff;border-radius:14px;padding:14px;border:1px solid #E3DCCF">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:10px">' +
        '<div><div style="font-size:10px;color:#9C9186">Date</div><div style="font-size:12px;font-weight:600">' + (fac.date_emission || '') + '</div></div>' +
        '<div><div style="font-size:10px;color:#9C9186">TTC</div><div style="font-size:18px;font-weight:800">' + fmt(fac.ttc || 0) + ' MAD</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<div style="flex:1;background:#F1EEE8;border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:#9C9186">HT</div><div style="font-size:12px;font-weight:600">' + fmt(fac.ht || 0) + '</div></div>' +
        '<div style="flex:1;background:#EDE6F0;border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:#7C5CA6">TVA</div><div style="font-size:12px;font-weight:600;color:#7C5CA6">' + fmt(fac.tva || 0) + '</div></div>' +
      '</div>' +
    '</div>' +

    '<div style="margin:0 14px 14px;background:#fff;border-radius:14px;padding:14px;border:1px solid #E3DCCF">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:12px">Checklist</div>' +
      '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #EAE4DA">' +
        '<div><div style="font-size:12px;font-weight:600">Lettrage</div></div>' +
        '<button id="btn-lettrage-ov" class="btn-lettr-ov" style="width:32px;height:32px;border-radius:8px;border:2px solid ' + (ctrlFresh.lettre ? '#B8860B' : '#E3DCCF') + ';background:' + (ctrlFresh.lettre ? '#F7EFDC' : '#fff') + ';font-size:16px;cursor:pointer;font-family:inherit">' + (ctrlFresh.lettre ? '☑' : '☐') + '</button>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;padding:10px 0">' +
        '<div><div style="font-size:12px;font-weight:600">TVA verifiee</div></div>' +
        '<button id="btn-tva-ov" class="btn-tva-ov" style="width:32px;height:32px;border-radius:8px;border:2px solid ' + (ctrlFresh.tva_verifie ? '#7C5CA6' : '#E3DCCF') + ';background:' + (ctrlFresh.tva_verifie ? '#EDE6F0' : '#fff') + ';font-size:16px;cursor:pointer;font-family:inherit">' + (ctrlFresh.tva_verifie ? '☑' : '☐') + '</button>' +
      '</div>' +
    '</div>' +

    '<div style="margin:0 14px 14px;background:#fff;border-radius:14px;padding:14px;border:1px solid #E3DCCF">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:10px">Remarques</div>' +
      '<div id="remarques-list-ov">' +
        (remarques.length ? remarques.map(function(rem) {
          return '<div style="background:' + (rem.statut === 'resolue' ? '#EEF3E4' : '#F7EFDC') + ';border-radius:10px;padding:10px;margin-bottom:8px">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
              '<span style="font-size:11px;font-weight:600;color:' + (rem.statut === 'resolue' ? '#6E8F4E' : '#B8860B') + '">' + escapeHTML(rem.comptable_nom || '') + '</span>' +
              (rem.statut !== 'resolue' ? '<button class="btn-resoudre" data-rid="' + rem.id + '" style="background:#6E8F4E;color:#fff;border:none;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;font-family:inherit">Resoudre</button>' : '<span style="font-size:10px;color:#6E8F4E">Resolu</span>') +
            '</div>' +
            '<div style="font-size:12px">' + escapeHTML(rem.contenu) + '</div>' +
          '</div>';
        }).join('') : '<div style="text-align:center;color:#9C9186;font-size:12px;padding:8px">Aucune remarque</div>') +
      '</div>' +
      '<textarea id="nouvelle-remarque" style="width:100%;padding:10px;border:1.5px solid #E3DCCF;border-radius:10px;font-size:13px;font-family:inherit;resize:none;margin-top:10px;box-sizing:border-box" rows="2" placeholder="Ajouter une remarque..."></textarea>' +
      '<button class="btn-ajouter-remarque" style="width:100%;margin-top:8px;padding:10px;background:#1F6F72;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Ajouter</button>' +
    '</div>' +
    '<div style="height:40px"></div>';

  document.body.appendChild(overlay);
  overlay.querySelector('.close-fac-overlay').onclick = function() { overlay.remove(); };
  overlay.querySelector('.btn-voir-pdf-cpt').onclick = function() { ouvrirPDFComptable(fac, CPT.currentProfil || {}); };
  var _btnL = overlay.querySelector('.btn-lettr-ov');
  if (_btnL) _btnL.onclick = function() { toggleLettrage(factureId); };
  var _btnT = overlay.querySelector('.btn-tva-ov');
  if (_btnT) _btnT.onclick = function() { toggleTVA(factureId); };
  overlay.addEventListener('click', function(ev) {
    var _br = ev.target.closest('.btn-resoudre');
    if (_br) resoudreRemarque(_br.dataset.rid);
    var _ba = ev.target.closest('.btn-ajouter-remarque');
    if (_ba) ajouterRemarque(factureId);
  });
}

// ============================================================
// CONTRÔLE DEPUIS DÉTAIL FACTURE (avec confirmation)
// ============================================================

async function sauvegarderControle(factureId, data) {
  const uid = sb.user?.id;
  if (!uid) return;

  // FIX: utilise une fonction RPC SECURITY DEFINER (contourne toute la RLS,
  // avec sa propre vérification d'autorisation interne) au lieu d'un accès
  // direct à la table — après plusieurs échecs à deviner les policies RLS
  // à distance, c'est l'approche la plus fiable pour garantir que
  // l'écriture ET la lecture fonctionnent, quelle que soit la RLS existante.
  const champ = ('lettre' in data) ? 'lettre' : ('tva_verifie' in data) ? 'tva_verifie' : ('consulte' in data) ? 'consulte' : null;
  if (!champ) { console.warn('sauvegarderControle: champ non reconnu', data); return; }
  const valeur = !!data[champ];

  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/toggle_controle_facture', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_facture_id: String(factureId),
        p_entreprise_id: CPT.currentEntrepriseId,
        p_champ: champ,
        p_valeur: valeur
      })
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(function() { return ''; });
      console.error('sauvegarderControle (RPC) a échoué:', resp.status, errText);
      if (resp.status === 404) {
        showToast('⛔ Fonction RPC introuvable — exécute migration_phase8_rpc_controles.sql', 'error');
      } else {
        showToast('❌ Erreur: ' + (errText || resp.status), 'error');
      }
      return;
    }

    const resultat = await resp.json();
    if (!resultat) {
      console.error('sauvegarderControle (RPC): réponse vide — la ligne n\'a peut-être pas été trouvée/mise à jour');
      showToast('⚠️ Aucune confirmation reçue — vérifie en base', 'error');
      return;
    }

    // Update local state à partir de la ligne réellement renvoyée par la BDD
    // (source de vérité, plus fiable qu'une simple supposition optimiste)
    if (!CPT.currentControles) CPT.currentControles = [];
    const local = CPT.currentControles.find(function(c2) { return String(c2.facture_id) === String(factureId); });
    if (local) { Object.assign(local, resultat); }
    else { CPT.currentControles.push(resultat); }

    const inv = CPT.entreprises.find(function(e) { return e.entreprise_id === CPT.currentEntrepriseId; });
    if (inv) {
      if (!inv._controles) inv._controles = [];
      const lc = inv._controles.find(function(c3) { return String(c3.facture_id) === String(factureId); });
      if (lc) { Object.assign(lc, resultat); }
      else { inv._controles.push(resultat); }
      inv._etat = calculerEtat(inv);
    }
    if (!CPT.allControles) CPT.allControles = [];
    const globalCtrl = CPT.allControles.find(function(c4) { return String(c4.facture_id) === String(factureId); });
    if (globalCtrl) { Object.assign(globalCtrl, resultat); }
    else { CPT.allControles.push(resultat); }

  } catch(e) {
    showToast('Erreur sauvegarde: ' + e.message, 'error');
  }
}

async function toggleLettrage(factureId) {
  const ctrl = (CPT.currentControles || []).find(function(c2) { return String(c2.facture_id) === String(factureId); }) || {};
  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';

  if (ctrl.lettre) {
    if (!confirm('Voulez-vous retirer le lettrage de cette facture ?')) return;
    await sauvegarderControle(factureId, { lettre: false, lettre_at: null, lettre_par: null });
    const btn = document.getElementById('btn-lettrage-ov');
    if (btn) { btn.textContent = '☐'; btn.style.borderColor = '#E3DCCF'; btn.style.background = '#fff'; }
    ajouterHistorique('Lettrage retiré — ', factureId);
    showToast('Lettrage retiré', 'success');
  } else {
    const now = new Date().toISOString();
    await sauvegarderControle(factureId, { lettre: true, lettre_at: now, lettre_par: nom });
    const btn = document.getElementById('btn-lettrage-ov');
    if (btn) { btn.textContent = '☑'; btn.style.borderColor = '#B8860B'; btn.style.background = '#F7EFDC'; }
    ajouterHistorique('Lettrage effectué — ', factureId);
    showToast('☑ Lettrage enregistré', 'success');
  }
}

async function toggleTVA(factureId) {
  const ctrl = (CPT.currentControles || []).find(function(c2) { return String(c2.facture_id) === String(factureId); }) || {};
  const nom = sb.user?.user_metadata?.nom || sb.user?.email?.split('@')[0] || 'Comptable';

  if (ctrl.tva_verifie) {
    await sauvegarderControle(factureId, { tva_verifie: false, tva_verifie_at: null, tva_verifie_par: null });
    const btn = document.getElementById('btn-tva-ov');
    if (btn) { btn.textContent = '☐'; btn.style.borderColor = '#E3DCCF'; btn.style.background = '#fff'; }
    ajouterHistorique('TVA non vérifiée — ', factureId);
    showToast('TVA non vérifiée', 'success');
  } else {
    const now = new Date().toISOString();
    await sauvegarderControle(factureId, { tva_verifie: true, tva_verifie_at: now, tva_verifie_par: nom });
    const btn = document.getElementById('btn-tva-ov');
    if (btn) { btn.textContent = '☑'; btn.style.borderColor = '#7C5CA6'; btn.style.background = '#EDE6F0'; }
    ajouterHistorique('TVA vérifiée — ', factureId);
    showToast('☑ TVA vérifiée', 'success');
  }
}

// ============================================================
// PROFIL COMPTABLE — QR + PARTAGE + INVITATION
// ============================================================

function renderComptableProfil() {
  const user = sb.user;
  if (!user) return;
  const meta = user.user_metadata || {};
  const nom = meta.nom || user.email?.split('@')[0] || 'Comptable';
  const cabinet = meta.cabinet || '';
  const email = user.email || '';
  const uid = user.id || '';

  const av = el('cpt-profil-av');
  if (av) av.textContent = nom.split(' ').slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase() || 'C';
  setEl('cpt-profil-nom', nom);
  setEl('cpt-profil-cabinet', cabinet ? '🏛️ ' + cabinet : 'Comptable BaniPay');
  setEl('cpt-profil-email', email);

  const lienId = 'CPT-' + uid.substr(0,8).toUpperCase();
  const lien = window.location.origin + window.location.pathname + '?comptable=' + lienId;
  setEl('cpt-lien-display', lien);

  const qrContainer = el('cpt-qr-container');
  if (qrContainer) {
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent(lien);
    qrContainer.innerHTML = '<img src="' + qrUrl + '" style="border-radius:10px;border:3px solid #FBF0DA" width="140" height="140">';
  }

  const infos = el('cpt-profil-infos');
  if (infos) {
    const rows = [
      ['Nom', nom], ['Cabinet', cabinet], ['Email', email],
      ['Spécialité', meta.specialite || ''], ['Téléphone', meta.tel || '']
    ].filter(function(r) { return r[1]; });
    infos.innerHTML = rows.map(function(r) {
      return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1EEE8;font-size:12px">' +
        '<span style="color:#9C9186">' + r[0] + '</span>' +
        '<span style="font-weight:600">' + escapeHTML(String(r[1])) + '</span>' +
      '</div>';
    }).join('');
  }

  window._cptLien = lien;
}

function partagerProfilComptable() {
  const lien = window._cptLien || el('cpt-lien-display')?.textContent;
  if (!lien) return;
  const nom = sb.user?.user_metadata?.nom || 'Comptable';
  if (navigator.share) {
    navigator.share({ title: nom + ' — BaniPay Comptable', text: 'Voici le profil de votre comptable BaniPay : ' + nom, url: lien })
      .catch(function() { navigator.clipboard?.writeText(lien); showToast('Lien copié !', 'success'); });
  } else {
    navigator.clipboard?.writeText(lien);
    showToast('✅ Lien copié !', 'success');
  }
}

function copierLienComptable() {
  const lien = window._cptLien || el('cpt-lien-display')?.textContent;
  if (!lien) return;
  navigator.clipboard?.writeText(lien);
  showToast('✅ Lien copié !', 'success');
}

async function envoyerInvitationDepuisProfil() {
  const emailEnt = (document.getElementById('cpt-invite-email')?.value || '').trim().toLowerCase();
  if (!emailEnt || !emailEnt.includes('@')) { showToast('Email invalide', 'error'); return; }
  const emailCpt = sb.user?.email;
  const nomCpt = sb.user?.user_metadata?.nom || emailCpt;

  try {
    await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        comptable_email: emailCpt,
        entreprise_email: emailEnt,
        statut: 'en_attente',
        sens: 'comptable_vers_entreprise'
      })
    });

    await fetch(SUPABASE_URL + '/rest/v1/notifications_app', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        user_id: sb.user?.id,
        destinataire_email: emailEnt,
        type: 'invitation_comptable',
        titre: 'Invitation de votre comptable',
        corps: nomCpt + ' souhaite accéder à vos documents BaniPay en tant que comptable.',
        meta: JSON.stringify({ comptable_email: emailCpt, nom_comptable: nomCpt }),
        lue: false
      })
    });

    if (document.getElementById('cpt-invite-email')) document.getElementById('cpt-invite-email').value = '';
    showToast('✅ Invitation envoyée ! L\'entreprise sera notifiée.', 'success');

  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

// ============================================================
// MODE DEVIS POUR LE COMPTABLE
// ============================================================

function basculerModeDevis() {
  CPT.modeEntreprise = true;
  if (!STATE.devis || !STATE.devis.length) {
    loadAll().then(function() {
      appendModeBanner();
      goScreen('devis-list');
    });
  } else {
    appendModeBanner();
    goScreen('devis-list');
  }
}

function appendModeBanner() {
  // FIX: un seul bouton de retour désormais — la pile flottante ci-dessous,
  // visible sur tous les écrans (l'ancien bouton topbar n'existait que sur
  // le dashboard, ce qui créait une incohérence entre les écrans).

  // Pill flottante discrète, en bas à droite, sur tous les autres écrans
  document.getElementById('cpt-mode-pill')?.remove();
  const pill = document.createElement('div');
  pill.id = 'cpt-mode-pill';
  pill.style.cssText = 'position:fixed;bottom:90px;right:16px;z-index:9999;background:#1F6F72;color:#fff;border-radius:24px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(67,56,202,0.4);display:flex;align-items:center;gap:6px';
  pill.innerHTML = '📊 Espace comptable';
  pill.onclick = revenirEspaceComptable;
  document.body.appendChild(pill);
}


async function chargerNotificationsComptable() {
  const email = sb.user?.email;
  if (!email) return;

  try {
    const resp = await fetch(
      SUPABASE_URL + '/rest/v1/invitations_comptable?comptable_email=eq.' + encodeURIComponent(email) + '&statut=eq.en_attente&order=created_at.desc',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    const invitations = await resp.json() || [];

    const respN = await fetch(
      SUPABASE_URL + '/rest/v1/notifications_app?destinataire_email=eq.' + encodeURIComponent(email.toLowerCase()) + '&lue=eq.false&order=created_at.desc&limit=20',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    const notifs = await respN.json() || [];

    CPT.invitationsEnAttente = invitations;
    CPT.notifications = notifs;

    const total = invitations.length + notifs.length;
    const badge = document.getElementById('cpt-notif-badge');
    if (badge) {
      badge.textContent = total > 0 ? total : '';
      badge.style.display = total > 0 ? 'flex' : 'none';
    }

    return { invitations, notifs };
  } catch(e) {
    return { invitations: [], notifs: [] };
  }
}

async function renderNotificationsComptable() {
  const content = document.getElementById('cpt-main-content');
  if (!content) return;

  const { invitations, notifs } = await chargerNotificationsComptable();

  content.innerHTML =
    '<div style="padding:16px">' +
      '<div style="font-size:16px;font-weight:700;margin-bottom:16px">🔔 Notifications</div>' +

      (invitations.length ? '<div style="font-size:12px;font-weight:700;color:#1F6F72;text-transform:uppercase;margin-bottom:10px">Invitations en attente</div>' +
        invitations.map(function(inv) {
          return '<div style="background:#FBF0DA;border-radius:14px;padding:16px;margin-bottom:10px;border:1px solid #E8D9AE">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
              '<div style="font-size:24px">🏢</div>' +
              '<div>' +
                '<div style="font-size:13px;font-weight:700">' + escapeHTML(inv.entreprise_email || '') + '</div>' +
                '<div style="font-size:11px;color:#6B5F54">Invite à accéder à ses documents</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px">' +
              '<button class="btn-accept-inv" data-id="' + inv.id + '" data-eid="' + (inv.entreprise_id||'') + '" style="flex:1;padding:10px;background:#6E8F4E;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">✅ Accepter</button>' +
              '<button class="btn-reject-inv" data-id="' + inv.id + '" style="flex:1;padding:10px;background:#F5E4E1;color:#B23A2E;border:none;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">❌ Refuser</button>' +
            '</div>' +
          '</div>';
        }).join('') : '') +

      (notifs.length ? '<div style="font-size:12px;font-weight:700;color:#9C9186;text-transform:uppercase;margin:14px 0 10px">Autres notifications</div>' +
        notifs.map(function(n) {
          return '<div style="background:#fff;border-radius:12px;padding:14px;border:1px solid #E3DCCF;margin-bottom:8px">' +
            '<div style="font-size:13px;font-weight:600;margin-bottom:4px">' + escapeHTML(n.titre||'') + '</div>' +
            '<div style="font-size:12px;color:#6B5F54">' + escapeHTML(n.corps||'') + '</div>' +
          '</div>';
        }).join('') : '') +

      (!invitations.length && !notifs.length ?
        '<div style="text-align:center;padding:40px;color:#9C9186"><div style="font-size:40px;margin-bottom:12px">✅</div><div style="font-size:14px;font-weight:600">Aucune notification</div></div>' : '') +

    '</div>';

  // FIX: garde au lieu de {once:true} — content.innerHTML est réécrit à chaque
  // appel mais le noeud content lui-même persiste ; sans garde, un listener
  // s'ajoutait à chaque fois et {once:true} ne géraient qu'un seul clic total.
  if (content.dataset.notifClickBound !== '1') {
    content.dataset.notifClickBound = '1';
    content.addEventListener('click', async function(e) {
      const btnAccept = e.target.closest('.btn-accept-inv');
      if (btnAccept) {
        const invId = btnAccept.dataset.id;
        const entrepriseId = btnAccept.dataset.eid;
        await accepterInvitationComptable(invId, entrepriseId);
        return;
      }
      const btnReject = e.target.closest('.btn-reject-inv');
      if (btnReject) {
        await refuserInvitationComptable(btnReject.dataset.id);
      }
    });
  }
}
async function accepterInvitationComptable(invId, entrepriseId) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + invId, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'acceptee' })
    });

    if (entrepriseId) {
      await ajouterEntrepriseCommeClient(entrepriseId);
    }

    showToast('✅ Invitation acceptée ! Entreprise ajoutée à vos clients.', 'success');
    await loadComptableApp();
    switchCptNav('dashboard');
  } catch(e) { showToast('Erreur: ' + e.message, 'error'); }
}

async function refuserInvitationComptable(invId) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + invId, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'refusee' })
    });
    showToast('Invitation refusée', 'success');
    renderNotificationsComptable();
  } catch(e) { showToast('Erreur', 'error'); }
}

// ============================================================
// PDF FACTURE VUE COMPTABLE
// ============================================================

function ouvrirPDFComptable(fac, profil) {
  const lignes = typeof fac.lignes === 'string' ? JSON.parse(fac.lignes || '[]') : (fac.lignes || []);
  genDocPDF({
    type: 'FACTURE',
    ref: fac.ref,
    color: '#C9971F',
    emetteur: profil,
    destinataire: { nom: fac.client, chantier: fac.chantier },
    date: fac.date_emission,
    echeance: fac.echeance,
    paiement: fac.paiement,
    statut: fac.statut,
    lignes: lignes,
    note: fac.note || '',
    ht: fac.ht,
    tva: fac.tva,
    ttc: fac.ttc,
    devise: fac.devise || 'MAD',
    montant_recu: fac.montant_recu || 0,
    showStamp: fac.statut === 'payee',
    doc_id: fac.id,
    signatureClient: fac.signature_data || null,
    doc_url: window.location.origin + window.location.pathname + '?doc=' + fac.id,
    badge_lettre: !!(CPT.currentControles || []).find(function(c) { return String(c.facture_id) === String(fac.id) && c.lettre; }),
    badge_tva: !!(CPT.currentControles || []).find(function(c) { return String(c.facture_id) === String(fac.id) && c.tva_verifie; }),
  });
}

// ============================================================
// AUTO-AJOUT ENTREPRISE COMME CLIENT DU COMPTABLE
// ============================================================

async function ajouterEntrepriseCommeClient(entrepriseId) {
  try {
    const resp = await fetch(
      SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + entrepriseId + '&select=*',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    const profils = await resp.json() || [];
    const profil = profils[0];
    if (!profil) return;

    const existResp = await fetch(
      SUPABASE_URL + '/rest/v1/clients?user_id=eq.' + sb.user.id + '&reference_id=eq.' + entrepriseId + '&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    );
    const exist = await existResp.json() || [];
    if (exist.length > 0) return;

    await fetch(SUPABASE_URL + '/rest/v1/clients', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        user_id: sb.user.id,
        nom: profil.raison || profil.email || '',
        email: profil.email || '',
        tel: profil.tel || '',
        adresse: profil.adresse || '',
        ville: profil.ville || '',
        ice: profil.ice || '',
        rc: profil.rc || '',
        note: 'Client BaniPay · ' + (profil.secteur || ''),
        reference_id: entrepriseId,
        type: 'entreprise_banipay'
      })
    });
    console.log('Entreprise ajoutée comme client:', profil.raison);
  } catch(e) {
    console.error('ajouterEntrepriseCommeClient:', e);
  }
}

// ============================================================
// BARRE DE CONTRÔLE FLOTTANTE SUR LE PDF VIEWER
// ============================================================

function attacherControlsToViewer(factureId) {
  const viewer = document.getElementById('pdf-fullscreen');
  if (!viewer) return;

  document.getElementById('pdf-cpt-controls')?.remove();

  const ctrl = (CPT.currentControles || []).find(function(c) { return String(c.facture_id) === String(factureId); }) || {};

  const bar = document.createElement('div');
  bar.id = 'pdf-cpt-controls';
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff;border-top:1px solid #E3DCCF;padding:12px 16px;display:flex;gap:10px;align-items:center;box-shadow:0 -4px 20px rgba(0,0,0,0.1)';
  bar.innerHTML =
    '<button class="btn-l-ctrl" data-fid="' + factureId + '" style="width:44px;height:44px;border-radius:10px;border:none;background:' + (ctrl.lettre ? '#6E8F4E' : '#EAE4DA') + ';color:' + (ctrl.lettre ? '#fff' : '#9C9186') + ';font-size:18px;font-weight:900;cursor:pointer;font-family:inherit">L</button>' +
    '<div style="flex:1">' +
      '<div style="font-size:12px;font-weight:700" id="pdf-ctrl-lettre-txt">' + (ctrl.lettre ? '✓ Lettré' : 'Non lettré') + '</div>' +
      '<div style="font-size:10px;color:#9C9186">' + (ctrl.lettre_at ? new Date(ctrl.lettre_at).toLocaleDateString('fr-FR') : '') + '</div>' +
    '</div>' +
    '<button class="btn-t-ctrl" data-fid="' + factureId + '" style="width:44px;height:44px;border-radius:10px;border:none;background:' + (ctrl.tva_verifie ? '#7C5CA6' : '#EAE4DA') + ';color:' + (ctrl.tva_verifie ? '#fff' : '#9C9186') + ';font-size:18px;font-weight:900;cursor:pointer;font-family:inherit">T</button>' +
    '<div style="flex:1">' +
      '<div style="font-size:12px;font-weight:700" id="pdf-ctrl-tva-txt">' + (ctrl.tva_verifie ? '✓ TVA ok' : 'TVA non vérifiée') + '</div>' +
      '<div style="font-size:10px;color:#9C9186">' + (ctrl.tva_verifie_at ? new Date(ctrl.tva_verifie_at).toLocaleDateString('fr-FR') : '') + '</div>' +
    '</div>' +
    '<button class="btn-open-remarques" style="padding:8px 12px;background:#1F6F72;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">📝 Remarques</button>';

  viewer.appendChild(bar);

  bar.querySelector('.btn-l-ctrl').onclick = async function() {
    await toggleLettrageRapide(factureId, this);
    const txt = document.getElementById('pdf-ctrl-lettre-txt');
    if (txt) txt.textContent = this.dataset.lettre === '1' ? '✓ Lettré' : 'Non lettré';
  };
  bar.querySelector('.btn-t-ctrl').onclick = async function() {
    await toggleTVARapide(factureId, this);
    const txt = document.getElementById('pdf-ctrl-tva-txt');
    if (txt) txt.textContent = this.dataset.tva === '1' ? '✓ TVA ok' : 'TVA non vérifiée';
  };
  var btnRem = bar.querySelector('.btn-open-remarques');
  if (btnRem) btnRem.onclick = function() {
    document.getElementById('pdf-fullscreen')?.remove();
    document.getElementById('pdf-cpt-controls')?.remove();
    ouvrirFactureComptable(factureId);
  };
}
