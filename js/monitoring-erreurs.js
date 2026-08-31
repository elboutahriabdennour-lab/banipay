// ZELTO — monitoring-erreurs.js — Alerte en cas de plantage
// ============================================================
// Capture les erreurs JavaScript non gérées et les envoie sous forme de
// notification push, via ntfy.sh (service gratuit, sans inscription,
// https://ntfy.sh). Pas une solution de monitoring professionnelle
// complète (pas d'historique consultable, pas de regroupement avancé)
// — mais largement suffisant pour être prévenu rapidement qu'un vrai
// problème se produit chez de vrais utilisateurs.
//
// ⚠️ À FAIRE AVANT QUE ÇA FONCTIONNE :
//   1. Choisir un nom de sujet (topic) UNIQUE et difficile à deviner —
//      remplacer NTFY_TOPIC ci-dessous (le nom du sujet fait office de
//      mot de passe : n'importe qui le connaissant peut lire les
//      messages ou en envoyer de faux).
//   2. Installer l'app ntfy (Android/iOS) ou aller sur ntfy.sh dans un
//      navigateur, et s'abonner à ce même nom de sujet.
const NTFY_TOPIC = 'zelto-alertes-CHANGEZ-MOI-abc123';

// Évite d'envoyer 50 fois la même erreur si elle se répète en boucle —
// une seule notification par erreur identique toutes les 10 minutes.
const _erreursRecentes = {};
function _dejaSignaleeRecemment(cle) {
  const maintenant = Date.now();
  if (_erreursRecentes[cle] && maintenant - _erreursRecentes[cle] < 10 * 60 * 1000) return true;
  _erreursRecentes[cle] = maintenant;
  return false;
}

function _envoyerAlerte(titre, message) {
  const cle = titre + '|' + message.slice(0, 100);
  if (_dejaSignaleeRecemment(cle)) return;
  try {
    fetch('https://ntfy.sh/' + NTFY_TOPIC, {
      method: 'POST',
      headers: { 'Title': titre, 'Priority': 'high', 'Tags': 'warning' },
      body: message,
    }).catch(function() { /* si ntfy est injoignable, on n'insiste pas — ne doit jamais bloquer l'app */ });
  } catch(e) { /* jamais laisser la surveillance elle-même casser quoi que ce soit */ }
}

function _contexteActuel() {
  const ecran = document.querySelector('.screen.active')?.id || 'inconnu';
  const email = (typeof sb !== 'undefined' && sb.user?.email) ? sb.user.email : 'non connecté';
  return 'Écran: ' + ecran + ' | Compte: ' + email;
}

window.addEventListener('error', function(event) {
  const message = (event.message || 'Erreur inconnue') +
    '\n' + _contexteActuel() +
    (event.filename ? '\nFichier: ' + event.filename.split('/').pop() + ':' + event.lineno : '');
  _envoyerAlerte('🔴 Erreur Zelto', message);
});

window.addEventListener('unhandledrejection', function(event) {
  const raison = event.reason?.message || String(event.reason) || 'Rejet de promesse non géré';
  const message = raison + '\n' + _contexteActuel();
  _envoyerAlerte('🔴 Erreur Zelto (async)', message);
});
