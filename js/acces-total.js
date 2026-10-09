// ZELTO — acces-total.js
// MODE LANCEMENT : toutes les fonctions sont accessibles à tous les comptes,
// sans verrou de forfait (Stock, RH, relances, OCR, multi-utilisateurs...)
// et sans limite de clients / produits côté application.
//
// Pour revenir aux forfaits payants plus tard : mettre ACCES_TOTAL à false
// (ou retirer la ligne <script src="js/acces-total.js"> dans app.html).
// À charger APRÈS js/offres.js.

(function () {
  var ACCES_TOTAL = true;
  if (!ACCES_TOTAL) return;

  window.aAccesFeature = function () { return true; };
  window.verifierAccesFeature = function () { return true; };
  if (typeof window.verifierLimiteClients === 'function') window.verifierLimiteClients = function () { return true; };
  if (typeof window.verifierLimiteProduits === 'function') window.verifierLimiteProduits = function () { return true; };
  // Plus aucun cadenas "🔒 Pro" à afficher
  window.htmlBadgeVerrou = function () { return ''; };
  window.appliquerVerrousVisuels = function () {
    document.querySelectorAll('[data-verrou], .badge-verrou, .verrou-badge').forEach(function (n) { n.remove(); });
  };
  window.ZELTO_ACCES_TOTAL = true;
})();
