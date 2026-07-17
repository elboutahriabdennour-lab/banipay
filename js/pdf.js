// BANIPAY — pdf.js

function exportPDF(id) {
  const f = STATE.factures.find(x=>x.id===id); if(!f) return;
  genDocPDF({
    type:'FACTURE', ref:f.ref, color:'#2563EB',
    emetteur:STATE.profil,
    destinataire:{nom:f.client,chantier:f.chantier},
    date:f.date_emission, echeance:f.echeance,
    paiement:f.paiement, statut:f.statut,
    lignes:f.lignes, note:f.note,
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
  const isAvoir=type==='AVOIR', isDevis=type==='DEVIS', isBL=type==='BON DE LIVRAISON', isBC=type==='BON DE COMMANDE';
  const legalParts=[p.rc?'RC: '+p.rc:null,p.identifiant_fiscal?'IF: '+p.identifiant_fiscal:null,p.ice?'ICE: '+p.ice:null,p.patente?'Patente: '+p.patente:null,p.cnss?'CNSS: '+p.cnss:null].filter(Boolean).join(' · ');
  const restant=Math.max(0,ttc-(montant_recu||0));

  const lignesHTML=lignes.map((l,i)=>`
    <tr style="background:${i%2===0?'#F8FAFC':'#fff'}">
      <td style="padding:8px 12px;font-size:12px">${l.desc}</td>
      <td style="padding:8px 12px;text-align:center;font-size:12px">${l.qte} ${l.unite||''}</td>
      ${showPrices?`<td style="padding:8px 12px;text-align:right;font-size:12px">${fmt(l.pu)}</td><td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600">${fmt(l.qte*l.pu)}</td>`:''}
    </tr>`).join('');

  const html=`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>${type} ${ref}<\/title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#0F172A;font-size:12px;background:#fff}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}@page{margin:8mm;size:A4}}
.header{background:#0F172A;padding:22px 32px;display:flex;justify-content:space-between;align-items:flex-start}
.h-left{}
.h-logo{max-width:100px;max-height:50px;object-fit:contain;margin-bottom:8px;filter:brightness(0) invert(1)}
.h-company{font-size:18px;font-weight:700;color:#fff;margin-bottom:2px}
.h-type{font-size:9px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px}
.h-info{font-size:10px;color:rgba(255,255,255,0.6);line-height:1.8}
.h-right{text-align:right}
.h-doc-label{font-size:15px;font-weight:700;color:#fff;letter-spacing:2px;background:${color};padding:5px 14px;border-radius:4px;display:inline-block;margin-bottom:7px}
.h-ref{font-size:12px;font-weight:700;color:#fff}
.h-meta{font-size:10px;color:rgba(255,255,255,0.5);margin-top:3px;line-height:1.6}
.stripe{background:${color};height:3px}
.legal{background:#F8FAFC;padding:7px 32px;text-align:center;font-size:9px;color:#64748B;border-bottom:1px solid #E2E8F0}
.blocs{display:flex;gap:12px;padding:14px 32px}
.bloc{flex:1;border-radius:8px;overflow:hidden;border:1px solid #E2E8F0}
.bloc-hd{padding:7px 12px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;background:${color};color:#fff}
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
.tot-main-val{font-size:14px;font-weight:700;color:${color}}
.arrete{padding:3px 32px 10px;font-size:10px;color:#64748B;font-style:italic}
.note-box{margin:0 32px 12px;background:#FFFBEB;border-left:3px solid #D97706;border-radius:0 8px 8px 0;padding:10px 12px;font-size:11px;color:#92400E}
.bank-box{margin:0 32px 12px;background:#ECFDF5;border-radius:8px;padding:12px;font-size:11px;color:#059669}
.stamp{position:absolute;top:280px;right:60px;border:6px solid ${color};color:${color};border-radius:8px;padding:10px 20px;font-size:24px;font-weight:700;transform:rotate(-15deg);opacity:0.7;letter-spacing:4px}
.sig-box{display:flex;gap:20px;padding:0 32px;margin-bottom:20px}
.sig-item{flex:1;border:1px solid #E2E8F0;border-radius:8px;padding:12px;min-height:70px}
.sig-lbl{font-size:10px;font-weight:600;color:#94A3B8;text-transform:uppercase;margin-bottom:6px}
.footer{background:#0F172A;padding:12px 32px;margin-top:16px}
.footer-brand{font-size:13px;font-weight:700;color:#fff}
.footer-brand span{color:#60A5FA}
.footer-info{display:flex;flex-wrap:wrap;gap:2px 14px;justify-content:center;margin-top:6px}
.footer-info-item{font-size:9px;color:rgba(255,255,255,0.5)}
.footer-legal{margin-top:4px;text-align:center;font-size:8px;color:#334155}

<\/style><\/head><body>
<div style="position:relative">
${showStamp?`<div class="stamp">PAYÉE</div>`:''}
<div class="header">
  <div class="h-left">
    ${p.logo?`<img src="${p.logo}" class="h-logo" alt="logo"><br>`:''}
    <div class="h-type">${p.secteur||p.forme||'Entreprise'}</div>
    <div class="h-company">${p.raison||'Mon Entreprise'}</div>
    <div class="h-info">
      ${p.adresse?p.adresse+'<br>':''}${p.ville?(p.cp?p.cp+' ':'')+p.ville+'<br>':''}
      ${p.tel?'Tél: '+p.tel+'<br>':''}${p.email?p.email:''}
    </div>
  </div>
  <div class="h-right">
    <div class="h-doc-label">${type}</div>
    <div class="h-ref">${ref} ${devise!=='MAD'?'· '+devise:''}</div>
    <div class="h-meta">
      Date: ${date||''}<br>
      ${echeance?'Échéance: '+echeance+'<br>':''}
      ${validite?'Validité: '+validite+' jours<br>':''}
      ${extra?extra+'<br>':''}
      ${paiement?'Paiement: '+paiement:''}
    </div>
  </div>
</div>
<div class="stripe"></div>
<div class="legal">${legalParts||'Complétez votre profil pour afficher vos identifiants légaux'}</div>
<div class="blocs">
  <div class="bloc">
    <div class="bloc-hd">${isAvoir?'Avoir pour':isDevis?'Devis pour':isBC?'Fournisseur':isBL?'Livré à':'Facturé à'}</div>
    <div class="bloc-bd">
      <div class="main">${destinataire.nom}</div>
      ${destinataire.chantier?`<div class="line">Projet: ${destinataire.chantier}</div>`:''}
      <div class="line">Réf: ${ref}</div>
    </div>
  </div>
  <div class="bloc">
    <div class="bloc-hd">Émetteur</div>
    <div class="bloc-bd">
      <div class="main">${p.raison||'—'}</div>
      ${p.rc?`<div class="line">RC: ${p.rc}</div>`:''}
      ${p.identifiant_fiscal?`<div class="line">IF: ${p.identifiant_fiscal}</div>`:''}
      ${p.ice?`<div class="line">ICE: ${p.ice}</div>`:''}
    </div>
  </div>
</div>
${lignes.length>0?`
<div class="table-section">
<table>
<thead><tr>
  <th style="width:${showPrices?'44%':'60%'}">Désignation</th>
  <th style="width:${showPrices?'10%':'40%'};text-align:center">Qté</th>
  ${showPrices?`<th style="width:22%;text-align:right">P.U. HT (${devise})</th><th style="width:24%;text-align:right">Total HT (${devise})</th>`:''}
</tr></thead>
<tbody>${lignesHTML}</tbody>
</table>
</div>`:''}
${isAvoir&&!lignes.length?`<div style="padding:12px 32px;font-size:12px;color:#64748B">Motif: ${motif} — Montant: ${fmt(ht)} ${devise} HT</div>`:''}
${showPrices?`
<div class="totaux"><div class="totaux-box">
  <div class="tot-row"><span>Sous-total HT</span><span style="font-weight:600;color:#0F172A">${fmt(ht)} ${devise}</span></div>
  <div class="tot-row" style="background:#FFFBEB"><span>TVA (20%)</span><span style="font-weight:600;color:#0F172A">${fmt(tva)} ${devise}</span></div>
  ${montant_recu>0?`<div class="tot-row"><span>Déjà reçu</span><span style="font-weight:600;color:#059669">-${fmt(montant_recu)} ${devise}</span></div>`:''}
  <div class="tot-main"><span class="tot-main-lbl">TOTAL TTC</span><span class="tot-main-val">${fmt(ttc)} ${devise}</span></div>
  ${restant>0&&montant_recu>0?`<div class="tot-row" style="color:#EF4444"><span>Solde restant</span><span>${fmt(restant)} ${devise}</span></div>`:''}
</div></div>
<div class="arrete">Arrêté à la somme de <strong>${fmt(ttc)} ${devise==='MAD'?'dirhams':devise} TTC</strong>${isAvoir?' en votre faveur':''}. Juridiction: ${p.ville||'Maroc'}.</div>`:''}
${note?`<div class="note-box">📌 ${note}</div>`:''}
${!isDevis&&!isAvoir&&!isBL&&!isBC&&(p.banque||p.rib)?`<div class="bank-box"><strong>🏦 Coordonnées bancaires:</strong> ${p.banque||''} ${p.rib?'· RIB: '+p.rib:''}</div>`:''}
${signature?`<div class="sig-box">
  <div class="sig-item"><div class="sig-lbl">Signature émetteur</div></div>
  <div class="sig-item"><div class="sig-lbl">Signature & Cachet destinataire</div></div>
</div>`:''}
<div class="footer">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:8px;border-bottom:1px solid #1E293B;margin-bottom:7px">
    <div><div class="footer-brand">Bani<span>Pay</span></div><div style="font-size:9px;color:#334155;margin-top:1px">Gestion Factures & Devis</div></div>
    <div style="font-size:10px;color:#334155">Page 1/1</div>
  </div>
  <div class="footer-info">
    ${p.raison?`<div class="footer-info-item">🏢 ${p.raison}</div>`:''}
    ${p.adresse?`<div class="footer-info-item">📍 ${p.adresse}${p.ville?', '+p.ville:''}</div>`:''}
    ${p.tel?`<div class="footer-info-item">📞 ${p.tel}</div>`:''}
    ${p.email?`<div class="footer-info-item">✉️ ${p.email}</div>`:''}
  </div>
  <div class="footer-legal">${legalParts}</div>
</div>
</div>

<!-- ===== DASHBOARD COMPTABLE FULL ===== -->
<div class="screen" id="screen-comptable">
  <div class="topbar">
    <div class="topbar-brand">📊 Bani<span>Pay</span></div>
    <div class="topbar-right">
      <span class="t-icon" title="Comptable">📊</span>
      <div class="t-avatar" id="comptable-avatar" onclick="goScreen('comptable-profil')">C</div>
    </div>
  </div>
  <div class="hero">
    <div class="hero-lbl">Espace Comptable</div>
    <div class="hero-amount" id="cpt-nb-entreprises">0 entreprise(s)</div>
    <div class="hero-sub-txt" id="cpt-sub">Gérez vos clients</div>
    <div class="hero-grid">
      <div class="hero-box"><div class="hero-box-val g" id="cpt-total-ca">0</div><div class="hero-box-lbl">CA total</div></div>
      <div class="hero-box"><div class="hero-box-val o" id="cpt-total-att">0</div><div class="hero-box-lbl">En attente</div></div>
      <div class="hero-box"><div class="hero-box-val r" id="cpt-total-ret">0</div><div class="hero-box-lbl">En retard</div></div>
    </div>
  </div>
  <div class="sec-header">
    <div class="sec-title">Mes entreprises clientes</div>
  </div>
  <div class="card-list" id="cpt-entreprises-list"></div>
  <div class="pb"></div>
  <div class="bottom-nav">
    <div class="nav-item active"><div class="nav-ico">🏢</div><div class="nav-lbl" style="color:#2563EB">Entreprises</div></div>
    <div class="nav-item" onclick="cptEntTab('tva',this)"><div class="nav-ico">🧾</div><div class="nav-lbl">TVA</div></div>
    <div class="nav-fab"><button class="fab" style="background:#9333EA" onclick="ouvrirInvitation()">📋</button></div>
    <div class="nav-item" onclick="goScreen('stats')"><div class="nav-ico">📊</div><div class="nav-lbl">Rapports</div></div>
    <div class="nav-item" onclick="goScreen('comptable-profil')"><div class="nav-ico">👤</div><div class="nav-lbl">Profil</div></div>
  </div>
</div>

<!-- ===== VUE ENTREPRISE (vue comptable) ===== -->
<div class="screen" id="screen-cpt-entreprise">
  <div class="topbar">
    <div class="topbar-brand" id="cpt-ent-nom" style="font-size:16px">Entreprise</div>
    <div class="topbar-right">
      <button class="back-btn" onclick="goScreen('comptable')" style="background:rgba(255,255,255,0.15);color:#fff">←</button>
    </div>
  </div>
  <div class="hero">
    <div class="hero-lbl">Situation financière</div>
    <div class="hero-amount" id="cpt-ent-ca">0 MAD</div>
    <div class="hero-sub-txt" id="cpt-ent-sub">chargement...</div>
    <div class="hero-grid">
      <div class="hero-box"><div class="hero-box-val g" id="cpt-ent-payee">0</div><div class="hero-box-lbl">Payées</div></div>
      <div class="hero-box"><div class="hero-box-val o" id="cpt-ent-att">0</div><div class="hero-box-lbl">En attente</div></div>
      <div class="hero-box"><div class="hero-box-val r" id="cpt-ent-ret">0</div><div class="hero-box-lbl">En retard</div></div>
    </div>
  </div>
  <!-- Tabs -->
  <div class="filter-tabs" style="padding-top:12px">
    <button class="ftab active" onclick="cptEntTab('factures',this)">Factures</button>
    <button class="ftab" onclick="cptEntTab('tva',this)">TVA</button>
    <button class="ftab" onclick="cptEntTab('infos',this)">Infos légales</button>
  </div>
  <!-- Factures tab -->
  <div id="cpt-tab-factures">
    <div class="filter-tabs">
      <button class="ftab active" onclick="cptFilterF('toutes',this)">Toutes</button>
      <button class="ftab" onclick="cptFilterF('payee',this)">Payées</button>
      <button class="ftab" onclick="cptFilterF('attente',this)">En attente</button>
      <button class="ftab" onclick="cptFilterF('retard',this)">En retard</button>
    </div>
    <div class="card-list" id="cpt-factures-list"></div>
  </div>
  <!-- TVA tab -->
  <div id="cpt-tab-tva" style="display:none;padding:0 20px;overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;margin-top:10px">
      <thead><tr style="background:#0F172A">
        <th style="padding:10px 12px;font-size:11px;color:#fff;text-align:left">Mois</th>
        <th style="padding:10px 12px;font-size:11px;color:#fff;text-align:right">HT</th>
        <th style="padding:10px 12px;font-size:11px;color:#34D399;text-align:right">TVA</th>
        <th style="padding:10px 12px;font-size:11px;color:#fff;text-align:right">TTC</th>
      </tr></thead>
      <tbody id="cpt-tva-body"></tbody>
    </table>
    <button onclick="exportCptTVA()" style="width:100%;margin-top:12px;padding:12px;background:#059669;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">📥 Export CSV TVA</button>
  </div>
  <!-- Infos tab -->
  <div id="cpt-tab-infos" style="display:none;padding:16px">
    <div class="p-card" id="cpt-infos-legales"></div>
    <div class="p-card" style="margin-top:12px" id="cpt-infos-banque"></div>
  </div>
  <div class="pb"></div>
</div>

<!-- ===== PROFIL COMPTABLE ===== -->
<div class="screen" id="screen-comptable-profil">
  <div class="topbar">
    <div class="topbar-brand">Mon profil</div>
    <div class="topbar-right">
      <button class="back-btn" onclick="goScreen('comptable')" style="background:rgba(255,255,255,0.15);color:#fff">←</button>
    </div>
  </div>
  <div class="profil-hero">
    <div class="profil-av" id="cpt-profil-av">C</div>
    <div>
      <div class="p-nom-big" id="cpt-profil-nom">Mon compte</div>
      <div class="p-id">Compte Comptable</div>
      <div class="p-badge" style="background:rgba(147,51,234,0.2);color:#C084FC">📊 Comptable</div>
    </div>
  </div>
  <div style="padding:16px">
    <div class="p-card">
      <div class="p-card-title">Informations</div>
      <div class="p-row"><span class="p-lbl">Email</span><span class="p-val" id="cpt-email">—</span></div>
      <div class="p-row"><span class="p-lbl">Cabinet</span><span class="p-val" id="cpt-cabinet">—</span></div>
      <div class="p-row"><span class="p-lbl">Entreprises</span><span class="p-val" id="cpt-nb-ent">0</span></div>
    </div>
    <button class="p-btn danger" onclick="doLogout()" style="margin-top:12px">⏏️ Se déconnecter</button>
  </div>
  <div class="pb"></div>
</div>

<!-- ===== MODAL INVITATION ===== -->
<div class="modal-overlay" id="modal-invitation">
  <div class="modal">
    <div class="modal-handle"></div>
    <div class="modal-title">📋 Mon lien d'invitation</div>
    <div style="background:#F3E8FF;border-radius:12px;padding:14px;margin-bottom:14px;font-size:13px;color:#9333EA">
      Partagez ce lien avec vos clients entreprises. Ils pourront vous donner accès à leurs données.
    </div>
    <div style="background:#F8FAFC;border:1.5px solid #E2E8F0;border-radius:10px;padding:12px;font-size:11px;color:#64748B;word-break:break-all;margin-bottom:12px;font-family:monospace" id="invitation-link-display">—</div>
    <button class="m-btn" onclick="copierLienInvitation()">📋 Copier le lien</button>
    <button class="m-btn" style="background:#25D366;margin-top:8px" onclick="partagerInvitationWhatsApp()">📱 Partager via WhatsApp</button>
    <button class="m-btn-sec" onclick="closeAllModals()">Fermer</button>
  </div>
</div>



<div style="margin-top:30px"></div>
<div style="background:#0F172A;padding:16px 28px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <div style="font-size:11px;font-weight:700;color:#fff">${escapeHTML(p.raison||'')}</div>
      <div style="font-size:9px;color:rgba(255,255,255,0.5);margin-top:3px;line-height:1.7">
        ${p.tel ? '📞 ' + p.tel : ''}${p.email ? ' · ✉️ ' + p.email : ''}${p.adresse ? '<br>📍 ' + escapeHTML(p.adresse||'') : ''}${p.rc ? '<br>RC: ' + p.rc : ''}${p.identifiant_fiscal ? ' · IF: ' + p.identifiant_fiscal : ''}${p.ice ? '<br>ICE: ' + p.ice : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:9px;color:rgba(255,255,255,0.4)">Réf: ${ref}<br>Émis le ${date||''}<br>Page 1/1</div>
      <div style="margin-top:6px;font-size:8px;color:#60A5FA;font-weight:700">BaniPay ©</div>
    </div>
  </div>
</div><\/body><\/html>`;

  // Afficher le PDF dans un viewer intégré (100% compatible iOS)
  ouvrirPDFViewer(html, ref);
}

function ouvrirPDFViewer(htmlContent, ref) {
  const ancien = document.getElementById('pdf-viewer-overlay');
  if (ancien) ancien.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pdf-viewer-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#1E3A8A;display:flex;flex-direction:column';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'background:#1E3A8A;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;gap:8px';

  const btnRetour = document.createElement('button');
  btnRetour.textContent = '← Retour';
  btnRetour.style.cssText = 'background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit';
  btnRetour.onclick = function() { overlay.remove(); };

  const title = document.createElement('span');
  title.textContent = ref;
  title.style.cssText = 'color:#fff;font-size:13px;font-weight:600;flex:1;text-align:center';

  const btnPrint = document.createElement('button');
  btnPrint.textContent = '🖨️ Imprimer';
  btnPrint.style.cssText = 'background:#2563EB;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit';
  btnPrint.onclick = function() {
    const iframe = document.getElementById('pdf-iframe');
    if (iframe && iframe.contentWindow) iframe.contentWindow.print();
  };

  toolbar.appendChild(btnRetour);
  toolbar.appendChild(title);
  toolbar.appendChild(btnPrint);

  // Wrapper blanc pour l'iframe
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'flex:1;overflow:auto;background:#e0e0e0;padding:12px';

  const iframe = document.createElement('iframe');
  iframe.id = 'pdf-iframe';
  iframe.style.cssText = 'width:100%;min-height:100%;border:none;display:block;background:#fff;border-radius:4px';
  iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-modals');

  // Wrap htmlContent in complete isolated document
  const isolatedHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;background:#fff}</style></head><body>' + htmlContent + '</body></html>';

  wrapper.appendChild(iframe);
  overlay.appendChild(toolbar);
  overlay.appendChild(wrapper);
  document.body.appendChild(overlay);

  // Write content to iframe after it's mounted
  setTimeout(function() {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    // Adjust height
    setTimeout(function() {
      iframe.style.height = (doc.body.scrollHeight + 40) + 'px';
    }, 300);
  }, 50);
}
