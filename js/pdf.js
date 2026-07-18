// BANIPAY — pdf.js


function exportPDF(id) {
  const f = STATE.factures.find(x=>x.id===id); if(!f) return;
  genDocPDF({
    type:'FACTURE', ref:f.ref, color:'#2563EB',
    emetteur: STATE.profil || {},
    destinataire:{nom:f.client,chantier:f.chantier},
    date:f.date_emission, echeance:f.echeance,
    paiement:f.paiement, statut:f.statut,
    lignes: (typeof f.lignes === 'string' ? JSON.parse(f.lignes||'[]') : f.lignes||[]), note:f.note,
    ht:f.ht, tva:f.tva, ttc:f.ttc,
    devise:f.devise||'MAD',
    montant_recu:f.montant_recu,
    showStamp: f.statut==='payee',
  });
}

function previewPDF() {
  const client = el('f-client')?.value.trim();
  if(!client){showToast('Remplissez le formulaire','error');return;}
  const ht=STATE.lignesF.reduce((s,l)=>s+l.qte*l.pu,0);
  genDocPDF({
    type:'FACTURE', ref:el('f-ref')?.value, color:'#2563EB',
    emetteur:STATE.profil,
    destinataire:{nom:client,chantier:el('f-chantier')?.value},
    date:el('f-date')?.value,
    paiement:el('f-paiement')?.value,
    lignes:STATE.lignesF,
    ht, tva:ht*0.2, ttc:ht*1.2,
    devise:STATE.deviseF,
  });
}



