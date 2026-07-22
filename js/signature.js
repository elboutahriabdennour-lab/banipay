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
