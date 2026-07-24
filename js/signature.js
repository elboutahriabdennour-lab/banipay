// BANIPAY — signature.js — Signature tactile pour Accepter devis/facture

window._signatureCtx = null; // { docId, type }
window._sigHasDrawn = false;

function ouvrirModalSignature(docId, type) {
  window._signatureCtx = { docId, type };
  window._sigHasDrawn = false;
  el('modal-signature')?.classList.add('active');
  setTimeout(initSignatureCanvas, 50);
}

function initSignatureCanvas() {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#0F172A';
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
  await traiterActionDocument(ctx.docId, ctx.type, 'accepter', dataUrl);
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
  ctx.strokeStyle = '#0F172A';
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
