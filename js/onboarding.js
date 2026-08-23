// ZELTO — onboarding.js — Guide de démarrage pour les nouveaux comptes
// ============================================================
// Affiché une seule fois, juste après l'inscription (pas à chaque
// connexion) — 3 étapes concrètes pour prendre en main l'app, plutôt que
// de laisser un dashboard vide sans indication.
function afficherOnboarding() {
  if (document.getElementById('onboarding-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(36,31,27,0.55);display:flex;align-items:flex-end;justify-content:center';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;padding:28px 24px 24px;max-width:440px;width:100%;max-height:85vh;overflow-y:auto">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:36px;margin-bottom:8px">👋</div>
        <div style="font-size:18px;font-weight:700;font-family:'Fraunces',serif">Bienvenue sur Zelto !</div>
        <div style="font-size:13px;color:#6B5F54;margin-top:4px">3 étapes pour démarrer — 5 minutes suffisent.</div>
      </div>
      <div onclick="onboardingAction('client')" style="display:flex;align-items:center;gap:14px;padding:16px;background:#F1EEE8;border-radius:14px;margin-bottom:10px;cursor:pointer">
        <div style="width:40px;height:40px;border-radius:10px;background:#E9F4F3;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">👥</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">1. Ajouter ton premier client</div>
          <div style="font-size:11px;color:#9C9186">Nom, téléphone — 30 secondes</div>
        </div>
        <div style="color:#9C9186">›</div>
      </div>
      <div onclick="onboardingAction('facture')" style="display:flex;align-items:center;gap:14px;padding:16px;background:#F1EEE8;border-radius:14px;margin-bottom:10px;cursor:pointer">
        <div style="width:40px;height:40px;border-radius:10px;background:#FBF0DA;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🧾</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">2. Créer ta première facture</div>
          <div style="font-size:11px;color:#9C9186">Vois à quoi ressemble le résultat final</div>
        </div>
        <div style="color:#9C9186">›</div>
      </div>
      <div onclick="onboardingAction('comptable')" style="display:flex;align-items:center;gap:14px;padding:16px;background:#F1EEE8;border-radius:14px;margin-bottom:18px;cursor:pointer">
        <div style="width:40px;height:40px;border-radius:10px;background:#EDE6F0;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🤝</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">3. Inviter ton comptable</div>
          <div style="font-size:11px;color:#9C9186">Optionnel — il aura son propre accès direct</div>
        </div>
        <div style="color:#9C9186">›</div>
      </div>
      <button onclick="fermerOnboarding()" style="width:100%;padding:12px;background:none;border:none;color:#9C9186;font-size:13px;cursor:pointer;font-family:inherit">Passer, j'explore seul</button>
    </div>
  `;
  document.body.appendChild(overlay);
}
function fermerOnboarding() {
  document.getElementById('onboarding-overlay')?.remove();
  // FIX (bug signalé) : rien ne mémorisait jamais que l'onboarding avait
  // déjà été vu — il se réaffichait donc à CHAQUE connexion, pas
  // seulement la première. On enregistre maintenant ce choix en base
  // (pas juste en local) pour que ça survive même à un changement
  // d'appareil ou de navigateur.
  if (STATE.profil) STATE.profil.onboarding_vu = true;
  const uid = STATE.entrepriseId || sb.user?.id;
  if (uid) {
    sb.upsert('profils_entreprise', { id: uid, onboarding_vu: true }).catch(function(e) {
      console.warn('fermerOnboarding: échec de l\'enregistrement (réapparaîtra à la prochaine connexion)', e);
    });
  }
}
function onboardingAction(etape) {
  fermerOnboarding();
  if (etape === 'client') goScreen('nouveau-client', null);
  else if (etape === 'facture') goScreen('nouvelle', null);
  else if (etape === 'comptable') { goScreen('profil', null); setTimeout(function() { if (typeof inviterComptable === 'function') inviterComptable(); }, 300); }
}
