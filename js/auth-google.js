// ZELTO — auth-google.js : lien expiré, connexion Google (désactivée tant que non configurée), navigateurs intégrés.
// Pour activer Google : configurer Google dans Supabase (Authentication → Providers), puis mettre true ci-dessous.
var GOOGLE_LOGIN_ACTIF = true;

function navigateurIntegre() {
  var ua = navigator.userAgent || '';
  var m = /(Instagram|FBAN|FBAV|FB_IAB|Messenger|WhatsApp|Line\/|TikTok|musical_ly|BytedanceWebview|Snapchat|LinkedInApp)/i.exec(ua);
  if (!m) return '';
  var noms = { fban: 'Facebook', fbav: 'Facebook', fb_iab: 'Facebook', line: 'Line', musical_ly: 'TikTok', bytedancewebview: 'TikTok', linkedinapp: 'LinkedIn' };
  var k = m[1].toLowerCase().replace('/', '');
  return noms[k] || m[1];
}

function copierLienApplication() {
  var url = window.location.origin + window.location.pathname;
  function ok() { showToast('Lien copié. Collez-le dans Chrome ou Safari.', 'success'); }
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(ok, function () { window.prompt('Copiez ce lien :', url); }); }
  else { window.prompt('Copiez ce lien :', url); }
}

function connexionGoogle() {
  if (navigateurIntegre()) {
    var e = document.getElementById('login-err');
    if (e) e.textContent = 'Google ne fonctionne pas dans ce navigateur intégré. Ouvrez le lien dans Chrome ou Safari, ou connectez-vous avec votre e-mail.';
    return;
  }
  if (window._googleEnCours) return;
  window._googleEnCours = true;
  var bg = document.querySelector('#btn-google button');
  if (bg) { bg.disabled = true; bg.style.opacity = '.7'; var sp = bg.querySelector('span'); if (sp) sp.textContent = 'Connexion à Google…'; }
  window.location.href = SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(window.location.origin + window.location.pathname);
}


// Écran « Connexion en cours… » affiché dès le retour de Google, pour que la page de connexion ne donne pas l'impression d'un échec.
function chargementGoogle(afficher) {
  var d = document.getElementById('chargement-google');
  if (!afficher) { if (d) d.remove(); return; }
  if (d || !document.body) return;
  d = document.createElement('div');
  d.id = 'chargement-google';
  d.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#0F2A22;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:inherit;font-size:16px;gap:14px';
  d.innerHTML = '<div style="width:34px;height:34px;border:3px solid rgba(255,255,255,.25);border-top-color:#C8E86B;border-radius:50%;animation:cgspin 0.9s linear infinite"></div><div>Connexion en cours…</div><style>@keyframes cgspin{to{transform:rotate(360deg)}}</style>';
  document.body.appendChild(d);
}
window.addEventListener('pageshow', function (e) {
  if (e.persisted) { window._googleEnCours = false; var bg = document.querySelector('#btn-google button'); if (bg) { bg.disabled = false; bg.style.opacity = ''; var sp = bg.querySelector('span'); if (sp) sp.textContent = 'Continuer avec Google'; } }
});

async function finaliserConnexionOAuth(accessToken, refreshToken) {
  history.replaceState(null, '', window.location.pathname + window.location.search);
  chargementGoogle(true);
  try {
    var r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + accessToken } });
    var u = await r.json();
    if (!r.ok || !u || !u.id) throw new Error('Connexion Google impossible');
    try { localStorage.setItem('bp_remember_v2', '1'); } catch (e) {}
    sb._setSession({ access_token: accessToken, refresh_token: refreshToken, user: u });
    if (await compteGoogleANouveau(u, accessToken)) { chargementGoogle(false); await demanderTypeCompte(u, accessToken); chargementGoogle(true); }
    await apresConnexionVerifierTelephone();
    chargementGoogle(false);
  } catch (e) {
    chargementGoogle(false);
    goScreen('auth', null); switchTab('login');
    var el2 = document.getElementById('login-err'); if (el2) el2.textContent = 'La connexion Google a échoué. Réessayez ou utilisez votre e-mail.';
  }
}


// ── Choix du type de compte à la première connexion Google ──────────────
function _hdrG(tok) { return { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }; }

