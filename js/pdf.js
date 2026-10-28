// ZELTO — pdf.js
// QR code généré localement (aucune adresse envoyée à un service tiers). Vide si la bibliothèque n'est pas chargée.
function _qrLocal(texte) {
  try {
    if (typeof qrcode !== 'function') return '';
    const q = qrcode(0, 'M'); q.addData(String(texte)); q.make();
    return q.createDataURL(3, 0);
  } catch (e) { return ''; }
}
function construireRefsQRFacture(f) {
  const refsQR = [];
  const base = window.location.origin + window.location.pathname;
  if (f.devis_ref) {
    const devisTrouve = (STATE.devis || []).find(function(d) { return d.ref === f.devis_ref; });
    refsQR.push({ icon: '', label: 'Devis', ref: f.devis_ref, url: '' });
  }
  if (f.bc_id) {
    const bcTrouve = (STATE.bonsCommande || []).find(function(b) { return b.id === f.bc_id; });
    if (bcTrouve) refsQR.push({ icon: '', label: 'Bon de commande', ref: bcTrouve.ref, url: '' });
  }
  const blTrouve = (STATE.bonsLivraison || []).find(function(bl) { return bl.facture_id === f.id; });
  if (blTrouve) refsQR.push({ icon: '', label: 'Bon de livraison', ref: blTrouve.ref, url: '' });
  return refsQR;
}
function optionsPDFFacture(f) {
  const profil = STATE.profil || {};
  const lignes = lignesEnTableau(f.lignes);
  const docUrl = window.location.origin + window.location.pathname + '?doc=' + f.id + '&t=' + (f.token_public||'');
  return {
    type:'FACTURE', ref:f.ref, color: profil.couleur_accent || '#1B5E4B',
    emetteur: profil,
    destinataire:(function() {
      const clientTrouve = (STATE.clients || []).find(function(c) { return c.nom === f.client; });
      return { nom: f.client, chantier: f.chantier, ice: clientTrouve?.ice || f.client_ice || '', tel: clientTrouve?.tel || f.client_tel || '', adresse: clientTrouve?.adresse || f.client_adresse || '' };
    })(),
    date:f.date_emission, echeance:f.echeance,
    paiement:f.paiement, statut:f.statut,
    lignes: lignes, note:f.note,
    ht:f.ht, tva:f.tva, ttc:f.ttc,
    devise:f.devise||'MAD',
    montant_recu:f.montant_recu,
    showStamp: f.statut==='payee',
    doc_id: f.id,
    doc_url: docUrl,
    signatureClient: f.signature_data || null,
    refsQR: construireRefsQRFacture(f),
  };
}
function exportPDF(id) {
  const f = STATE.factures.find(x=>x.id===id); if(!f) return;
  genDocPDF(optionsPDFFacture(f));
}
function previewPDF() {
  const client = el('f-client')?.value.trim();
  if(!client){showToast('Remplissez le formulaire','error');return;}
  const _tp=calculerTotauxLignes(STATE.lignesF);
  genDocPDF({
    type:'FACTURE', ref:el('f-ref')?.value, color: (STATE.profil||{}).couleur_accent || '#1B5E4B',
    emetteur: STATE.profil||{},
    destinataire:{nom:client,chantier:el('f-chantier')?.value},
    date:el('f-date')?.value,
    echeance:el('f-echeance')?.value,
    paiement:el('f-paiement')?.value,
    lignes:STATE.lignesF,
    ht:_tp.ht, tva:_tp.tva, ttc:_tp.ttc,
    devise:STATE.deviseF||'MAD',
    note:el('f-note')?.value||'',
    devis_ref: STATE.currentFacture?.devis_ref||'',
    bl_ref: STATE.currentFacture?.bl_ref||'',
    doc_id: STATE.currentFacture?.id||'',
    doc_url: STATE.currentFacture?.id ? (window.location.origin + window.location.pathname + '?doc=' + STATE.currentFacture.id + '&t=' + (STATE.currentFacture.token_public||'')) : '',
  });
}
const _TRAD_PDF = {
  fr: {
    date: 'Date', echeance: 'Échéance', validite: 'Validité', jours: 'jours', paiement: 'Paiement',
    devisRef: 'Devis réf.', blRef: 'BL réf.', refSuffixe: 'réf.',
    avoirPour: 'Avoir pour', destinataire: 'Destinataire', factureA: 'Facturé à',
    projet: 'Projet', emetteur: 'Émetteur',
    designation: 'Désignation', qte: 'Qté', puHt: 'P.U. HT', totalHt: 'Total HT',
    sousTotalHt: 'Sous-total HT', tva: 'TVA', tvaCol: 'TVA', dejaRecu: 'Déjà reçu',
    totalTtc: 'TOTAL TTC', resteAPayer: 'Reste à payer',
    arreteA: 'Arrêté à la somme de', juridiction: 'Juridiction : Maroc.',
    note: 'Note', motif: 'Motif',
    coordBancaires: 'Coordonnées bancaires', conditions: 'Conditions', conditionsPaiement: 'Conditions de paiement',
    cachetSignature: 'Cachet & Signature émetteur', bonPourAccord: 'Bon pour accord — Client',
    typeLabels: { FACTURE:'FACTURE', DEVIS:'DEVIS', DEV:'DEVIS', AVOIR:'AVOIR', BC:'BON DE COMMANDE', BL:'BON DE LIVRAISON' },
  },
  ar: {
    date: 'التاريخ', echeance: 'تاريخ الاستحقاق', validite: 'صالح لمدة', jours: 'يوم', paiement: 'طريقة الأداء',
    devisRef: 'رقم عرض الثمن', blRef: 'رقم وصل التسليم', refSuffixe: 'رقم',
    avoirPour: 'إشعار دائن لـ', destinataire: 'المرسل إليه', factureA: 'فاتورة إلى',
    projet: 'المشروع', emetteur: 'المُصدر',
    designation: 'البيان', qte: 'الكمية', puHt: 'سعر الوحدة', totalHt: 'المجموع',
    sousTotalHt: 'المجموع قبل الضريبة', tva: 'ضريبة القيمة المضافة', tvaCol: 'الضريبة', dejaRecu: 'المبلغ المستلم',
    totalTtc: 'المجموع الإجمالي', resteAPayer: 'المبلغ المتبقي',
    arreteA: 'أوقف على مبلغ', juridiction: 'الاختصاص القضائي: المغرب.',
    note: 'ملاحظة', motif: 'السبب',
    coordBancaires: 'المعلومات البنكية', conditions: 'الشروط', conditionsPaiement: 'شروط الأداء',
    cachetSignature: 'ختم وتوقيع المُصدر', bonPourAccord: 'موافق عليه — العميل',
    typeLabels: { FACTURE:'فاتورة', DEVIS:'عرض ثمن', DEV:'عرض ثمن', AVOIR:'إشعار دائن', BC:'أمر شراء', BL:'وصل تسليم' },
  },
};
function _langPDF() { return (typeof localStorage !== 'undefined' && localStorage.getItem('bp_langue') === 'ar') ? 'ar' : 'fr'; }
// ── Modèle de facture personnalisable (couleur, police, en-tête, logo…) ──
// Stocké dans profils_entreprise.modele_facture (JSON). Toutes les valeurs sont validées ici :
// couleurs en #RRGGBB, polices dans une liste fermée, textes échappés à l'affichage.
var POLICES_MODELE = {
  inter:      { nom: 'Inter — moderne',        css: "'Inter',Arial,sans-serif",            gf: 'Inter:wght@400;600;700' },
  lora:       { nom: 'Lora — élégante',        css: "'Lora',Georgia,serif",                gf: 'Lora:wght@400;600;700' },
  poppins:    { nom: 'Poppins — arrondie',     css: "'Poppins',Arial,sans-serif",          gf: 'Poppins:wght@400;600;700' },
  montserrat: { nom: 'Montserrat — nette',     css: "'Montserrat',Arial,sans-serif",       gf: 'Montserrat:wght@400;600;700' },
  playfair:   { nom: 'Playfair — classique',   css: "'Playfair Display',Georgia,serif",    gf: 'Playfair+Display:wght@400;600;700' },
  georgia:    { nom: 'Georgia — sobre',        css: "Georgia,'Times New Roman',serif",     gf: '' }
};
var MODELE_DEFAUT = { couleur: '', police: 'inter', entete: 'sombre', logoPos: 'gauche', logoTaille: 'moyen', zebre: true,
  montrerRib: true, montrerSignature: true, montrerMarque: true, intro: '', pied: '' };
