// ZELTO — auth.js

function switchTab(tab) {
  ['aw-normal','aw-signup','aw-comptable','aw-confirm'].forEach(id => {
    const e = el(id); if (e) e.style.display = 'none';
  });
  const target = { login: 'aw-normal', signup: 'aw-signup', comptable: 'aw-comptable', confirm: 'aw-confirm' }[tab];
  if (el(target)) el(target).style.display = 'block';
}

async function doForgotPassword() {
  const email = el('login-email')?.value.trim();
  if (!email) { const e = el('login-err'); if(e) e.textContent = 'Entrez votre email'; return; }
  await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, redirect_to: window.location.href })
  });
  showToast('✅ Lien envoyé sur ' + email, 'success');
}

function showEmailConfirmScreen(email) {
  window._pendingConfirmEmail = email;
  switchTab('confirm');
  const cEl = el('confirm-email-display');
  if (cEl) cEl.textContent = email;
}

async function renvoyerConfirmation() {
  const email = window._pendingConfirmEmail;
  if (!email) { showToast('Email introuvable', 'error'); return; }
  try {
    await sb.resendConfirmation(email);
    showToast('Email renvoyé !', 'success');
  } catch(e) { showToast('Erreur envoi', 'error'); }
}

async function doLogout() {
  localStorage.removeItem('bp_remember_v2');
  sb.logout();
  Object.assign(STATE, { factures:[], devis:[], clients:[], produits:[], avoirs:[], paiements:[], profil:{}, notifications:[], abonnements:[] });
  goScreen('auth');
}