function genDocPDF(opts) {
  const {type,ref,color,emetteur:p,destinataire,date,echeance,validite,paiement,statut,lignes=[],note,ht=0,tva=0,ttc=0,devise='MAD',montant_recu=0,showStamp=false,showPrices=true,signature=false,extra='',motif=''} = opts;
  const isAvoir=type==='AVOIR', isDevis=type==='DEVIS'||type==='DEV', isBC=type==='BC', isBL=type==='BL';
  const legalParts = [p.rc?'RC: '+p.rc:'', p.identifiant_fiscal?'IF: '+p.identifiant_fiscal:'', p.ice?'ICE: '+p.ice:'', p.patente?'Patente: '+p.patente:''].filter(Boolean).join(' · ');
  const paye = Number(montant_recu)||0;
  const restant = Math.max(0, ttc - paye);
  const colorHeader = isAvoir ? '#DC2626' : isDevis ? '#D97706' : isBC ? '#7C3AED' : isBL ? '#059669' : (color||'#2563EB');

  const lignesHtml = lignes.map((l,i) => {
    const total = (Number(l.qte)||0) * (Number(l.pu)||0);
    return `<tr style="background:${i%2===0?'#F8FAFC':'#fff'}">
      <td style="padding:8px 12px;font-size:12px">${escapeHTML(l.desc||l.designation||'')}</td>
      <td style="padding:8px 12px;text-align:center;font-size:12px">${l.qte||1} ${l.unite||''}</td>
      ${showPrices?`<td style="padding:8px 12px;text-align:right;font-size:12px">${fmt(Number(l.pu)||0)}</td><td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600">${fmt(total)}</td>`:''}
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>${type} ${ref}<\/title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#0F172A;font-size:12px;background:#fff}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}@page{margin:8mm;size:A4}}
.header{background:#0F172A;padding:22px 32px;display:flex;justify-content:space-between;align-items:flex-start}
.h-logo{max-width:90px;max-height:45px;object-fit:contain;margin-bottom:6px;display:block;filter:brightness(0) invert(1)}
.h-company{font-size:18px;font-weight:700;color:#fff}
.h-doc-label{font-size:15px;font-weight:700;color:#fff;letter-spacing:2px;background:${colorHeader};padding:5px 14px;border-radius:4px;display:inline-block;margin-bottom:7px}
.h-ref{font-size:12px;font-weight:700;color:#fff}
.h-meta{font-size:10px;color:rgba(255,255,255,0.5);margin-top:3px;line-height:1.6}
.h-right{text-align:right}
.stripe{background:${colorHeader};height:3px}
.legal{background:#F8FAFC;padding:7px 32px;text-align:center;font-size:9px;color:#64748B;border-bottom:1px solid #E2E8F0}
.blocs{display:flex;gap:12px;padding:14px 32px}
.bloc{flex:1;border-radius:8px;overflow:hidden;border:1px solid #E2E8F0}
.bloc-hd{padding:7px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;background:${colorHeader};color:#fff}
.bloc-bd{padding:10px 12px;background:#fff}
.bloc-bd .main{font-size:13px;font-weight:700;margin-bottom:3px}
.bloc-bd .line{font-size:10px;color:#64748B;margin-top:2px}
.table-section{padding:0 32px}
table{width:100%;border-collapse:collapse}
thead tr{background:#0F172A}
thead th{padding:8px 12px;font-size:10px;font-weight:700;color:#fff;text-align:left}
thead th:nth-child(2){text-align:center}
thead th:nth-child(3),thead th:nth-child(4){text-align:right}
tbody td{border-bottom:1px solid #F1F5F9}
.totaux{padding:12px 32px;display:flex;justify-content:flex-end}
.totaux-box{width:270px;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden}
.tot-row{display:flex;justify-content:space-between;padding:7px 12px;font-size:11px;border-bottom:1px solid #F1F5F9;color:#64748B}
.tot-main{display:flex;justify-content:space-between;padding:10px 12px;background:#0F172A}
.tot-main-lbl{font-size:12px;font-weight:700;color:#fff}
.tot-main-val{font-size:14px;font-weight:700;color:${colorHeader}}
.arrete{padding:3px 32px 10px;font-size:10px;color:#64748B;font-style:italic}
.footer{display:flex;justify-content:space-between;align-items:center;padding:10px 32px;margin-top:20px;border-top:1px solid #E2E8F0}
.footer-brand{font-size:11px;font-weight:700;color:#1E3A8A}
.footer-brand span{color:#2563EB}
.footer-center{font-size:8px;color:#94A3B8;text-align:center;flex:1;padding:0 12px}
.footer-page{font-size:9px;color:#94A3B8}
</style><\/head><body>
<div style="position:relative">

<div class="header">
  <div class="h-left">
    ${p.logo?`<img src="${p.logo}" class="h-logo" alt="logo">`:''}
    <div class="h-company">${escapeHTML(p.raison||'Mon Entreprise')}</div>
  </div>
  <div class="h-right">
    <div class="h-doc-label">${type}</div>
    <div class="h-ref">${ref}</div>
    <div class="h-meta">
      Date: ${date||''}<br>
      ${echeance?'Échéance: '+echeance+'<br>':''}
      ${validite?'Validité: '+validite+' jours<br>':''}
      ${paiement?'Paiement: '+paiement:''}
    </div>
  </div>
</div>
<div class="stripe"></div>
${legalParts?`<div class="legal">${legalParts}</div>`:''}

<div class="blocs">
  <div class="bloc">
    <div class="bloc-hd">${isAvoir?'Avoir pour':isDevis?'Destinataire':'Facturé à'}</div>
    <div class="bloc-bd">
      <div class="main">${escapeHTML(destinataire.nom||'—')}</div>
      ${destinataire.chantier?`<div class="line">Projet: ${escapeHTML(destinataire.chantier)}</div>`:''}
      ${destinataire.adresse?`<div class="line">${escapeHTML(destinataire.adresse||'')}</div>`:''}
      ${destinataire.ice?`<div class="line">ICE: ${destinataire.ice}</div>`:''}
      ${destinataire.tel?`<div class="line">📞 ${destinataire.tel}</div>`:''}
    </div>
  </div>
  <div class="bloc">
    <div class="bloc-hd">Émetteur</div>
    <div class="bloc-bd">
      <div class="main">${escapeHTML(p.raison||'—')}</div>
      ${p.adresse?`<div class="line">📍 ${escapeHTML(p.adresse||'')}${p.ville?', '+p.ville:''}</div>`:''}
      ${p.email?`<div class="line">✉️ ${p.email}</div>`:''}
      ${p.tel?`<div class="line">📞 ${p.tel}</div>`:''}
    </div>
  </div>
</div>

<div class="table-section">
<table>
<thead><tr>
  <th style="width:44%">Désignation</th>
  <th style="width:10%;text-align:center">Qté</th>
  ${showPrices?`<th style="width:22%;text-align:right">P.U. HT (${devise})</th><th style="width:24%;text-align:right">Total HT (${devise})</th>`:''}
</tr></thead>
<tbody>${lignesHtml}</tbody>
</table>
</div>

${showPrices?`
<div class="totaux"><div class="totaux-box">
  <div class="tot-row"><span>Sous-total HT</span><span style="font-weight:600;color:#0F172A">${fmt(ht)} ${devise}</span></div>
  <div class="tot-row" style="background:#FFFBEB"><span>TVA (20%)</span><span style="font-weight:600;color:#0F172A">${fmt(tva)} ${devise}</span></div>
  ${paye>0?`<div class="tot-row" style="background:#ECFDF5"><span>Déjà reçu</span><span style="font-weight:600;color:#059669">- ${fmt(paye)} ${devise}</span></div>`:''}
  <div class="tot-main"><span class="tot-main-lbl">TOTAL TTC</span><span class="tot-main-val">${fmt(ttc)} ${devise}</span></div>
  ${paye>0&&restant>0?`<div class="tot-row" style="background:#FEF2F2"><span style="font-weight:700;color:#EF4444">Reste à payer</span><span style="font-weight:700;color:#EF4444">${fmt(restant)} ${devise}</span></div>`:''}
</div></div>
<div class="arrete">Arrêté à la somme de <strong>${ttcEnLettres(ttc)} TTC</strong>. Juridiction: Maroc.</div>
`:''}

${note?`<div style="margin:0 32px 12px;background:#FFFBEB;border-left:3px solid #D97706;border-radius:0 8px 8px 0;padding:10px 12px;font-size:11px;color:#92400E"><strong>Note:</strong> ${escapeHTML(note)}</div>`:''}
${motif?`<div style="margin:0 32px 12px;background:#FEF2F2;border-left:3px solid #EF4444;border-radius:0 8px 8px 0;padding:10px 12px;font-size:11px;color:#991B1B"><strong>Motif:</strong> ${escapeHTML(motif)}</div>`:''}

<div class="footer">
  <div class="footer-brand">Bani<span>Pay</span></div>
  <div class="footer-center">${[p.rc?'RC: '+p.rc:'', p.identifiant_fiscal?'IF: '+p.identifiant_fiscal:'', p.ice?'ICE: '+p.ice:'', p.patente?'Patente: '+p.patente:'', p.tel?'📞 '+p.tel:'', p.email?'✉️ '+p.email:''].filter(Boolean).join(' · ')}</div>
  <div class="footer-page">Page 1/1</div>
</div>

</div>
<\/body><\/html>`;

  ouvrirPDFViewer(html, ref);
}


function ouvrirPDFViewer(htmlContent, ref) {
  const ancien = document.getElementById('pdf-fullscreen');
  if (ancien) ancien.remove();

  const screen = document.createElement('div');
  screen.id = 'pdf-fullscreen';
  screen.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:#fff;display:flex;flex-direction:column';

  const bar = document.createElement('div');
  bar.style.cssText = 'background:#1E3A8A;padding:10px 16px;display:flex;align-items:center;gap:8px;flex-shrink:0';

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
  btnDl.textContent = '💾 Télécharger';
  btnDl.style.cssText = 'background:#059669;color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit';
  btnDl.onclick = function() {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = ref + '.html';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
  };

  const btnShare = document.createElement('button');
  btnShare.textContent = '📤';
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
  if (!montant || isNaN(montant)) return 'zéro dirham';
  const n = Math.round(Number(montant) * 100);
  const dirhams = Math.floor(n / 100);
  const centimes = n % 100;
  const units = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  const tens = ['','','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
  function conv(n) {
    if (n === 0) return '';
    if (n < 20) return units[n];
    if (n < 100) {
      const t = Math.floor(n/10), u = n%10;
      if (t === 7 || t === 9) return tens[t] + (u===1&&t===7?'-et-':'-') + units[10+u];
      return tens[t] + (u===1&&t!==8?'-et-':u?'-':'') + (u?units[u]:'');
    }
    if (n < 1000) {
      const c = Math.floor(n/100), r = n%100;
      return (c===1?'cent':units[c]+'-cent') + (r?(c===1?'-':'')+conv(r):'');
    }
    const m = Math.floor(n/1000), r = n%1000;
    return (m===1?'mille':conv(m)+'-mille') + (r?'-'+conv(r):'');
  }
  const d = conv(dirhams) || 'zéro';
  return d + ' dirham' + (dirhams>1?'s':'') + (centimes?' et '+conv(centimes)+' centime'+(centimes>1?'s':''):'');
}