function normaliserModele(m) {
  m = (m && typeof m === 'object') ? m : {};
  var o = {};
  for (var k in MODELE_DEFAUT) o[k] = MODELE_DEFAUT[k];
  if (typeof m.couleur === 'string' && /^#[0-9a-fA-F]{6}$/.test(m.couleur)) o.couleur = m.couleur;
  if (POLICES_MODELE[m.police]) o.police = m.police;
  if (['sombre', 'couleur', 'clair'].indexOf(m.entete) >= 0) o.entete = m.entete;
  if (['gauche', 'droite'].indexOf(m.logoPos) >= 0) o.logoPos = m.logoPos;
  if (['petit', 'moyen', 'grand'].indexOf(m.logoTaille) >= 0) o.logoTaille = m.logoTaille;
  ['zebre', 'montrerRib', 'montrerSignature', 'montrerMarque'].forEach(function (c) { if (typeof m[c] === 'boolean') o[c] = m[c]; });
  if (typeof m.intro === 'string') o.intro = m.intro.slice(0, 300);
  if (typeof m.pied === 'string') o.pied = m.pied.slice(0, 200);
  return o;
}
function construireHTMLDoc(opts) {
  const {type,ref,color,emetteur:p,destinataire,date,echeance,validite,paiement,statut,lignes=[],note,ht=0,tva=0,ttc=0,devise='MAD',montant_recu=0,showStamp=false,showPrices=true,signature=false,extra='',motif='',devis_ref='',bl_ref='',doc_id='',badge_lettre=false,badge_tva=false,refsQR=[]} = opts;
  const signatureEmetteur = opts.signatureEmetteur || (p && p.signature_entreprise) || null;
  const signatureClient = opts.signatureClient || null;
  const isAvoir=type==='AVOIR', isDevis=type==='DEVIS'||type==='DEV', isBC=type==='BC', isBL=type==='BL';
  const m = normaliserModele(p && p.modele_facture);
  const police = POLICES_MODELE[m.police];
  const logoSrc = (p && typeof p.logo === 'string' && /^(data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]|https:\/\/)/i.test(p.logo)) ? escapeHTML(p.logo) : '';
  const colorHeader = isAvoir?'#8E2E24':isDevis?(m.couleur||'#B8860B'):isBC?'#7C5CA6':isBL?'#6E8F4E':(m.couleur||color||'#1B5E4B');
  const _hex = String(colorHeader).replace('#',''), _lum = (0.299*parseInt(_hex.substr(0,2),16)+0.587*parseInt(_hex.substr(2,2),16)+0.114*parseInt(_hex.substr(4,2),16))/255;
  const surAccent = _lum > 0.62 ? '#14241F' : '#fff';
  const paye = Number(montant_recu)||0;
  const restant = Math.max(0, ttc - paye);
  const langue = _langPDF();
  const t = _TRAD_PDF[langue];
  const typeAffiche = t.typeLabels[type] || type;
  const estRTL = langue === 'ar';
  // Lien et QR code : uniquement sur les devis (acceptation par le client). Pas sur les factures.
  const docUrl = isDevis ? (opts.doc_url || (doc_id ? (window.location.origin + window.location.pathname + '?doc=' + doc_id) : '')) : '';
  const qrUrl = docUrl ? _qrLocal(docUrl) : '';
  const lignesHtml = (Array.isArray(lignes)?lignes:[]).map((l,i) => {
    const total = (Number(l.qte)||0) * (Number(l.pu)||0);
    return `<tr style="background:${(m.zebre&&i%2===0)?'#F5F6F1':'#fff'}">
      <td style="padding:7px 8px;font-size:10px">${escapeHTML(l.desc||l.designation||'')}</td>
      <td style="padding:5px 8px;text-align:center;font-size:10px">${escapeHTML(String(l.qte||1))} ${escapeHTML(String(l.unite||''))}</td>
      ${showPrices?`<td style="padding:5px 8px;text-align:right;font-size:10px">${fmt(Number(l.pu)||0)}</td><td style="padding:5px 8px;text-align:right;font-size:10px">${Number(l.tva) >= 0 ? Number(l.tva) : 20} %</td><td style="padding:5px 8px;text-align:right;font-size:10px;font-weight:600">${fmt(total)}</td>`:''}
    </tr>`;
  }).join('');
  const _tx = calculerTotauxLignes(lignes);
  const rowsTVA = (_tx.parTaux.length && Math.abs(_tx.tva - Number(tva || 0)) <= 0.02)
    ? _tx.parTaux.map(function (x) { return '<div class="tot-row" style="background:#F7EFDC"><span>' + t.tva + ' ' + x.taux + ' %' + (x.taux === 0 ? (langue === 'ar' ? ' (معفى)' : ' (exonéré)') : '') + '</span><span style="font-weight:600;color:#14241F">' + fmt(x.tva) + ' ' + devise + '</span></div>'; }).join('')
    : '<div class="tot-row" style="background:#F7EFDC"><span>' + t.tva + '</span><span style="font-weight:600;color:#14241F">' + fmt(tva) + ' ' + devise + '</span></div>';
  const html = `<!DOCTYPE html><html lang="${langue}" dir="${estRTL ? 'rtl' : 'ltr'}"><head><meta charset="UTF-8">
<title>${escapeHTML(typeAffiche)} ${escapeHTML(ref)}<\/title>
<style>
${police.gf?`@import url('https://fonts.googleapis.com/css2?family=${police.gf}&display=swap');`:''}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:${police.css};color:#14241F;font-size:11px;background:#fff;width:210mm;min-height:297mm;margin:0 auto;max-width:210mm;display:flex;flex-direction:column}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;width:210mm;margin:0}
  .no-print{display:none}
  @page{margin:0;size:A4 portrait}
}
@media screen{body{box-shadow:0 0 20px rgba(0,0,0,0.1);margin:20px auto}}
.header{background:#14241F;padding:14px 24px;display:flex;justify-content:space-between;align-items:flex-start}
.h-logo{max-width:${m.logoTaille==='petit'?60:m.logoTaille==='grand'?130:80}px;max-height:${m.logoTaille==='petit'?30:m.logoTaille==='grand'?66:40}px;object-fit:contain;margin-bottom:5px;display:block}
.h-company{font-family:${police.css};font-size:15px;font-weight:700;color:#fff}
.h-right{text-align:right}
.h-doc-label{font-size:11px;font-weight:700;color:#fff;letter-spacing:1px;background:${colorHeader};color:${surAccent};padding:3px 10px;border-radius:4px;display:inline-block;margin-bottom:6px}
.h-ref{font-size:11px;font-weight:700;color:#fff}
.h-meta{font-size:10px;color:rgba(255,255,255,0.55);margin-top:3px;line-height:1.7}
.stripe{background:${colorHeader};height:3px}
.blocs{display:flex;gap:8px;padding:8px 24px}
.bloc{flex:1;border-radius:6px;overflow:hidden;border:1px solid #DDE3DA}
.bloc-hd{padding:5px 8px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;background:${colorHeader};color:${surAccent}}
.bloc-bd{padding:7px 8px;background:#fff}
.bloc-bd .main{font-size:11px;font-weight:700;margin-bottom:1px}
.bloc-bd .line{font-size:9px;color:#5B6B64;margin-top:1px}
.table-section{padding:0 24px}
table{width:100%;border-collapse:collapse}
thead tr{background:#14241F}
thead th{padding:5px 8px;font-size:9px;font-weight:700;color:#fff;text-align:left}
thead th:nth-child(2){text-align:center}
thead th:nth-child(3),thead th:nth-child(4),thead th:nth-child(5){text-align:right}
tbody td{border-bottom:1px solid #EAE4DA}
.totaux{padding:6px 24px;display:flex;justify-content:flex-end}
.totaux-box{width:250px;border:1px solid #DDE3DA;border-radius:6px;overflow:hidden}
.tot-row{display:flex;justify-content:space-between;padding:6px 8px;font-size:10px;border-bottom:1px solid #EAE4DA;color:#5B6B64}
.tot-main{display:flex;justify-content:space-between;padding:7px 8px;background:#14241F}
.tot-main-lbl{font-size:11px;font-weight:700;color:#fff}
.tot-main-val{font-size:12px;font-weight:700;color:#fff}
.arrete{padding:2px 24px 6px;font-size:10px;color:#5B6B64;font-style:italic}
.bank-box{margin:5px 24px;background:#EEF3E4;border-radius:6px;padding:7px 10px;font-size:9px;color:#6E8F4E;border:1px solid #C9D9AE}
.refs-box{margin:4px 24px;background:#E7F2EC;border-radius:6px;padding:5px 10px;font-size:9px;color:#134436;display:flex;gap:16px}
.sig-zone{display:flex;gap:8px;padding:5px 24px;margin-bottom:5px}
.sig-item{flex:1;border:1px dashed #BFCBBF;border-radius:6px;padding:10px;min-height:60px}
.sig-lbl{font-size:8px;font-weight:600;color:#8E9C95;text-transform:uppercase;margin-bottom:2px}
.footer{display:flex;justify-content:space-between;align-items:center;padding:6px 24px;margin-top:auto;border-top:1px solid #DDE3DA}
.footer-brand{font-family:${police.css};font-size:9px;font-weight:700;color:#1B5E4B}
.footer-brand span{color:#1B5E4B}
.footer-center{font-size:7px;color:#8E9C95;text-align:center;flex:1;padding:0 8px;line-height:1.5}
.footer-right{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.footer-page{font-size:8px;color:#8E9C95}
${m.entete==='couleur'?`.header{background:${colorHeader}}.h-company,.h-ref{color:${surAccent}}.h-meta{color:${surAccent};opacity:.75}.h-doc-label{background:rgba(255,255,255,0.22);color:${surAccent}}.stripe{background:rgba(0,0,0,0.18)}`:''}
${m.entete==='clair'?`.header{background:#fff;padding-bottom:12px}.h-company{color:#14241F}.h-ref{color:#14241F}.h-meta{color:#5B6B64}.stripe{height:4px}`:''}
.h-logo-d{margin-left:auto}
<\/style><\/head><body>
<div style="display:flex;flex-direction:column;flex:1">
<div class="header">
  <div>
    ${(logoSrc&&m.logoPos==='gauche')?`<img src="${logoSrc}" class="h-logo" alt="logo">`:''}
    <div class="h-company">${escapeHTML(p.raison||'Mon Entreprise')}</div>
  </div>
  <div class="h-right">
    ${(logoSrc&&m.logoPos==='droite')?`<img src="${logoSrc}" class="h-logo h-logo-d" alt="logo">`:''}
    <div class="h-doc-label">${typeAffiche}</div>
    <div class="h-ref">${escapeHTML(ref)}</div>
    <div class="h-meta">
      ${t.date} : ${date||'—'}<br>
      ${echeance?t.echeance+' : '+echeance+'<br>':''}
      ${validite?t.validite+' : '+validite+' '+t.jours+'<br>':''}
      ${t.paiement} : ${paiement||'—'}
    </div>
  </div>
</div>
<div class="stripe"></div>
<div style="height:12px"></div>
${m.intro?`<div style="margin:0 24px 8px;font-size:10px;color:#5B6B64;line-height:1.5">${escapeHTML(m.intro)}</div>`:''}
${(devis_ref||bl_ref||refsQR.length)?`<div class="refs-box" style="flex-wrap:wrap;align-items:center">
  ${devis_ref?`<span>${t.devisRef} : <strong>${escapeHTML(devis_ref)}</strong></span>`:''}
  ${bl_ref?`<span>${t.blRef} : <strong>${escapeHTML(bl_ref)}</strong></span>`:''}
  ${refsQR.map(function(r) {
    return '<span style="display:inline-flex;align-items:center;gap:6px">' + r.label + ' ' + t.refSuffixe + ' : <strong>' + escapeHTML(String(r.ref||'')) + '</strong>' +
      (r.url ? '<img src="https://api.qrserver.com/v1/create-qr-code/?size=44x44&data=' + encodeURIComponent(r.url) + '" width="30" height="30" style="border-radius:3px;vertical-align:middle">' : '') +
    '</span>';
  }).join('')}
</div>`:''}
<div class="blocs">
  <div class="bloc">
    <div class="bloc-hd">${isAvoir?t.avoirPour:isDevis?t.destinataire:t.factureA}</div>
    <div class="bloc-bd">
      <div class="main">${escapeHTML(destinataire.nom||'—')}</div>
      ${destinataire.chantier?`<div class="line">${t.projet} : ${escapeHTML(destinataire.chantier)}</div>`:''}
      ${destinataire.adresse?`<div class="line">${escapeHTML(destinataire.adresse||'')}</div>`:''}
      ${destinataire.ice?`<div class="line">ICE : ${escapeHTML(destinataire.ice)}</div>`:''}
      ${destinataire.tel?`<div class="line">Tél. : ${escapeHTML(destinataire.tel)}</div>`:''}
    </div>
  </div>
  <div class="bloc">
    <div class="bloc-hd">${t.emetteur}</div>
    <div class="bloc-bd">
      <div class="main">${escapeHTML(p.raison||'—')}</div>
      ${p.adresse?`<div class="line">${escapeHTML(p.adresse||'')}${p.ville?', '+escapeHTML(p.ville):''}</div>`:''}
      ${p.email?`<div class="line">E-mail : ${escapeHTML(p.email)}</div>`:''}
      ${p.tel?`<div class="line">Tél. : ${escapeHTML(p.tel)}</div>`:''}
      ${p.ice?`<div class="line">ICE : ${escapeHTML(p.ice)}</div>`:''}
      ${(p.identifiant_fiscal||p.rc)?`<div class="line">${p.identifiant_fiscal?'IF : '+escapeHTML(p.identifiant_fiscal):''}${(p.identifiant_fiscal&&p.rc)?' · ':''}${p.rc?'RC : '+escapeHTML(p.rc):''}</div>`:''}
    </div>
  </div>
</div>
<div style="height:12px"></div>
<div class="table-section">
<table>
<thead><tr>
  <th style="width:38%">${t.designation}</th>
  <th style="width:10%;text-align:center">${t.qte}</th>
  ${showPrices?`<th style="width:20%;text-align:right">${t.puHt} (${devise})</th><th style="width:8%;text-align:right">${t.tvaCol}</th><th style="width:24%;text-align:right">${t.totalHt} (${devise})</th>`:''}
</tr></thead>
<tbody>${lignesHtml}</tbody>
</table>
</div>
${showPrices?`
<div class="totaux"><div class="totaux-box">
  <div class="tot-row"><span>${t.sousTotalHt}</span><span style="font-weight:600;color:#14241F">${fmt(ht)} ${devise}</span></div>
  ${rowsTVA}
  ${paye>0?`<div class="tot-row" style="background:#EEF3E4"><span>${t.dejaRecu}</span><span style="font-weight:600;color:#6E8F4E">- ${fmt(paye)} ${devise}</span></div>`:''}
  <div class="tot-main"><span class="tot-main-lbl">${t.totalTtc}</span><span class="tot-main-val">${fmt(ttc)} ${devise}</span></div>
  ${paye>0&&restant>0?`<div class="tot-row" style="background:#F5E4E1"><span style="font-weight:700;color:#B23A2E">${t.resteAPayer}</span><span style="font-weight:700;color:#B23A2E">${fmt(restant)} ${devise}</span></div>`:''}
</div></div>
<div style="height:6px"></div>
<div class="arrete">${t.arreteA} <strong>${ttcEnLettres(ttc)}</strong>. ${t.juridiction}${(type==='FACTURE'&&langue!=='ar')?' Tout retard de paiement peut entraîner des pénalités, conformément à la réglementation en vigueur.':''}</div>
`:''}
${note?`<div style="margin:4px 24px;background:#F7EFDC;border-left:3px solid #B8860B;border-radius:0 6px 6px 0;padding:5px 8px;font-size:9px;color:#7A5A0E"><strong>${t.note} :</strong> ${escapeHTML(note)}</div>`:''}
${motif?`<div style="margin:6px 28px;background:#F5E4E1;border-left:3px solid #B23A2E;border-radius:0 6px 6px 0;padding:8px 10px;font-size:10px;color:#7A2E24"><strong>${t.motif} :</strong> ${escapeHTML(motif)}</div>`:''}
${(m.montrerRib&&(p.banque||p.rib))?`<div class="bank-box">
  ${t.coordBancaires} — ${escapeHTML(p.banque||'')}${p.rib?' · RIB/IBAN : <strong>'+escapeHTML(p.rib)+'</strong>':''}
  ${p.conditions?'<br>⏱️ '+t.conditions+' : '+escapeHTML(p.conditions):''}
</div>`:`${p.conditions?`<div class="bank-box" style="background:#E7F2EC;border-color:#CFE3E2;color:#134436">⏱️ ${t.conditionsPaiement} : ${escapeHTML(p.conditions)}</div>`:''}`}
<div style="flex:1;min-height:20px"></div>
${m.montrerSignature?`<div class="sig-zone">
  <div class="sig-item"><div class="sig-lbl">${t.cachetSignature}</div>${signatureEmetteur?`<img src="${signatureEmetteur}" style="max-width:100%;max-height:44px;object-fit:contain;margin-top:4px">`:''}</div>
  <div class="sig-item"><div class="sig-lbl">${t.bonPourAccord}</div>${signatureClient ? (signatureClient.startsWith('TEXTE:') ? `<div style="font-size:10px;color:#55702E;font-style:italic;margin-top:6px;line-height:1.4">✅ ${escapeHTML(signatureClient.slice(6))}</div>` : `<img src="${/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+\/=]+$/.test(signatureClient) ? signatureClient : ''}" style="max-width:100%;max-height:44px;object-fit:contain;margin-top:4px">`) : ''}</div>
</div>`:''}
<div style="flex:1"></div>
<div class="footer">
  <div class="footer-brand">${m.montrerMarque?'Ta<span>fir</span>':''}</div>
  <div class="footer-center">
    ${m.pied?'<strong>'+escapeHTML(m.pied)+'</strong><br>':''}
    ${[p.rc?'RC: '+escapeHTML(p.rc):'', p.identifiant_fiscal?'IF: '+escapeHTML(p.identifiant_fiscal):'', p.ice?'ICE: '+escapeHTML(p.ice):'', p.patente?'Pat: '+escapeHTML(p.patente):'', p.tel?'Tél. : '+escapeHTML(p.tel):'', p.email?'E-mail : '+escapeHTML(p.email):''].filter(Boolean).join(' · ')}
    ${p.adresse?'<br>'+escapeHTML(p.adresse||'')+(p.ville?', '+escapeHTML(p.ville):''):''}
  </div>
  <div class="footer-right" style="text-align:right">
    ${(badge_lettre||badge_tva)?`<div style="display:flex;gap:4px;justify-content:flex-end;margin-bottom:4px">
      ${badge_lettre?'<span style="background:#6E8F4E;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px">L</span>':''}
      ${badge_tva?'<span style="background:#7C5CA6;color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px">T</span>':''}
    </div>`:''}
    ${qrUrl?`<img src="${qrUrl}" style="width:40px;height:40px;display:block;margin-bottom:2px">`:''}
    ${docUrl?`<div style="font-size:7px;color:#8E9C95;max-width:80px;word-break:break-all">${docUrl.replace('https://','')}</div>`:''}
    <div class="footer-page">Page 1/1</div>
  </div>
</div>
</div>
<\/body><\/html>`;
  return html;
}
function genDocPDF(opts) {
  ouvrirPDFViewer(construireHTMLDoc(opts), opts.ref);
}
function ouvrirPDFViewer(htmlContent, ref) {
  const ancien = document.getElementById('pdf-fullscreen');
  if (ancien) ancien.remove();
  const screen = document.createElement('div');
  screen.id = 'pdf-fullscreen';
  screen.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#fff;display:flex;flex-direction:column';
  const bar = document.createElement('div');
  bar.style.cssText = 'background:#1B5E4B;padding:10px 16px;display:flex;align-items:center;gap:8px;flex-shrink:0';
  const btnBack = document.createElement('button');
  btnBack.textContent = '← Retour';
  btnBack.style.cssText = 'background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit';
  btnBack.onclick = function() {
    const f = document.getElementById('pdf-frame');
    if (f && f.src && f.src.startsWith('blob:')) URL.revokeObjectURL(f.src);
    screen.remove();
  };
  const title = document.createElement('span');
  title.textContent = ref;
  title.style.cssText = 'color:#fff;font-size:13px;font-weight:600;flex:1;text-align:center';
  const btnDl = document.createElement('button');
  btnDl.textContent = 'Télécharger';
  btnDl.style.cssText = 'background:#6E8F4E;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit';
  btnDl.onclick = function() {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = ref + '.html';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
  };
  const btnShare = document.createElement('button');
  btnShare.textContent = 'Partager';
  btnShare.style.cssText = 'background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:7px 10px;font-size:15px;cursor:pointer';
  btnShare.onclick = async function() {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const file = new File([blob], ref + '.html', { type: 'text/html' });
    if (navigator.share) {
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: ref, files: [file] }); return;
        }
        await navigator.share({ title: ref, text: 'Facture ' + ref }); return;
      } catch(e) { if (e.name === 'AbortError') return; }
    }
    btnDl.click();
  };
  bar.appendChild(btnBack);
  bar.appendChild(title);
  bar.appendChild(btnShare);
  bar.appendChild(btnDl);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.id = 'pdf-frame';
  frame.src = blobUrl;
  frame.style.cssText = 'flex:1;width:100%;border:none;background:#fff';
  screen.appendChild(bar);
  screen.appendChild(frame);
  document.body.appendChild(screen);
}
function ttcEnLettres(montant) {
  return montantEnLettres(montant, 'MAD');
}