// Vrai seulement pour un NOUVEAU compte Google (aucun rôle, aucune fiche, aucune invitation, pas membre d'équipe).
// En cas de doute ou d'erreur réseau : faux (l'utilisateur arrive dans son espace habituel, rien n'est demandé).
async function compteGoogleANouveau(u, tok) {
  try {
    var prov = (u.app_metadata && u.app_metadata.provider) || '';
    if (prov !== 'google') { console.info('compteGoogleANouveau: fournisseur =', prov); return false; }
    if (u.user_metadata && u.user_metadata.role) { console.info('compteGoogleANouveau: rôle déjà défini'); return false; }
    var h = _hdrG(tok), em = (u.email || '').toLowerCase();
    var urls = [
      '/rest/v1/profils_entreprise?id=eq.' + u.id + '&select=id&limit=1',
      '/rest/v1/profils_comptable?user_id=eq.' + u.id + '&select=id&limit=1',
      '/rest/v1/profils_comptable?email=eq.' + encodeURIComponent(em) + '&select=id&limit=1',
      '/rest/v1/invitations_comptable?comptable_email=eq.' + encodeURIComponent(em) + '&statut=eq.acceptee&limit=1'
    ];
    for (var i = 0; i < urls.length; i++) {
      var r = await fetch(SUPABASE_URL + urls[i], { headers: h });
      if (!r.ok) {
        // La 1re vérification (sa propre fiche entreprise) est indispensable. Les autres peuvent être refusées
        // par la base (ex. « permission denied for table users ») : on les ignore au lieu de bloquer le choix.
        console.warn('compteGoogleANouveau: vérification ignorée', r.status, urls[i]);
        if (i === 0) return false;
        continue;
      }
      var rows = await r.json();
      if (rows && rows.length) { console.info('compteGoogleANouveau: fiche existante', urls[i]); return false; }
    }
    var rE = await fetch(SUPABASE_URL + '/rest/v1/rpc/mon_entreprise_id', { method: 'POST', headers: h, body: '{}' });
    // Pour un compte tout neuf cette fonction peut échouer : on l'ignore (même tolérance qu'à la connexion par e-mail).
    if (rE.ok) { var eid = await rE.json(); if (eid && eid !== u.id) return false; }
    else console.warn('compteGoogleANouveau mon_entreprise_id ignoré:', rE.status);
    var rA = await fetch(SUPABASE_URL + '/rest/v1/rpc/email_est_agent_support', { method: 'POST', headers: h, body: JSON.stringify({ p_email: em }) });
    if (rA.ok && (await rA.json())) return false;
    console.info('compteGoogleANouveau: compte neuf, choix affiché');
    return true;
  } catch (e) { return false; }
}

// Affiche l'écran de choix. Résout quand le rôle est enregistré dans le compte.
function demanderTypeCompte(u, tok) {
  return new Promise(function (resolve) {
    var nomG = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || (u.email || '').split('@')[0];
    var d = document.createElement('div');
    d.id = 'choix-compte';
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(20,36,31,.72);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
    var card = 'background:#fff;border-radius:16px;max-width:420px;width:100%;padding:22px;font-family:inherit;color:#14241F';
    var opt = 'display:block;width:100%;text-align:left;border:1.5px solid #DDE3DA;background:#fff;border-radius:12px;padding:14px;margin-top:10px;cursor:pointer;font:inherit;color:#14241F';
    d.innerHTML = '<div style="' + card + '">' +
      '<div style="font-size:19px;font-weight:800">Bienvenue sur Tafir</div>' +
      '<div style="font-size:14px;color:#4C5A53;margin-top:6px">Vous êtes :</div>' +
      '<button type="button" id="cc-ent" style="' + opt + '"><b>Une entreprise</b><br><span style="font-size:13px;color:#4C5A53">Je crée mes factures et mes devis.</span></button>' +
      '<button type="button" id="cc-cpt" style="' + opt + '"><b>Un cabinet d’expertise comptable</b><br><span style="font-size:13px;color:#4C5A53">Je consulte les factures de mes clients.</span></button>' +
      '<div id="cc-cab" style="display:none;margin-top:12px"><label style="font-size:13px;font-weight:600">Nom du cabinet</label>' +
      '<input id="cc-cabinet" type="text" maxlength="120" style="width:100%;box-sizing:border-box;margin-top:4px;padding:11px;border:1.5px solid #DDE3DA;border-radius:10px;font:inherit"></div>' +
      '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:#4C5A53;margin-top:14px"><input type="checkbox" id="cc-cgu" style="margin-top:2px"><span>J’accepte les <a href="legal.html#cgu" target="_blank" style="color:#1B6B52">conditions d’utilisation</a> et la <a href="legal.html#confidentialite" target="_blank" style="color:#1B6B52">politique de confidentialité</a>.</span></label>' +
      '<div id="cc-err" style="color:#B3261E;font-size:13px;margin-top:8px;min-height:16px"></div>' +
      '<button type="button" id="cc-ok" class="a-btn" style="margin-top:6px;width:100%">Continuer</button></div>';
    document.body.appendChild(d);
    var role = '';
    function pick(r) {
      role = r;
      document.getElementById('cc-ent').style.borderColor = r === 'entreprise' ? '#1B6B52' : '#DDE3DA';
      document.getElementById('cc-cpt').style.borderColor = r === 'comptable' ? '#1B6B52' : '#DDE3DA';
      document.getElementById('cc-cab').style.display = r === 'comptable' ? 'block' : 'none';
    }
    document.getElementById('cc-ent').onclick = function () { pick('entreprise'); };
    document.getElementById('cc-cpt').onclick = function () { pick('comptable'); };
    document.getElementById('cc-ok').onclick = async function () {
      var err = document.getElementById('cc-err'), btn = this;
      if (!role) { err.textContent = 'Choisissez entreprise ou cabinet.'; return; }
      if (!document.getElementById('cc-cgu').checked) { err.textContent = 'Veuillez accepter les conditions et la politique de confidentialité.'; return; }
      var cabinet = (document.getElementById('cc-cabinet').value || '').trim();
      if (role === 'comptable' && !cabinet) { err.textContent = 'Indiquez le nom du cabinet.'; return; }
      btn.disabled = true; err.textContent = 'Enregistrement…';
      try {
        var data = { role: role, nom: nomG };
        if (role === 'comptable') data.cabinet = cabinet;
        var r = await fetch(SUPABASE_URL + '/auth/v1/user', { method: 'PUT', headers: _hdrG(tok), body: JSON.stringify({ data: data }) });
        var nu = await r.json();
        if (!r.ok || !nu || !nu.id) throw new Error('Enregistrement impossible');
        sb.user = nu;
        try { localStorage.setItem('bp_u', JSON.stringify(nu)); } catch (e) {}
        d.remove(); resolve(true);
      } catch (e) { btn.disabled = false; err.textContent = 'Échec de l’enregistrement. Réessayez.'; }
    };
  });
}

