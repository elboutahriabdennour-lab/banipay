// ZELTO — offres.js — Gestion des forfaits (offres) et fonctionnalités
// ============================================================
// PÉRIMÈTRE : ce module donne à l'app une façon de savoir "est-ce que
// cette entreprise a accès à telle fonctionnalité ?" (via la RPC
// get_mes_features). Il fournit aussi un écran "Mon forfait" en lecture,
// et un point d'accroche générique (verifierAccesFeature) pour verrouiller
// un écran/bouton avec un message d'upgrade clair.
//
// GESTION DES OFFRES : pas d'écran self-service pour changer de forfait
// pour l'instant — ça se gère depuis Supabase Table Editor (colonne
// profils_entreprise.offre_id, et la table entreprise_features_
// supplementaires pour les ajouts à la carte après un devis). Peut
// évoluer vers un vrai écran d'admin plus tard si besoin.

STATE.mesFeatures = STATE.mesFeatures || [];
STATE.toutesOffres = STATE.toutesOffres || [];

async function chargerMesFeatures() {
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_mes_features', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = resp.ok ? ((await resp.json()) || []) : [];
    STATE.mesFeatures = data.map(function(x) { return x.code; });
  } catch(e) { STATE.mesFeatures = []; }
}

// Vrai/faux — l'entreprise a-t-elle accès à cette fonctionnalité ?
function aAccesFeature(code) {
  return (STATE.mesFeatures || []).includes(code);
}

// À appeler en tête d'une action verrouillée (bouton, écran). Si l'accès
// manque, affiche un message clair et bloque l'action ; sinon ne fait
// rien et laisse la suite s'exécuter normalement.
function verifierAccesFeature(code, nomFeature) {
  if (aAccesFeature(code)) return true;
  showToast('🔒 "' + nomFeature + '" n\'est pas inclus dans votre forfait actuel', 'error');
  setTimeout(function() { goScreen('mon-forfait', null); }, 900);
  return false;
}

// ============================================================
// ÉCRAN "MON FORFAIT"
// ============================================================
async function chargerMonForfait() {
  const zone = el('mon-forfait-content');
  if (zone) zone.innerHTML = '<div style="text-align:center;padding:20px;color:#9C9186">⏳ Chargement...</div>';
  await chargerMesFeatures();
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/offres?select=*,offre_features(features(*))&order=ordre.asc', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
    });
    STATE.toutesOffres = r.ok ? ((await r.json()) || []) : [];
  } catch(e) { STATE.toutesOffres = []; }
  renderMonForfait();
}

function renderMonForfait() {
  const zone = el('mon-forfait-content');
  if (!zone) return;
  const offreActuelleId = STATE.profil?.offre_id;
  const offres = STATE.toutesOffres || [];

  if (!offres.length) {
    zone.innerHTML = '<div class="empty"><div class="empty-ico">📦</div><div class="empty-title">Catalogue non disponible</div></div>';
    return;
  }

  zone.innerHTML = offres.map(function(o) {
    const estActuelle = o.id === offreActuelleId;
    const features = (o.offre_features || []).map(function(x) { return x.features; }).filter(Boolean);
    const prixTxt = o.type === 'sur_mesure' ? 'Sur devis' : (Number(o.prix_mensuel) > 0 ? fmt(o.prix_mensuel) + ' MAD/mois' : 'Gratuit');
    return '<div style="background:#fff;border-radius:16px;padding:16px;margin-bottom:12px;border:2px solid ' + (estActuelle ? '#C9971F' : '#E3DCCF') + ';position:relative">' +
      (estActuelle ? '<div style="position:absolute;top:-10px;right:14px;background:#C9971F;color:#fff;font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px">VOTRE FORFAIT</div>' : '') +
      '<div style="font-size:15px;font-weight:800;color:#2A2420">' + escapeHTML(o.nom) + '</div>' +
      '<div style="font-size:13px;font-weight:700;color:#C9971F;margin:4px 0 10px">' + prixTxt + '</div>' +
      (features.length
        ? features.map(function(f) { return '<div style="font-size:12px;color:#6B5F54;padding:3px 0">✅ ' + escapeHTML(f.nom) + '</div>'; }).join('')
        : (o.type === 'sur_mesure' ? '<div style="font-size:12px;color:#6B5F54">Fonctionnalités choisies avec vous, à la carte</div>' : '')) +
      (o.type === 'sur_mesure' ? '<button onclick="ouvrirDemandeFonctionnalites()" style="width:100%;margin-top:12px;padding:10px;background:#241F1B;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">📝 Demander un devis pour des fonctionnalités sur mesure</button>' : '') +
    '</div>';
  }).join('');

  // Fonctionnalités ajoutées à la carte (au-dessus du forfait de base),
  // affichées séparément si elles existent.
  const dejaAffichees = new Set();
  (STATE.toutesOffres.find(function(o){return o.id===offreActuelleId;})?.offre_features || []).forEach(function(x) { if (x.features) dejaAffichees.add(x.features.code); });
  const supplementaires = (STATE.mesFeatures || []).filter(function(code) { return !dejaAffichees.has(code); });
  if (supplementaires.length) {
    zone.innerHTML += '<div style="background:#EEF3E4;border-radius:14px;padding:14px 16px;margin-top:4px">' +
      '<div style="font-size:12px;font-weight:700;color:#55702E;margin-bottom:6px">➕ Fonctionnalités ajoutées à votre compte</div>' +
      supplementaires.map(function(code) { return '<div style="font-size:12px;color:#55702E;padding:2px 0">✅ ' + escapeHTML(code) + '</div>'; }).join('') +
    '</div>';
  }
}

// Demande de fonctionnalités sur mesure — réutilise le canal Support déjà
// en place (formulaire enregistré en base), pas besoin d'un nouveau circuit.
function ouvrirDemandeFonctionnalites() {
  goScreen('support', null);
  setTimeout(function() {
    el('sup-sujet') && (el('sup-sujet').value = 'Demande de fonctionnalités sur mesure');
    el('sup-message') && (el('sup-message').value = 'Bonjour, je souhaiterais un devis pour ajouter les fonctionnalités suivantes à mon compte :\n\n- ');
    showToast('Décrivez les fonctionnalités souhaitées ci-dessous', 'success');
  }, 150);
}
