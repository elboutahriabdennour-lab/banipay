// ============================================================
// BANIPAY — auth.js — Authentification (login, signup, session)
// ============================================================

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
  sb.logout();
  Object.assign(STATE, { factures:[], devis:[], clients:[], produits:[], avoirs:[], paiements:[], profil:{}, notifications:[] });
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
    entBtn.querySelector('div:nth-child(2)').style.color = '#2563EB';
    cptBtn.style.border = '2px solid #E2E8F0';
    cptBtn.style.background = '#F8FAFC';
    cptBtn.querySelector('div:nth-child(2)').style.color = '#64748B';
    if (cptFields) cptFields.style.display = 'none';
  } else {
    cptBtn.style.border = '2px solid #9333EA';
    cptBtn.style.background = '#F3E8FF';
    cptBtn.querySelector('div:nth-child(2)').style.color = '#9333EA';
    entBtn.style.border = '2px solid #E2E8F0';
    entBtn.style.background = '#F8FAFC';
    entBtn.querySelector('div:nth-child(2)').style.color = '#64748B';
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
  if (errEl) errEl.textContent = '';
  if (!email || !pwd) { if(errEl) errEl.textContent = 'Remplissez tous les champs'; return; }
  if (errEl) errEl.textContent = '⏳ Connexion...';
  try {
    await sb.login(email, pwd);
    const confirmed = sb.user?.email_confirmed_at || sb.user?.confirmed_at;
    if (!confirmed) {
      sb.logout();
      window._pendingConfirmEmail = email;
      switchTab('confirm');
      const cEl = el('confirm-email-display');
      if (cEl) cEl.textContent = email;
      if (errEl) errEl.textContent = '';
      showToast('Confirmez votre email avant de continuer', 'error');
      return;
    }
    const role = sb.user?.user_metadata?.role || 'entreprise';
    CPT.role = role;
    if (role === 'comptable') {
      await loadComptableApp();
      goScreen('comptable');
    } else {
      await loadAll();
      goScreen('dashboard');
    }
    showToast('✅ Bienvenue !', 'success');
  } catch(e) {
    if (errEl) errEl.textContent = '❌ ' + (e.message || 'Email ou mot de passe incorrect');
  }
}

// ============================================================
// LOAD COMPTABLE APP
// ============================================================


function checkPwdStrength() {
  const pwd = el('signup-password')?.value || '';
  const bar = el('pwd-bar');
  const hint = el('pwd-hint');
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const colors = ['#EF4444','#F97316','#EAB308','#22C55E'];
  const labels = ['Trop court','Faible','Moyen','Fort'];
  if (bar) { bar.style.width = (score * 25) + '%'; bar.style.background = colors[score-1] || '#E2E8F0'; }
  if (hint) { hint.textContent = pwd.length ? labels[score-1] || '' : ''; hint.style.color = colors[score-1] || '#94A3B8'; }
}

function checkPwdMatch() {
  const p1 = el('signup-password')?.value;
  const p2 = el('signup-password2')?.value;
  const m = el('pwd-match');
  if (!m || !p2) return;
  m.textContent = p1 === p2 ? '✅ Identiques' : '❌ Différents';
  m.style.color = p1 === p2 ? '#22C55E' : '#EF4444';
}