async function accederComptable() {
  const code = el('comptable-code')?.value.trim();
  const errEl = el('comptable-error');
  const email = window._comptableEmail;
  if (!code || !email) { if(errEl) errEl.textContent = 'Code requis'; return; }
  if(errEl) errEl.textContent = '⏳...';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/acces_comptable?email=eq.${encodeURIComponent(email)}&code=eq.${code}&select=user_id`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const d = await r.json();
    if (d && d.length > 0) {
      window._comptableUserId = d[0].user_id;
      await loadComptableData(d[0].user_id);
      goScreen('dashboard-comptable');
      showToast('✅ Accès autorisé', 'success');
    } else {
      if(errEl) errEl.textContent = '❌ Code incorrect';
    }
  } catch(e) { if(errEl) errEl.textContent = '❌ Erreur'; }
}

// ============================================================
// DARK MODE
// ============================================================

function selectRole(role) {
  CPT.role = role;
  const entBtn = el('role-entreprise');
  const cptBtn = el('role-comptable');
  const cptFields = el('signup-comptable-fields');
  if (!entBtn || !cptBtn) return;

  if (role === 'entreprise') {
    entBtn.style.border = '2px solid #C9971F';
    entBtn.style.background = '#E9F4F3';
    entBtn.style.transform = 'scale(1.02)';
    cptBtn.style.border = '2px solid #E3DCCF';
    cptBtn.style.background = '#F1EEE8';
    cptBtn.style.transform = 'scale(1)';
    if (cptFields) cptFields.style.display = 'none';
  } else {
    cptBtn.style.border = '2px solid #7C5CA6';
    cptBtn.style.background = '#EDE6F0';
    cptBtn.style.transform = 'scale(1.02)';
    entBtn.style.border = '2px solid #E3DCCF';
    entBtn.style.background = '#F1EEE8';
    entBtn.style.transform = 'scale(1)';
    if (cptFields) cptFields.style.display = 'block';
  }
  const roleInput = el('signup-role');
  if (roleInput) roleInput.value = role;
}

// ============================================================
// SIGNUP AVEC ROLE
// ============================================================

async function doSignup() {
  const nom = el('signup-nom')?.value.trim();
  const email = el('signup-email')?.value.trim();
  const pwd = el('signup-password')?.value;
  const pwd2 = el('signup-password2')?.value;
  const role = el('signup-role')?.value || 'entreprise';
  const cabinet = el('signup-cabinet')?.value.trim() || '';
  const errEl = el('signup-err');
  if (errEl) errEl.textContent = '';
  if (!nom || !email || !pwd) { if(errEl) errEl.textContent = 'Remplissez tous les champs'; return; }
  if (pwd.length < 8) { if(errEl) errEl.textContent = '8 caractères minimum'; return; }
  if (!/[A-Z]/.test(pwd)) { if(errEl) errEl.textContent = 'Au moins une majuscule'; return; }
  if (!/[0-9]/.test(pwd)) { if(errEl) errEl.textContent = 'Au moins un chiffre'; return; }
  if (pwd !== pwd2) { if(errEl) errEl.textContent = 'Mots de passe différents'; return; }
  if (errEl) errEl.textContent = '⏳ Vérification...';
  // NOUVEAU : exclusivité stricte — un email agent support ne peut pas
  // aussi devenir un compte entreprise/comptable.
  try {
    const respAgent = await fetch(SUPABASE_URL + '/rest/v1/rpc/email_est_agent_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: email })
    });
    const estAgent = respAgent.ok ? await respAgent.json() : false;
    if (estAgent) {
      if (errEl) errEl.textContent = '⛔ Cet email est réservé à l\'équipe support — utilisez un autre email';
      return;
    }
  } catch(eCheck) { /* si la vérification échoue, on laisse continuer normalement */ }
  if (errEl) errEl.textContent = '⏳ Création...';
  try {
    const resultatSignup = await sb.signup(email, pwd, { nom, role, cabinet });
    // FIX: même bug que doLogin() — sb.signup() n'était jamais vérifié,
    // donc un email déjà utilisé (ou toute autre erreur) affichait quand
    // même "Email de confirmation envoyé !" comme si tout s'était bien
    // passé.
    if (resultatSignup && resultatSignup.error) {
      const messageErreur = resultatSignup.error?.message || resultatSignup.error || 'Erreur lors de la création du compte';
      if (errEl) errEl.textContent = '❌ ' + messageErreur;
      return;
    }
    window._pendingConfirmEmail = email;
    switchTab('confirm');
    const cEl3 = el('confirm-email-display');
    if (cEl3) cEl3.textContent = email;
    if (errEl) errEl.textContent = '';
    showToast('Email de confirmation envoyé !', 'success');
  } catch(e) { if(errEl) errEl.textContent = '❌ ' + (e.message || 'Erreur'); }
}

// ============================================================
// LOGIN — REDIRECTION SELON ROLE
// ============================================================

// Exécute une étape du chargement post-connexion sans jamais bloquer la
// suite si elle échoue (table pas encore migrée, réseau, etc.) — voir le
// commentaire dans doLogin().
async function _essai(fn, nom) {
  try {
    await fn();
  } catch(e) {
    console.warn('Étape post-connexion ignorée (' + nom + '):', e.message || e);
  }
}

async function doLogin() {
  const email = el('login-email')?.value.trim();
  const pwd = el('login-password')?.value;
  const errEl = el('login-err');
  const remember = el('remember-me')?.checked;
  if (errEl) errEl.textContent = '';
  if (!email || !pwd) { if(errEl) errEl.textContent = 'Remplissez tous les champs'; return; }
  if (errEl) errEl.textContent = '⏳ Connexion...';
  try {
    const resultatLogin = await sb.login(email, pwd);
    // FIX MAJEUR: sb.login() n'était jamais vérifié — si les identifiants
    // étaient incorrects (ou toute autre erreur de connexion), le code
    // continuait comme si ça avait marché, avec sb.user vide, jusqu'à
    // planter plus loin de façon confuse au lieu d'afficher clairement
    // "email ou mot de passe incorrect". On vérifie maintenant les deux
    // façons possibles dont une erreur peut être signalée (retournée dans
    // l'objet, ou simplement l'absence d'utilisateur après l'appel).
    if ((resultatLogin && resultatLogin.error) || !sb.user) {
      const messageErreur = resultatLogin?.error?.message || resultatLogin?.error || 'Email ou mot de passe incorrect';
      if (errEl) errEl.textContent = '❌ ' + messageErreur;
      return;
    }
    // FIX (chantier vérification email+téléphone) : la confirmation email
    // est réactivée côté Supabase — si l'email n'est pas confirmé,
    // Supabase refuse déjà la connexion en amont (resultatLogin.error),
    // donc rien de plus à faire ici pour l'email. Ajout de la vérification
    // téléphone : si elle n'a jamais été faite, on interrompt la
    // connexion normale et on affiche l'écran de vérification une seule
    // fois — ensuite, les connexions suivantes passent directement.
    if (!sb.user?.phone_confirmed_at) {
      if (errEl) errEl.textContent = '';
      goScreen('verification-telephone', null);
      return;
    }

    await _continuerApresAuthentification(email, errEl, remember);
  } catch(e) {
    if (errEl) errEl.textContent = '❌ ' + (e.message || 'Email ou mot de passe incorrect');
  }
}

// FIX (chantier vérification email+téléphone) : logique extraite de
// doLogin() pour être réutilisable après la vérification téléphone
// réussie (voir confirmerCodeVerificationTelephone), sans dupliquer
// toute la détection de rôle et le chargement du bon tableau de bord.
async function _continuerApresAuthentification(email, errEl, remember) {
  try {
    // NOUVEAU : détection automatique — un seul formulaire de connexion
    // pour tout le monde, pas de choix à faire. On vérifie d'abord si ce
    // compte est un agent support ; si oui, on route directement vers
    // l'espace support, SANS jamais charger ni afficher le dashboard
    // entreprise/comptable (un agent support n'est ni l'un ni l'autre —
    // voir aussi la contrainte d'exclusivité à l'inscription/l'ajout
    // d'agent, qui empêche un même email d'être les deux à la fois).
    try {
      const respAgent = await fetch(SUPABASE_URL + '/rest/v1/rpc/suis_je_agent_support', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const estAgent = respAgent.ok ? await respAgent.json() : false;
      if (estAgent) {
        const respRole = await fetch(SUPABASE_URL + '/rest/v1/rpc/mon_role_support', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        STATE.monRoleSupport = respRole.ok ? await respRole.json() : 'agent';
        if (errEl) errEl.textContent = '';
        goScreen('espace-support', null);
        switchOngletSupport('tickets');
        showToast('✅ Bienvenue dans l\'espace support', 'success');
        return;
      }
    } catch(eAgent) { /* si la vérification échoue, on continue normalement — pas d'agent trouvé */ }

    // Se souvenir de l'email
    if (remember) {
      localStorage.setItem('bp_saved_email', email);
      localStorage.setItem('bp_remember_v2', '1');
    } else {
      localStorage.removeItem('bp_saved_email');
      localStorage.removeItem('bp_remember_v2');
    }
    // Détecter le rôle depuis les metadata (défini à l'inscription)
    const metaRole = sb.user?.user_metadata?.role;
    let role = 'entreprise';
    if (errEl) errEl.textContent = '⏳ Rôle détecté: ' + (metaRole || 'non défini');

    if (metaRole === 'comptable') {
      // Rôle explicitement défini comme comptable à l'inscription
      role = 'comptable';
    } else if (!metaRole) {
      // Rôle non défini (ancien compte) - vérifier les invitations acceptées
      // MAIS seulement si l'email apparaît comme comptable (pas comme entreprise)
      try {
        const invCheck = await fetch(
          SUPABASE_URL + '/rest/v1/invitations_comptable?comptable_email=eq.' + encodeURIComponent(email) + '&statut=eq.acceptee&limit=1',
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
        );
        const invData = await invCheck.json();
        // Vérifier aussi que ce compte n'a PAS de profil entreprise
        const profCheck = await fetch(
          SUPABASE_URL + '/rest/v1/profils_entreprise?id=eq.' + sb.user.id + '&limit=1',
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
        );
        const profData = await profCheck.json();
        if (invData && invData.length > 0 && (!profData || !profData.length)) {
          role = 'comptable';
        }
      } catch(e2) {}
    }

    CPT.role = role;

    if (role === 'comptable') {
      await _essai(loadComptableApp, 'loadComptableApp');
      // Synchronise l'identité publique du comptable (nom/cabinet) — sans
      // ça, aucun autre utilisateur ne peut jamais voir autre chose que son
      // email brut (ni dans l'annuaire, ni dans les conversations, etc.)
      await _essai(synchroniserProfilComptable, 'synchroniserProfilComptable');
      // Le comptable doit apparaître comme son propre premier "client"
      await _essai(assurerAutoClientComptable, 'assurerAutoClientComptable');
      // FIX: rafraîchissement périodique des notifications (invitations en
      // attente, etc.) — auparavant seulement chargées à l'ouverture du
      // tableau de bord ou de l'onglet notifications.
      setInterval(function() {
        if (sb.user?.id) chargerNotificationsComptable();
      }, 30000);
      if (errEl) errEl.textContent = '';
      goScreen('comptable');
      showToast('✅ Bienvenue dans votre espace comptable !', 'success');
    } else {
      // Reset données avant chargement nouveau compte
      STATE.factures = []; STATE.devis = []; STATE.clients = [];
      STATE.produits = []; STATE.avoirs = []; STATE.achats = []; STATE.abonnements = [];
      // NOUVEAU : résout "pour quelle entreprise je travaille" — moi-même
      // si je suis titulaire, ou celui qui m'a invité si je suis un
      // membre d'équipe. DOIT se faire AVANT tous les chargements
      // ci-dessous, sinon un membre invité verrait ses tout premiers
      // chargements (factures, clients...) filtrés par erreur sur son
      // propre compte au lieu de celui de l'entreprise.
      try {
        const rEnt = await fetch(SUPABASE_URL + '/rest/v1/rpc/mon_entreprise_id', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        STATE.entrepriseId = rEnt.ok ? (await rEnt.json()) : sb.user.id;
      } catch(eEnt) { STATE.entrepriseId = sb.user.id; }

      // FIX MAJEUR: chacun de ces chargements passe maintenant par _essai()
      // — avant, si UNE SEULE de ces étapes plantait (par exemple une table
      // pas encore migrée), toute la suite s'arrêtait et l'écran restait
      // bloqué sur la page de connexion, sans jamais atteindre
      // goScreen('dashboard') à la fin. Maintenant, un échec isolé est
      // simplement ignoré (avec un avertissement en console) et la
      // connexion continue quand même.
      await _essai(loadAll, 'loadAll');
      await _essai(loadAchats, 'loadAchats');
      if (typeof loadBonsCommande === 'function') await _essai(loadBonsCommande, 'loadBonsCommande');
      if (typeof loadBonsLivraison === 'function') await _essai(loadBonsLivraison, 'loadBonsLivraison');
      if (typeof loadRelancesEnvoyees === 'function') await _essai(loadRelancesEnvoyees, 'loadRelancesEnvoyees');
      if (typeof loadEmployes === 'function') await _essai(loadEmployes, 'loadEmployes');
      if (typeof loadDemandesDevis === 'function') await _essai(loadDemandesDevis, 'loadDemandesDevis');
      if (typeof chargerMesFeatures === 'function') await _essai(chargerMesFeatures, 'chargerMesFeatures');
      if (typeof loadAbonnements === 'function') await _essai(loadAbonnements, 'loadAbonnements');
      if (typeof verifierAbonnements === 'function') await _essai(verifierAbonnements, 'verifierAbonnements');
      // Crée un profil entreprise minimal si absent, pour apparaître
      // immédiatement dans l'annuaire Zelto sans avoir à remplir le profil
      await _essai(assurerProfilEntrepriseMinimal, 'assurerProfilEntrepriseMinimal');

      // Traiter invitation en attente
      if (window._pendingInviteCpt) {
        const inv = window._pendingInviteCpt;
        window._pendingInviteCpt = null;
        try {
          // FIX: cherche l'id de l'invitation d'abord, puis passe par la
          // RPC sécurisée (qui vérifie le plafond de 10 entreprises pour
          // un cabinet gratuit) — un PATCH direct le contournait.
          const rFind = await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?comptable_email=eq.' + encodeURIComponent(inv.emailCpt) + '&entreprise_email=eq.' + encodeURIComponent(inv.pourEmail) + '&select=id', {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token }
          });
          const trouve = (await rFind.json()) || [];
          if (trouve[0]?.id) {
            await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?id=eq.' + trouve[0].id, {
              method: 'PATCH',
              headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
              body: JSON.stringify({ entreprise_id: sb.user.id })
            });
            const respAccept = await fetch(SUPABASE_URL + '/rest/v1/rpc/repondre_invitation_comptable', {
              method: 'POST',
              headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
              body: JSON.stringify({ p_invitation_id: trouve[0].id, p_reponse: 'acceptee' })
            });
            if (respAccept.ok) {
              showToast('✅ Invitation acceptée ! Votre comptable a maintenant accès.', 'success');
            } else {
              showToast('⚠️ Le cabinet comptable a atteint son plafond — contactez-le directement.', 'error');
            }
          }
        } catch(e2) {}
      }

      if (errEl) errEl.textContent = '';
      goScreen('dashboard');
      showToast('✅ Bienvenue !', 'success');
      if (typeof afficherOnboarding === 'function') setTimeout(afficherOnboarding, 600);
    }
  } catch(e) {
    if (errEl) errEl.textContent = '❌ ' + (e.message || 'Erreur lors du chargement du compte');
  }
}

// ============================================================
// CHANTIER : VÉRIFICATION TÉLÉPHONE (une seule fois, par SMS)
// ============================================================
// PÉRIMÈTRE : ceci ne remplace PAS la connexion habituelle (email +
// mot de passe reste le seul moyen de se connecter). Le téléphone est
// vérifié UNE SEULE FOIS, juste après la toute première connexion
// réussie (une fois l'email lui-même confirmé), pour qu'il puisse
// ensuite servir de moyen de récupération/support en cas de problème.
//
// CONTRAINTE TECHNIQUE IMPORTANTE : ceci nécessite qu'un fournisseur SMS
// (Twilio, MessageBird...) soit configuré dans Supabase → Authentication
// → Providers → Phone. Sans ça, l'envoi du code échouera. C'est une
// configuration à faire manuellement dans le tableau de bord Supabase
// (avec un vrai coût par SMS envoyé) — aucun code ne peut s'y substituer.
//
// Utilise le mécanisme natif de Supabase (updateUser + verifyOtp avec
// type=phone_change) : le téléphone est rattaché et vérifié sur le MÊME
// compte, sans jamais devenir un second identifiant de connexion.
window._telephoneEnAttente = null;

async function envoyerCodeVerificationTelephone() {
  const tel = (el('verif-tel-numero')?.value || '').trim();
  const errEl = el('verif-tel-err');
  if (errEl) errEl.textContent = '';
  if (!tel || tel.length < 8) {
    if (errEl) errEl.textContent = 'Entrez un numéro valide (avec indicatif, ex: +212...)';
    return;
  }
  // Format international minimal — on n'impose pas un pays précis, mais
  // on exige le "+" pour éviter les numéros locaux ambigus.
  const telFormate = tel.startsWith('+') ? tel : '+' + tel.replace(/^0+/, '212');
  if (errEl) errEl.textContent = '⏳ Envoi du code...';
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      method: 'PUT',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: telFormate })
    });
    const d = await r.json();
    if (!r.ok) {
      if (errEl) errEl.textContent = '❌ ' + (d.msg || d.error_description || d.message || 'Erreur lors de l\'envoi du code');
      return;
    }
    window._telephoneEnAttente = telFormate;
    if (errEl) errEl.textContent = '';
    document.getElementById('verif-tel-etape-numero') && (document.getElementById('verif-tel-etape-numero').style.display = 'none');
    document.getElementById('verif-tel-etape-code') && (document.getElementById('verif-tel-etape-code').style.display = 'block');
    showToast('✅ Code envoyé par SMS au ' + telFormate, 'success');
  } catch(e) {
    if (errEl) errEl.textContent = '❌ ' + (e.message || 'Erreur réseau');
  }
}

async function confirmerCodeVerificationTelephone() {
  const code = (el('verif-tel-code')?.value || '').trim();
  const errEl = el('verif-tel-err');
  if (errEl) errEl.textContent = '';
  if (!code || code.length < 4) {
    if (errEl) errEl.textContent = 'Entrez le code reçu par SMS';
    return;
  }
  if (!window._telephoneEnAttente) {
    if (errEl) errEl.textContent = '❌ Recommencez — aucun numéro en attente de vérification';
    return;
  }
  if (errEl) errEl.textContent = '⏳ Vérification...';
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/verify', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'phone_change', phone: window._telephoneEnAttente, token: code })
    });
    const d = await r.json();
    if (!r.ok) {
      if (errEl) errEl.textContent = '❌ ' + (d.msg || d.error_description || d.message || 'Code incorrect');
      return;
    }
    // Le téléphone est maintenant confirmé côté Supabase. On rafraîchit
    // sb.user localement pour que phone_confirmed_at soit à jour, puis on
    // reprend exactement là où doLogin() s'était arrêté.
    if (d.access_token) {
      sb._setSession(d);
    } else {
      await sb.refreshSession();
    }
    window._telephoneEnAttente = null;
    if (errEl) errEl.textContent = '';
    showToast('✅ Téléphone vérifié !', 'success');
    const emailPourSuite = el('login-email')?.value.trim() || sb.user?.email || '';
    const remember = el('remember-me')?.checked;
    await _continuerApresAuthentification(emailPourSuite, errEl, remember);
  } catch(e) {
    if (errEl) errEl.textContent = '❌ ' + (e.message || 'Erreur réseau');
  }
}

// Appelée depuis app.js après un clic sur le lien de confirmation
// d'inscription (type=signup) — établit la session puis enchaîne soit
// sur la vérification téléphone (première fois), soit directement sur le
// tableau de bord (comptes déjà vérifiés, cas rare pour ce chemin précis).
async function apresConnexionVerifierTelephone() {
  if (!sb.user?.phone_confirmed_at) {
    goScreen('verification-telephone', null);
    return;
  }
  await _continuerApresAuthentification(sb.user?.email || '', null, false);
}

// ============================================================
// IDENTITÉ PUBLIQUE — ANNUAIRE, NOM/CABINET PARTOUT
// ============================================================

// Crée ou met à jour la fiche publique du comptable (nom/cabinet) à partir
// des métadonnées d'inscription. Idempotent — appelé à chaque connexion.
async function synchroniserProfilComptable() {
  const user = sb.user;
  if (!user) return;
  const meta = user.user_metadata || {};
  try {
    await fetch(SUPABASE_URL + '/rest/v1/profils_comptable', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        nom: meta.nom || user.email.split('@')[0],
        cabinet: meta.cabinet || '',
      })
    });
  } catch(e) { console.warn('synchroniserProfilComptable:', e); }
}

// S'assure qu'une entreprise a au moins un profil minimal (raison sociale)
// dès la première connexion, pour apparaître dans l'annuaire Zelto sans
// attendre que l'utilisateur remplisse son profil manuellement.
async function assurerProfilEntrepriseMinimal() {
  if (STATE.profil && STATE.profil.raison) return; // déjà rempli
  const user = sb.user;
  if (!user) return;
  const meta = user.user_metadata || {};
  const raisonPlaceholder = meta.nom || user.email.split('@')[0];
  try {
    await sb.upsert('profils_entreprise', { id: user.id, raison: raisonPlaceholder });
    STATE.profil.raison = raisonPlaceholder;
  } catch(e) { console.warn('assurerProfilEntrepriseMinimal:', e); }
}

// Le comptable doit voir sa propre entité comme premier "client" de son
// portefeuille — crée une invitation auto-acceptée vers lui-même si absente.
async function assurerAutoClientComptable() {
  const user = sb.user;
  if (!user) return;
  try {
    const existe = await fetch(
      SUPABASE_URL + '/rest/v1/invitations_comptable?comptable_email=eq.' + encodeURIComponent(user.email) + '&entreprise_email=eq.' + encodeURIComponent(user.email) + '&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token } }
    ).then(function(r) { return r.json(); });
    if (existe && existe.length) return; // déjà créé

    await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sb.token,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        comptable_email: user.email,
        entreprise_email: user.email,
        entreprise_id: user.id,
        statut: 'acceptee',
        sens: 'auto_soi_meme'
      })
    });
    // Recharger pour que ce "client" apparaisse immédiatement
    await loadComptableApp();
  } catch(e) { console.warn('assurerAutoClientComptable:', e); }
}

// ============================================================
// LOAD COMPTABLE APP
// ============================================================



// Accepter invitation depuis modal (ancien système)
async function accepterInvitation() {
  closeAllModals();
  await doLogin();
}
