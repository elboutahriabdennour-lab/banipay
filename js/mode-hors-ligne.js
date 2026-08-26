// ZELTO — mode-hors-ligne.js — Détection de connexion, version prudente
// ============================================================
// PÉRIMÈTRE HONNÊTE : ceci n'est PAS un vrai mode hors-ligne complet
// (pas de file d'attente de synchronisation automatique, pas de
// résolution de conflits). Un vrai mode hors-ligne demanderait un
// chantier dédié, plus lourd et plus risqué à construire vite — un bug
// dans une synchronisation automatique peut faire perdre ou dupliquer
// de vraies factures, ce qui est bien pire qu'une simple gêne d'usage.
//
// Ce que ça fait concrètement :
//   1. Affiche clairement quand la connexion est perdue (bannière)
//   2. S'appuie sur les BROUILLONS déjà existants (100% locaux, donc
//      déjà utilisables sans réseau) plutôt que d'inventer un nouveau
//      mécanisme de stockage
//   3. Bloque avec un message clair les actions qui ont besoin du
//      réseau, plutôt que de les laisser échouer silencieusement ou de
//      prétendre les mettre en attente pour plus tard

STATE._enLigne = STATE._enLigne !== false; // true par defaut tant qu'on n'a pas detecte de coupure

function initDetectionConnexion() {
  afficherBanniereConnexion(navigator.onLine);
  window.addEventListener('online', function() {
    STATE._enLigne = true;
    afficherBanniereConnexion(true);
    showToast('✅ Connexion rétablie', 'success');
  });
  window.addEventListener('offline', function() {
    STATE._enLigne = false;
    afficherBanniereConnexion(false);
  });
}

function afficherBanniereConnexion(enLigne) {
  let banniere = document.getElementById('banniere-hors-ligne');
  if (enLigne) {
    banniere?.remove();
    return;
  }
  if (banniere) return; // déjà affichée, pas la peine de la recréer
  banniere = document.createElement('div');
  banniere.id = 'banniere-hors-ligne';
  banniere.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;background:#B8860B;color:#fff;text-align:center;padding:8px 16px;font-size:12px;font-weight:600';
  banniere.textContent = '📡 Pas de connexion — les brouillons restent disponibles, le reste nécessite le réseau';
  document.body.appendChild(banniere);
}

// À appeler en tête de toute action qui a besoin du réseau (créer,
// modifier, supprimer, envoyer...) — bloque clairement plutôt que de
// laisser l'action échouer avec une erreur technique confuse pour
// l'utilisateur, ou pire, prétendre l'avoir mise en file d'attente sans
// vraie garantie de synchronisation derrière.
function verifierConnexionRequise() {
  if (navigator.onLine === false) {
    showToast('📡 Action impossible sans connexion — réessayez une fois reconnecté', 'error');
    return false;
  }
  return true;
}

document.addEventListener('DOMContentLoaded', initDetectionConnexion);
