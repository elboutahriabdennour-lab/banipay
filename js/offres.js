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
STATE.limiteClients = STATE.limiteClients || null; // null = illimité ou pas encore chargé
STATE.limiteProduits = STATE.limiteProduits || null;
STATE.nomForfaitActuel = STATE.nomForfaitActuel || null;
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
  try {
    const respL = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_ma_limite_clients', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    STATE.limiteClients = respL.ok ? (await respL.json()) : null;
  } catch(e) { STATE.limiteClients = null; }
  try {
    const respP = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_ma_limite_produits', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    STATE.limiteProduits = respP.ok ? (await respP.json()) : null;
  } catch(e) { STATE.limiteProduits = null; }
  // Nom du forfait actuel — pour l'affichage du badge (Profil, etc.)
  try {
    const respO = await fetch(SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + sb.user.id + '&select=offre_id,offres(nom)', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
    });
    const dataO = respO.ok ? ((await respO.json()) || []) : [];
    STATE.nomForfaitActuel = dataO[0]?.offres?.nom || null;
  } catch(e) { STATE.nomForfaitActuel = null; }
  afficherBadgeForfait();
  if (typeof appliquerVerrousVisuels === 'function') appliquerVerrousVisuels();
}
// Affiche "Forfait : XXX" partout où un emplacement existe pour ça
// (actuellement : Profil). Ne fait rien si l'élément n'existe pas sur
// l'écran courant.
function afficherBadgeForfait() {
  const badge = el('badge-forfait-actuel');
  if (badge) badge.textContent = STATE.nomForfaitActuel ? '📦 Forfait ' + STATE.nomForfaitActuel : '';
}
// Vrai/faux — l'entreprise a-t-elle accès à cette fonctionnalité ?
// C'est LE bon outil pour une fonctionnalité SUR-MESURE construite pour
// UNE SEULE entreprise (jamais montrée aux autres) : on l'utilise pour
// décider si on affiche l'élément d'interface DU TOUT, avant même de le
// construire dans le HTML/JS — pas après coup avec un verrou visible.
//
// Exemple concret : un export spécifique vers un logiciel tiers, demandé
// et payé par une seule entreprise (ex: "Dupont SARL").
//   1. On construit normalement la fonctionnalité, avec un code unique
//      rien que pour ce cas : ex. 'custom_dupont_export_sage'
//   2. On ajoute une ligne dans entreprise_features_supplementaires (côté
//      Supabase) ciblant PRÉCISÉMENT le compte de Dupont SARL
//   3. Dans le code, on n'affiche l'élément QUE si aAccesFeature() répond
//      vrai — exemple :
//        if (aAccesFeature('custom_dupont_export_sage')) {
//          html += '<button onclick="exporterVersSage()">Exporter vers Sage</button>';
//        }
//      Pour TOUTE autre entreprise, ce bouton n'existe simplement pas —
//      invisible, pas juste verrouillé. Contrairement à une fonctionnalité
//      du catalogue standard (stock, RH...), où montrer un verrou "🔒
//      passez en Pro" donne envie de payer plus, montrer un verrou sur un
//      bricolage sur-mesure n'aurait aucun sens pour les autres — ce
//      serait juste du bruit dans leur interface.
function aAccesFeature(code) {
  return (STATE.mesFeatures || []).includes(code);
}
// NOUVEAU : badge cadenas visible AVANT le clic — plutôt que de laisser
// la personne cliquer et découvrir après coup qu'elle n'a pas accès.
// FIX (audit) : distingue "pas encore chargé" (STATE.mesFeatures est
// undefined) de "chargé et vraiment vide" (tableau vide) — sans ça, un
// utilisateur payant qui navigue très vite après connexion pouvait voir
// un cadenas pendant la fraction de seconde où le réseau n'avait pas
// encore répondu. Dans le doute, on n'affiche rien plutôt qu'un cadenas
// à tort.
function htmlBadgeVerrou(code) {
  if (STATE.mesFeatures === undefined) return '';
  if (aAccesFeature(code)) return '';
  return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;background:#F1EEE8;color:#9C9186;padding:2px 6px;border-radius:8px;margin-left:6px;vertical-align:middle">🔒 Pro</span>';
}
// Applique le cadenas visuel directement sur des éléments DOM déjà en
// place dans la page statique (contrairement à htmlBadgeVerrou, qui sert
// pour du HTML construit dynamiquement en JS).
function appliquerVerrousVisuels() {
  const cibles = [
    { id: 'verrou-stock-dashboard', code: 'stock' },
    { id: 'verrou-rh-dashboard', code: 'rh' },
    { id: 'verrou-equipe-inviter', code: 'multi_utilisateurs' },
    { id: 'verrou-relances-auto', code: 'relances_auto' },
  ];
  cibles.forEach(function(c) {
    const el2 = document.getElementById(c.id);
    if (!el2) return;
    el2.innerHTML = htmlBadgeVerrou(c.code);
  });
  // Cas particulier : la zone d'upload OCR n'est pas un bouton avec du
  // texte, un simple badge inline ne suffit pas à expliquer ce qui est
  // verrouillé — message dédié à la place.
  const zoneOcr = document.getElementById('verrou-ocr-achats');
  if (zoneOcr) {
    zoneOcr.innerHTML = aAccesFeature('ocr_achats')
      ? ''
      : '<span style="font-size:10px;color:#9C9186">🔒 La lecture automatique du montant/fournisseur nécessite le forfait Pro</span>';
  }
}
// Version "verrou visible" — à utiliser UNIQUEMENT pour les
// fonctionnalités du catalogue standard (celles listées dans "Mon
// forfait"), pas pour du sur-mesure — voir la note ci-dessus.
// À appeler en tête d'une action verrouillée (bouton, écran). Si l'accès
// manque, affiche un message clair et bloque l'action ; sinon ne fait
// rien et laisse la suite s'exécuter normalement.
function verifierAccesFeature(code, nomFeature) {
  if (aAccesFeature(code)) return true;
  showToast('🔒 "' + nomFeature + '" n\'est pas inclus dans votre forfait actuel', 'error');
  window._retourMonForfait = (document.querySelector('.screen.active')||{}).id?.replace('screen-','') || 'profil'; setTimeout(function() { goScreen('mon-forfait', null); }, 900);
  return false;
}
// Vérifie la limite de clients (nombre, pas juste oui/non). Retourne true
// si on peut ajouter un client de plus.
// FIX (audit) : verifierLimiteClients() et verifierLimiteProduits() étaient
// deux copies quasi identiques de la même logique. Fusionnées ici en une
// fonction générique — les deux noms d'origine restent disponibles (appelés
// ailleurs dans l'app) et se contentent maintenant de déléguer.
function _verifierLimiteGenerique(limite, liste, nomChose) {
  if (limite == null) return true; // illimité, ou pas encore chargé (on ne bloque pas par précaution)
  if ((liste || []).length >= limite) {
    showToast('🔒 Limite de ' + limite + ' ' + nomChose + ' atteinte pour votre forfait', 'error');
    window._retourMonForfait = (document.querySelector('.screen.active')||{}).id?.replace('screen-','') || 'profil'; setTimeout(function() { goScreen('mon-forfait', null); }, 900);
    return false;
  }
  return true;
}
function verifierLimiteClients() {
  return _verifierLimiteGenerique(STATE.limiteClients, STATE.clients, 'clients');
}
function verifierLimiteProduits() {
  return _verifierLimiteGenerique(STATE.limiteProduits, STATE.produits, 'articles');
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
    // DEMANDE : plus aucun prix de forfait affiché nulle part dans l'app —
    // seuls le nom et les fonctionnalités incluses restent visibles.
    return '<div style="background:#fff;border-radius:16px;padding:16px;margin-bottom:12px;border:2px solid ' + (estActuelle ? '#C9971F' : '#E3DCCF') + ';position:relative">' +
      (estActuelle ? '<div style="position:absolute;top:-10px;right:14px;background:#C9971F;color:#fff;font-size:10px;font-weight:700;padding:3px 10px;border-radius:10px">VOTRE FORFAIT</div>' : '') +
      '<div style="font-size:15px;font-weight:800;color:#2A2420;margin-bottom:10px">' + escapeHTML(o.nom) + '</div>' +
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
