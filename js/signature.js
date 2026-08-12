// ZELTO — signature.js — Signature tactile pour Accepter devis/facture

window._signatureCtx = null; // { docId, type, token }
window._sigHasDrawn = false;

function ouvrirModalSignature(docId, type, token) {
  window._signatureCtx = { docId, type, token };
  window._sigHasDrawn = false;
  el('modal-signature')?.classList.add('active');
  setTimeout(initSignatureCanvas, 50);
}

function initSignatureCanvas() {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  // FIX: si le modal vient tout juste de s'afficher, getBoundingClientRect()
  // peut renvoyer 0x0 (mise en page pas encore calculée) — repli sur une
  // taille fixe raisonnable plutôt qu'un canvas inutilisable de 0 pixel.
  const largeur = rect.width > 0 ? rect.width : 300;
  const hauteur = rect.height > 0 ? rect.height : 160;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = largeur * ratio;
  canvas.height = hauteur * ratio;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#2A2420';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let drawing = false;
  let last = null;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const p = e.touches && e.touches.length ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  function start(e) { drawing = true; last = pos(e); window._sigHasDrawn = true; e.preventDefault(); }
  function move(e) {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    e.preventDefault();
  }
  function end() { drawing = false; }

  canvas.onmousedown = start;
  canvas.onmousemove = move;
  canvas.onmouseup = end;
  canvas.onmouseleave = end;
  canvas.ontouchstart = start;
  canvas.ontouchmove = move;
  canvas.ontouchend = end;
}

function effacerSignature() {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  window._sigHasDrawn = false;
}

async function confirmerSignatureEtAccepter() {
  const ctx = window._signatureCtx;
  if (!ctx) return;
  if (!window._sigHasDrawn) { showToast('Veuillez signer avant de valider', 'error'); return; }
  const canvas = document.getElementById('sig-canvas');
  const dataUrl = canvas.toDataURL('image/png');
  el('modal-signature')?.classList.remove('active');
  await traiterActionDocument(ctx.docId, ctx.type, 'accepter', dataUrl, ctx.token);
  window._signatureCtx = null;
}

// FIX: la signature était un passage obligé pour accepter — si le client ne
// dessinait rien (canvas mal compris sur mobile, hésitation...), il restait
// bloqué sur la fenêtre sans jamais pouvoir valider, ce qui ressemblait à un
// bouton "Accepter" complètement cassé. La signature reste proposée mais
// devient sautable : accepter ne doit jamais dépendre d'elle.
async function accepterSansSignature() {
  const ctx = window._signatureCtx;
  if (!ctx) return;
  el('modal-signature')?.classList.remove('active');
  await traiterActionDocument(ctx.docId, ctx.type, 'accepter', null, ctx.token);
  window._signatureCtx = null;
}

function annulerSignature() {
  el('modal-signature')?.classList.remove('active');
  window._signatureCtx = null;
}

// ============================================================
// SIGNATURE D'ENTREPRISE (paramètres du profil)
// ============================================================
// Même mécanique que la signature d'acceptation, mais dessinée une fois dans
// les paramètres du profil et réutilisée automatiquement sur tous les PDF
// générés (cachet émetteur), à côté de la signature du client une fois le
// document accepté.

window._sigEntrepriseHasDrawn = false;

function initSignatureEntrepriseCanvas() {
  const canvas = document.getElementById('pe-sig-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#2A2420';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  window._sigEntrepriseHasDrawn = false;

  // Pré-charger la signature déjà enregistrée, s'il y en a une, pour que
  // l'utilisateur voie ce qui est actuellement utilisé sur ses documents.
  const existante = STATE.profil?.signature_entreprise;
  if (existante) {
    const img = new Image();
    img.onload = function() {
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = existante;
  }

  let drawing = false;
  let last = null;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const p = e.touches && e.touches.length ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  function start(e) { drawing = true; last = pos(e); window._sigEntrepriseHasDrawn = true; e.preventDefault(); }
  function move(e) {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    e.preventDefault();
  }
  function end() { drawing = false; }

  canvas.onmousedown = start;
  canvas.onmousemove = move;
  canvas.onmouseup = end;
  canvas.onmouseleave = end;
  canvas.ontouchstart = start;
  canvas.ontouchmove = move;
  canvas.ontouchend = end;
}

function effacerSignatureEntreprise() {
  const canvas = document.getElementById('pe-sig-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  window._sigEntrepriseHasDrawn = true; // "effacer" = un choix explicite à sauvegarder (signature vidée)
}

// Retourne le PNG base64 de la signature d'entreprise UNIQUEMENT si elle a
// été (re)dessinée pendant cette session d'édition — sinon null, pour que
// saveProfil() n'écrase pas la signature déjà enregistrée sans raison.
function getSignatureEntrepriseDataUrl() {
  const canvas = document.getElementById('pe-sig-canvas');
  if (!canvas || !window._sigEntrepriseHasDrawn) return null;
  return canvas.toDataURL('image/png');
}

// Permet d'utiliser une photo (cachet/tampon scanné) à la place d'une
// signature dessinée à la main — l'image est posée sur le même canvas et
// suit ensuite exactement le même chemin de sauvegarde.
function importerPhotoSignatureEntreprise(event) {
  const file = event.target.files[0];
  if (!file) return;
  const canvas = document.getElementById('pe-sig-canvas');
  if (!canvas) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Ajuste l'image au canvas en conservant ses proportions
      const ratioImg = img.width / img.height;
      const ratioCanvas = rect.width / rect.height;
      let w, h, x, y;
      if (ratioImg > ratioCanvas) { w = rect.width; h = rect.width / ratioImg; x = 0; y = (rect.height - h) / 2; }
      else { h = rect.height; w = rect.height * ratioImg; y = 0; x = (rect.width - w) / 2; }
      ctx.drawImage(img, x, y, w, h);
      window._sigEntrepriseHasDrawn = true;
      showToast('✅ Cachet importé — pensez à Enregistrer', 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}