function messageLienExpire() {
  var h = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  var code = h.get('error_code') || '', err = h.get('error') || '';
  if (!code && !err) return;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  goScreen('auth', null); switchTab('login');
  var msg = (code === 'otp_expired' || /expired|invalid/i.test(h.get('error_description') || ''))
    ? 'Ce lien a expiré ou a déjà été utilisé. Si vous avez déjà confirmé votre e-mail, connectez-vous. Sinon, entrez votre e-mail puis cliquez sur « Mot de passe oublié ? » pour recevoir un nouveau lien.'
    : 'La connexion n\'a pas abouti. Réessayez avec votre e-mail.';
  var e = document.getElementById('login-err'); if (e) e.textContent = msg;
}

function installerBoutonGoogle() {
  var zone = document.getElementById('aw-normal');
  if (!zone || document.getElementById('btn-google') || !GOOGLE_LOGIN_ACTIF) return;
  var cible = zone.querySelector('.a-btn');
  if (!cible) return;
  var bloc = document.createElement('div');
  bloc.id = 'btn-google';
  bloc.innerHTML = '<div style="text-align:center;font-size:12px;color:#8E9C95;margin:12px 0 8px">ou</div>' +
    '<button type="button" class="a-btn" style="background:#fff;color:#14241F;border:1.5px solid #DDE3DA;display:flex;align-items:center;justify-content:center;gap:10px" onclick="connexionGoogle()"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style="flex:none"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg><span>Continuer avec Google</span></button>';
  cible.insertAdjacentElement('afterend', bloc);
  var nom = navigateurIntegre();
  if (nom) {
    var b = document.createElement('div');
    b.style.cssText = 'margin-top:10px;background:#F7EFDC;border-left:3px solid #B8860B;padding:10px;border-radius:8px;font-size:12px;color:#7A5A0E';
    b.innerHTML = 'Vous êtes dans le navigateur de ' + escapeHTML(nom) + '. La connexion par e-mail fonctionne ici. Pour Google, ouvrez cette page dans Chrome ou Safari. <a onclick="copierLienApplication()" style="text-decoration:underline;cursor:pointer;font-weight:700">Copier le lien</a>';
    bloc.appendChild(b);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  var hp = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  if (hp.get('access_token') && hp.get('token_type') === 'bearer' && !hp.get('type')) chargementGoogle(true);
  installerBoutonGoogle(); messageLienExpire();
});
