// ZELTO — hubs.js — Rubriques Achats / Ventes restructurées
// ============================================================
// Deux points d'entrée consolidés (au lieu d'écrans dispersés) :
// - Achats : factures d'achat, bons de commande envoyés, devis reçus à
//   convertir, demande de devis fournisseur
// - Ventes : demandes de devis reçues, devis, factures, bons de commande
//   reçus, bons de livraison
// Chaque tuile mène vers l'écran détaillé existant (rien n'est dupliqué —
// on ne fait que consolider et présenter l'accès).
//
// DESIGN : grille de tuiles avec badge d'icône circulaire (plutôt qu'un
// fond plein coloré), une ligne de résumé chiffré en tête, et un badge
// d'alerte (pastille) sur les tuiles qui ont quelque chose à traiter.

function _resumeHub(items) {
  // items: [{valeur, label, couleur}]
  return '<div style="display:grid;grid-template-columns:repeat(' + items.length + ',1fr);gap:8px;margin-bottom:16px">' +
    items.map(function(it) {
      return '<div style="background:#fff;border-radius:14px;padding:12px 10px;text-align:center;border:1px solid var(--border)">' +
        '<div style="font-size:17px;font-weight:800;color:' + it.couleur + '">' + it.valeur + '</div>' +
        '<div style="font-size:9px;font-weight:600;color:var(--ink-faint);text-transform:uppercase;letter-spacing:0.04em;margin-top:2px">' + it.label + '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

function _tuileHub(icone, titre, sousTitre, montant, couleurAccent, couleurFondBadge, onclick, alerte) {
  return '<div onclick="' + onclick + '" style="background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:12px;border:1px solid var(--border);position:relative">' +
    '<div style="width:42px;height:42px;border-radius:12px;background:' + couleurFondBadge + ';display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0">' + icone +
      (alerte ? '<span style="position:absolute;top:10px;left:40px;background:var(--brique);color:#fff;font-size:9px;font-weight:700;border-radius:8px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;padding:0 3px">' + alerte + '</span>' : '') +
    '</div>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="font-size:13px;font-weight:700;color:var(--ink)">' + titre + '</div>' +
      '<div style="font-size:11px;color:var(--ink-soft);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + sousTitre + '</div>' +
    '</div>' +
    (montant != null
      ? '<div style="font-size:13px;font-weight:800;color:' + couleurAccent + ';flex-shrink:0;text-align:right">' + montant + '</div>'
      : '<div style="font-size:16px;color:var(--ink-faint);flex-shrink:0">›</div>') +
  '</div>';
}

function _lienDiscretHub(icone, texte, couleur, onclick) {
  return '<div onclick="' + onclick + '" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;margin-top:6px;cursor:pointer">' +
    '<span style="font-size:13px">' + icone + '</span>' +
    '<span style="font-size:12px;font-weight:600;color:' + couleur + ';text-decoration:underline">' + texte + '</span>' +
  '</div>';
}

function renderHubAchats() {
  const container = el('hub-achats-content');
  if (!container) return;

  const achats = STATE.achats || [];
  const bcEnvoyes = STATE.bonsCommande || [];
  const devisRecus = STATE.devisRecusAcceptes || [];
  const totalAchats = achats.reduce(function(s,a){return s+(Number(a.ttc)||0);},0);
  const bcEnAttente = bcEnvoyes.filter(function(bc){return bc.statut==='envoye';}).length;
  const devisAConvertir = devisRecus.filter(function(x){return !x.dejaConverti;}).length;

  container.innerHTML =
    _resumeHub([
      { valeur: fmt(totalAchats), label: 'Total achats', couleur: 'var(--brique)' },
      { valeur: bcEnvoyes.length, label: 'Bons de commande', couleur: 'var(--plum)' },
      { valeur: achats.length, label: 'Factures', couleur: 'var(--ink)' },
    ]) +
    _tuileHub('🧾', 'Factures d\'achat', achats.length + ' facture(s) enregistrée(s)', fmt(totalAchats) + ' MAD', 'var(--brique-dark)', 'var(--brique-light)', "goScreen('achats',null)") +
    _tuileHub('📥', 'Factures reçues (fournisseurs Zelto)', 'Importez-les sans ressaisie', null, 'var(--zellige)', 'var(--zellige-light)', "window._retourFacturesRecues='hub-achats';loadFacturesRecues();goScreen('factures-recues',null)") +
    _tuileHub('📋', 'Bons de commande envoyés', bcEnAttente ? bcEnAttente + ' en attente de réponse' : 'Tous répondus', null, 'var(--plum)', 'var(--plum-light)', "goScreen('bons-commande-list',null)", bcEnAttente || null) +
    _tuileHub('📝', 'Devis reçus acceptés', devisAConvertir ? 'À convertir en bon de commande' : 'Rien à convertir', null, 'var(--safran-dark)', 'var(--safran-light)', "chargerDevisRecusAcceptes();goScreen('devis-recus',null)", devisAConvertir || null) +
    _lienDiscretHub('📝', 'Demander un devis à un fournisseur', 'var(--plum)', 'ouvrirDemandeDevisFournisseur()');
}

function renderHubVentes() {
  const container = el('hub-ventes-content');
  if (!container) return;

  const factures = STATE.factures || [];
  const devisListe = STATE.devis || [];
  const bcRecus = STATE.bcRecus || [];
  const bl = STATE.bonsLivraison || [];
  const demandes = STATE.demandesDevis || [];
  const totalCA = factures.filter(function(f){return f.statut==='payee';}).reduce(function(s,f){return s+(Number(f.ttc)||0);},0);
  const bcNonConvertis = bcRecus.filter(function(bc){return !bc.facture_generee_id;}).length;
  const demandesNouvelles = demandes.filter(function(d){return d.statut==='nouvelle';}).length;

  container.innerHTML =
    _resumeHub([
      { valeur: fmt(totalCA), label: 'Encaissé', couleur: 'var(--sauge-dark)' },
      { valeur: factures.length, label: 'Factures', couleur: 'var(--ink)' },
      { valeur: devisListe.length, label: 'Devis', couleur: 'var(--safran-dark)' },
    ]) +
    _tuileHub('📥', 'Demandes de devis', demandesNouvelles ? demandesNouvelles + ' nouvelle(s)' : 'Aucune nouvelle', null, 'var(--safran-dark)', 'var(--safran-light)', "loadDemandesDevis();goScreen('demandes-devis',null)", demandesNouvelles || null) +
    _tuileHub('📝', 'Devis', devisListe.length + ' devis', null, 'var(--safran-dark)', 'var(--safran-light)', "goScreen('devis-list',null)") +
    _tuileHub('🧾', 'Factures', factures.length + ' facture(s)', fmt(totalCA) + ' MAD', 'var(--sauge-dark)', 'var(--sauge-light)', "goScreen('dashboard',null)") +
    _tuileHub('📋', 'Bons de commande reçus', bcNonConvertis ? bcNonConvertis + ' à convertir' : 'Tous traités', null, 'var(--plum)', 'var(--plum-light)', "loadBCRecus();goScreen('bc-recus',null)", bcNonConvertis || null) +
    _tuileHub('📦', 'Bons de livraison', bl.length + ' BL envoyé(s)', null, 'var(--zellige-dark)', 'var(--zellige-light)', "goScreen('bons-livraison-list',null)");
}
