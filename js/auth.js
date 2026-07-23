// BANIPAY — auth.js

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
    entBtn.style.border = '2px solid #2563EB';
    entBtn.style.background = '#EFF6FF';
    entBtn.style.transform = 'scale(1.02)';
    cptBtn.style.border = '2px solid #E2E8F0';
    cptBtn.style.background = '#F8FAFC';
    cptBtn.style.transform = 'scale(1)';
    if (cptFields) cptFields.style.display = 'none';
  } else {
    cptBtn.style.border = '2px solid #9333EA';
    cptBtn.style.background = '#F3E8FF';
    cptBtn.style.transform = 'scale(1.02)';
    entBtn.style.border = '2px solid #E2E8F0';
    entBtn.style.background = '#F8FAFC';
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
  if (errEl) errEl.textContent = '⏳ Création...';
  try {
    await sb.signup(email, pwd, { nom, role, cabinet });
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

async function doLogin() {
  const email = el('login-email')?.value.trim();
  const pwd = el('login-password')?.value;
  const errEl = el('login-err');
  const remember = el('remember-me')?.checked;
  if (errEl) errEl.textContent = '';
  if (!email || !pwd) { if(errEl) errEl.textContent = 'Remplissez tous les champs'; return; }
  if (errEl) errEl.textContent = '⏳ Connexion...';
  try {
    await sb.login(email, pwd);
    // Email confirmation désactivée dans Supabase - pas de vérification
    // const confirmed = sb.user?.email_confirmed_at || sb.user?.confirmed_at;
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
      await loadComptableApp();
      goScreen('comptable');
      showToast('✅ Bienvenue dans votre espace comptable !', 'success');
    } else {
      // Reset données avant chargement nouveau compte
      STATE.factures = []; STATE.devis = []; STATE.clients = [];
      STATE.produits = []; STATE.avoirs = []; STATE.achats = []; STATE.abonnements = [];
      await loadAll();
      await loadAchats();
      if (typeof loadAbonnements === 'function') await loadAbonnements();
      if (typeof verifierAbonnements === 'function') await verifierAbonnements();

      // Traiter invitation en attente
      if (window._pendingInviteCpt) {
        const inv = window._pendingInviteCpt;
        window._pendingInviteCpt = null;
        try {
          await fetch(SUPABASE_URL + '/rest/v1/invitations_comptable?comptable_email=eq.' + encodeURIComponent(inv.emailCpt) + '&entreprise_email=eq.' + encodeURIComponent(inv.pourEmail), {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ statut: 'acceptee', entreprise_id: sb.user.id })
          });
          showToast('✅ Invitation acceptée ! Votre comptable a maintenant accès.', 'success');
        } catch(e2) {}
      }

      goScreen('dashboard');
      showToast('✅ Bienvenue !', 'success');
    }
  } catch(e) {
    if (errEl) errEl.textContent = '❌ ' + (e.message || 'Email ou mot de passe incorrect');
  }
}

// ============================================================
// LOAD COMPTABLE APP
// ============================================================



// Accepter invitation depuis modal (ancien système)
async function accepterInvitation() {
  closeAllModals();
  await doLogin();
}
