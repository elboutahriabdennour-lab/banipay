// ZELTO — acces-total.js
// MODE LANCEMENT : tant que la date de début des règles n'est pas fixée côté base
// (réglage 'debut_regles', voir SQL 069), toutes les fonctions sont accessibles à tous.
// Dès que la date est fixée, ce fichier s'efface : ce sont les règles du serveur qui s'appliquent
// (essai 3 mois entreprise, 6 mois / 20 clients cabinet, offres et cadenas).
// Par précaution, si le statut n'a pas pu être lu, tout reste ouvert.
// À charger APRÈS js/offres.js.

(function () {
  function ouvertParLancement() {
    var s = window.STATE && STATE.statutOffre;
    return !s || s.mode === 'lancement';
  }
  var _aAcces = window.aAccesFeature;
  window.aAccesFeature = function (code) {
    return ouvertParLancement() ? true : _aAcces(code);
  };
  var _verifLimClients = window.verifierLimiteClients;
  window.verifierLimiteClients = function () {
    return ouvertParLancement() ? true : _verifLimClients.apply(this, arguments);
  };
  var _verifLimProduits = window.verifierLimiteProduits;
  window.verifierLimiteProduits = function () {
    return ouvertParLancement() ? true : _verifLimProduits.apply(this, arguments);
  };
  window.ZELTO_ACCES_TOTAL = true;
})();
