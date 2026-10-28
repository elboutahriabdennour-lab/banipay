// ZELTO — auth-google.js : lien expiré, connexion Google (désactivée tant que non configurée), navigateurs intégrés.
// Pour activer Google : configurer Google dans Supabase (Authentication → Providers), puis mettre true ci-dessous.
var GOOGLE_LOGIN_ACTIF = false;

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
  window.location.href = SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(window.location.origin + window.location.pathname);
}

async function finaliserConnexionOAuth(accessToken, refreshToken) {
  history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    var r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + accessToken } });
    var u = await r.json();
    if (!r.ok || !u || !u.id) throw new Error('Connexion Google impossible');
    try { localStorage.setItem('bp_remember_v2', '1'); } catch (e) {}
    sb._setSession({ access_token: accessToken, refresh_token: refreshToken, user: u });
    await apresConnexionVerifierTelephone();
  } catch (e) {
    goScreen('auth', null); switchTab('login');
    var el2 = document.getElementById('login-err'); if (el2) el2.textContent = 'La connexion Google a échoué. Réessayez ou utilisez votre e-mail.';
  }
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
  bloc.innerHTML = '<div style="text-align:center;font-size:12px;color:#9C9186;margin:12px 0 8px">ou</div>' +
    '<button type="button" class="a-btn" style="background:#fff;color:#2A2420;border:1.5px solid #E3DCCF" onclick="connexionGoogle()">Continuer avec Google</button>';
  cible.insertAdjacentElement('afterend', bloc);
  var nom = navigateurIntegre();
  if (nom) {
    var b = document.createElement('div');
    b.style.cssText = 'margin-top:10px;background:#F7EFDC;border-left:3px solid #B8860B;padding:10px;border-radius:8px;font-size:12px;color:#7A5A0E';
    b.innerHTML = 'Vous êtes dans le navigateur de ' + escapeHTML(nom) + '. La connexion par e-mail fonctionne ici. Pour Google, ouvrez cette page dans Chrome ou Safari. <a onclick="copierLienApplication()" style="text-decoration:underline;cursor:pointer;font-weight:700">Copier le lien</a>';
    bloc.appendChild(b);
  }
}

document.addEventListener('DOMContentLoaded', function () { installerBoutonGoogle(); messageLienExpire(); });
