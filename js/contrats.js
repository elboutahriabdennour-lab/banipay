// ZELTO — contrats.js — Modèles de contrats pré-remplis
// ============================================================
// ⚠️ Ces modèles sont des bases de travail rédigées pour couvrir les
// besoins courants d'une PME marocaine — ils ne remplacent pas une
// relecture par un professionnel du droit avant signature, surtout
// pour le contrat de travail (droit du travail marocain très encadré).

const MODELES_CONTRATS = {
  prestation: {
    nom: 'Contrat de prestation de service',
    icone: '🤝',
    champs: [
      { id: 'objet', label: 'Objet de la prestation', type: 'textarea', placeholder: 'Ex: Conseil, développement, formation...' },
      { id: 'duree', label: 'Durée', type: 'text', placeholder: 'Ex: 3 mois, à compter du...' },
      { id: 'montant', label: 'Montant (MAD)', type: 'number' },
      { id: 'modalites_paiement', label: 'Modalités de paiement', type: 'text', placeholder: 'Ex: 50% à la signature, 50% à la livraison' },
    ],
    corps: function(d) { return `
<h2>1. Objet</h2>
<p>Le présent contrat a pour objet : ${escapeHTML(d.objet) || '[à préciser]'}.</p>
<h2>2. Durée</h2>
<p>${escapeHTML(d.duree) || '[à préciser]'}</p>
<h2>3. Prix et modalités de paiement</h2>
<p>Le prix de la prestation est fixé à ${d.montant ? fmt(d.montant) + ' MAD' : '[montant à préciser]'} TTC. ${escapeHTML(d.modalites_paiement) || ''}</p>
<h2>4. Obligations du Prestataire</h2>
<p>Le Prestataire s'engage à exécuter la prestation avec diligence et selon les règles de l'art, dans le respect des délais convenus.</p>
<h2>5. Résiliation</h2>
<p>Le présent contrat peut être résilié par l'une ou l'autre des parties en cas de manquement grave de l'autre partie à ses obligations, après mise en demeure restée sans effet pendant 15 jours.</p>
<h2>6. Litiges</h2>
<p>Tout litige relatif à l'exécution du présent contrat relève de la compétence des tribunaux du lieu du siège social du Prestataire.</p>`; }
  },
  sous_traitance: {
    nom: 'Contrat de sous-traitance',
    icone: '📑',
    champs: [
      { id: 'description_travaux', label: 'Description de la mission confiée', type: 'textarea', placeholder: 'Ex: Réalisation de...' },
      { id: 'delai', label: "Délai d'exécution", type: 'text', placeholder: 'Ex: 30 jours à compter du...' },
      { id: 'montant', label: 'Montant (MAD)', type: 'number' },
      { id: 'penalites', label: 'Pénalités de retard (optionnel)', type: 'text', placeholder: 'Ex: 0.5% du montant par jour de retard' },
    ],
    corps: function(d) { return `
<h2>1. Objet</h2>
<p>Le Donneur d'ordre confie au Sous-traitant l'exécution de la mission suivante : ${escapeHTML(d.description_travaux) || '[à préciser]'}.</p>
<h2>2. Délai d'exécution</h2>
<p>${escapeHTML(d.delai) || '[à préciser]'}</p>
<h2>3. Prix</h2>
<p>Le montant convenu est fixé à ${d.montant ? fmt(d.montant) + ' MAD' : '[montant à préciser]'} TTC, révisable uniquement en cas de mission supplémentaire dûment validée par écrit.</p>
${d.penalites ? '<h2>4. Pénalités de retard</h2><p>' + escapeHTML(d.penalites) + '</p>' : ''}
<h2>${d.penalites ? '5' : '4'}. Garanties et responsabilité</h2>
<p>Le Sous-traitant demeure responsable de la bonne exécution de la mission qui lui est confiée et garantit sa conformité aux normes en vigueur.</p>
<h2>${d.penalites ? '6' : '5'}. Litiges</h2>
<p>Tout litige relatif à l'exécution du présent contrat relève de la compétence des tribunaux du lieu du siège social du Donneur d'ordre.</p>`; }
  },
  confidentialite: {
    nom: 'Accord de confidentialité (NDA)',
    icone: '🔒',
    champs: [
      { id: 'contexte', label: 'Contexte / objet des échanges', type: 'textarea', placeholder: 'Ex: Dans le cadre d\'un projet de collaboration portant sur...' },
      { id: 'duree_confidentialite', label: 'Durée de confidentialité', type: 'text', placeholder: 'Ex: 3 ans à compter de la signature' },
    ],
    corps: function(d) { return `
<h2>1. Objet</h2>
<p>Dans le cadre de : ${escapeHTML(d.contexte) || '[à préciser]'}, les parties peuvent être amenées à échanger des informations confidentielles. Le présent accord a pour objet de définir les conditions dans lesquelles ces informations seront protégées.</p>
<h2>2. Définition des informations confidentielles</h2>
<p>Sont considérées comme confidentielles toutes informations techniques, commerciales, financières ou stratégiques communiquées par l'une des parties à l'autre, quelle que soit leur forme (écrite, orale, électronique).</p>
<h2>3. Obligations</h2>
<p>Chaque partie s'engage à ne pas divulguer les informations confidentielles reçues à des tiers, et à ne les utiliser que dans le cadre défini ci-dessus.</p>
<h2>4. Durée</h2>
<p>Les obligations de confidentialité s'appliquent pendant ${escapeHTML(d.duree_confidentialite) || '[durée à préciser]'}, y compris après la fin de la collaboration entre les parties.</p>
<h2>5. Litiges</h2>
<p>Tout litige relatif à l'exécution du présent accord relève de la compétence des tribunaux compétents.</p>`; }
  },
  travail: {
    nom: 'Contrat de travail (CDD/CDI simple)',
    icone: '👤',
    alerteRenforcee: true,
    champs: [
      { id: 'type_contrat', label: 'Type de contrat', type: 'select', options: ['CDI', 'CDD'] },
      { id: 'poste', label: 'Poste occupé', type: 'text', placeholder: 'Ex: Assistant commercial, Développeur...' },
      { id: 'date_debut', label: 'Date de début', type: 'date' },
      { id: 'date_fin', label: 'Date de fin (si CDD)', type: 'date' },
      { id: 'salaire', label: 'Salaire mensuel brut (MAD)', type: 'number' },
      { id: 'periode_essai', label: "Période d'essai", type: 'text', placeholder: 'Ex: 3 mois' },
    ],
    corps: function(d) { return `
<h2>1. Engagement</h2>
<p>L'Employeur engage le Salarié en qualité de ${escapeHTML(d.poste) || '[poste à préciser]'}, dans le cadre d'un contrat à durée ${d.type_contrat === 'CDD' ? 'déterminée' : 'indéterminée'}, à compter du ${d.date_debut ? formatDate(d.date_debut) : '[date à préciser]'}${d.type_contrat === 'CDD' && d.date_fin ? ' jusqu\'au ' + formatDate(d.date_fin) : ''}.</p>
<h2>2. Période d'essai</h2>
<p>${escapeHTML(d.periode_essai) || '[à préciser conformément au Code du travail]'}</p>
<h2>3. Rémunération</h2>
<p>Le Salarié percevra une rémunération mensuelle brute de ${d.salaire ? fmt(d.salaire) + ' MAD' : '[montant à préciser]'}, versée conformément à la législation en vigueur (CNSS, IR).</p>
<h2>4. Obligations des parties</h2>
<p>Les parties s'engagent à respecter les dispositions du Code du travail marocain applicables au présent contrat, notamment en matière de durée du travail, de congés payés et de conditions de rupture.</p>
<h2>5. Litiges</h2>
<p>Tout litige relatif à l'exécution du présent contrat relève de la compétence du tribunal social compétent.</p>`; }
  },
  partenariat: {
    nom: 'Accord de partenariat commercial',
    icone: '🤝',
    champs: [
      { id: 'objet_partenariat', label: 'Objet du partenariat', type: 'textarea', placeholder: 'Ex: Distribution croisée de produits, apport d\'affaires...' },
      { id: 'duree', label: 'Durée', type: 'text', placeholder: 'Ex: 1 an renouvelable par tacite reconduction' },
      { id: 'conditions_financieres', label: 'Conditions financières', type: 'textarea', placeholder: 'Ex: Commission de 10% sur chaque affaire apportée...' },
    ],
    corps: function(d) { return `
<h2>1. Objet</h2>
<p>${escapeHTML(d.objet_partenariat) || '[à préciser]'}</p>
<h2>2. Durée</h2>
<p>${escapeHTML(d.duree) || '[à préciser]'}</p>
<h2>3. Conditions financières</h2>
<p>${escapeHTML(d.conditions_financieres) || '[à préciser]'}</p>
<h2>4. Indépendance des parties</h2>
<p>Le présent accord ne crée ni société commune, ni lien de subordination entre les parties, qui demeurent chacune seule responsable de leur propre activité.</p>
<h2>5. Litiges</h2>
<p>Tout litige relatif à l'exécution du présent accord relève de la compétence des tribunaux compétents.</p>`; }
  },
  vente: {
    nom: 'Contrat de vente (fourniture de biens)',
    icone: '📦',
    champs: [
      { id: 'description_biens', label: 'Description des biens vendus', type: 'textarea', placeholder: 'Ex: 500 unités de...' },
      { id: 'montant', label: 'Prix total (MAD)', type: 'number' },
      { id: 'delai_livraison', label: 'Délai de livraison', type: 'text', placeholder: 'Ex: 15 jours à compter de la commande' },
      { id: 'garantie', label: 'Garantie (optionnel)', type: 'text', placeholder: 'Ex: 12 mois contre tout défaut de fabrication' },
    ],
    corps: function(d) { return `
<h2>1. Objet</h2>
<p>Le Vendeur cède à l'Acheteur les biens suivants : ${escapeHTML(d.description_biens) || '[à préciser]'}.</p>
<h2>2. Prix</h2>
<p>Le prix total est fixé à ${d.montant ? fmt(d.montant) + ' MAD' : '[montant à préciser]'} TTC.</p>
<h2>3. Livraison</h2>
<p>${escapeHTML(d.delai_livraison) || '[à préciser]'}</p>
${d.garantie ? '<h2>4. Garantie</h2><p>' + escapeHTML(d.garantie) + '</p>' : ''}
<h2>${d.garantie ? '5' : '4'}. Transfert de propriété</h2>
<p>Le transfert de propriété des biens intervient au paiement intégral du prix convenu.</p>
<h2>${d.garantie ? '6' : '5'}. Litiges</h2>
<p>Tout litige relatif à l'exécution du présent contrat relève de la compétence des tribunaux du lieu du siège social du Vendeur.</p>`; }
  },
  consultant: {
    nom: 'Contrat de consultant / freelance',
    icone: '💻',
    champs: [
      { id: 'mission', label: 'Description de la mission', type: 'textarea', placeholder: 'Ex: Accompagnement stratégique, développement d\'un site web...' },
      { id: 'duree', label: 'Durée de la mission', type: 'text', placeholder: 'Ex: 2 mois, renouvelable' },
      { id: 'tarif', label: 'Tarif (MAD)', type: 'text', placeholder: 'Ex: 500 MAD/jour, ou 8000 MAD forfait' },
      { id: 'modalites_paiement', label: 'Modalités de paiement', type: 'text', placeholder: 'Ex: facturation mensuelle sur relevé de temps' },
    ],
    corps: function(d) { return `
<h2>1. Objet</h2>
<p>Le Client confie au Consultant la mission suivante, réalisée en toute indépendance : ${escapeHTML(d.mission) || '[à préciser]'}.</p>
<h2>2. Durée</h2>
<p>${escapeHTML(d.duree) || '[à préciser]'}</p>
<h2>3. Rémunération</h2>
<p>La rémunération est fixée à ${escapeHTML(d.tarif || '[à préciser]')}. ${escapeHTML(d.modalites_paiement) || ''}</p>
<h2>4. Indépendance</h2>
<p>Le Consultant exerce sa mission en toute indépendance, sans lien de subordination avec le Client, et demeure seul responsable de ses obligations sociales et fiscales.</p>
<h2>5. Litiges</h2>
<p>Tout litige relatif à l'exécution du présent contrat relève de la compétence des tribunaux compétents.</p>`; }
  },
  location: {
    nom: 'Contrat de location de matériel',
    icone: '🔧',
    champs: [
      { id: 'materiel', label: 'Matériel loué', type: 'textarea', placeholder: 'Ex: 1 véhicule utilitaire, 2 ordinateurs portables...' },
      { id: 'duree', label: 'Durée de la location', type: 'text', placeholder: 'Ex: du ... au ..., ou reconduction mensuelle' },
      { id: 'loyer', label: 'Loyer (MAD)', type: 'number' },
      { id: 'depot_garantie', label: 'Dépôt de garantie (optionnel, MAD)', type: 'number' },
    ],
    corps: function(d) { return `
<h2>1. Objet</h2>
<p>Le Bailleur met à disposition du Locataire le matériel suivant : ${escapeHTML(d.materiel) || '[à préciser]'}.</p>
<h2>2. Durée</h2>
<p>${escapeHTML(d.duree) || '[à préciser]'}</p>
<h2>3. Loyer</h2>
<p>Le loyer est fixé à ${d.loyer ? fmt(d.loyer) + ' MAD' : '[montant à préciser]'}.${d.depot_garantie ? ' Un dépôt de garantie de ' + fmt(d.depot_garantie) + ' MAD est versé à la signature, restitué en fin de location sous déduction des dégradations éventuelles.' : ''}</p>
<h2>4. Obligations du Locataire</h2>
<p>Le Locataire s'engage à utiliser le matériel loué en bon père de famille et à le restituer dans l'état où il l'a reçu, usure normale exceptée.</p>
<h2>5. Litiges</h2>
<p>Tout litige relatif à l'exécution du présent contrat relève de la compétence des tribunaux du lieu du siège social du Bailleur.</p>`; }
  },
};

function renderModelesContrats() {
  const list = el('contrats-list');
  if (!list) return;
  list.innerHTML = Object.keys(MODELES_CONTRATS).map(function(cle) {
    const m = MODELES_CONTRATS[cle];
    return '<div class="card" style="margin:0 20px 10px;cursor:pointer" onclick="ouvrirNouveauContrat(\'' + cle + '\')">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<span style="font-size:22px">' + m.icone + '</span>' +
        '<span style="font-size:14px;font-weight:700">' + m.nom + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function ouvrirNouveauContrat(cle) {
  const modele = MODELES_CONTRATS[cle];
  if (!modele) return;
  STATE._contratActuel = cle;
  el('nc-titre') && (el('nc-titre').textContent = modele.icone + ' ' + modele.nom);

  const alerteZone = el('nc-alerte');
  if (alerteZone) {
    alerteZone.innerHTML = modele.alerteRenforcee
      ? '⚠️ Le Code du travail marocain encadre strictement ce type de contrat (durée légale, congés, indemnités de rupture...). Ce modèle est une base — faites-le impérativement valider par un professionnel avant signature.'
      : '⚠️ Ce modèle est une base de travail — faites-le relire par un professionnel avant signature pour un usage réel.';
  }

  // Client optionnel — reprend le même sélecteur que les factures/devis
  const clientSel = el('nc-client');
  if (clientSel) {
    clientSel.innerHTML = '<option value="">Aucun (saisie libre ci-dessous)</option>' +
      (STATE.clients || []).map(function(c) { return '<option value="' + c.id + '">' + escapeHTML(c.nom) + '</option>'; }).join('');
  }
  el('nc-client-nom-libre') && (el('nc-client-nom-libre').value = '');

  const champsZone = el('nc-champs');
  if (champsZone) {
    champsZone.innerHTML = modele.champs.map(function(c) {
      if (c.type === 'textarea') return '<div class="form-section"><label class="f-lbl">' + c.label + '</label><textarea id="nc-' + c.id + '" class="f-inp" rows="3" placeholder="' + (c.placeholder||'') + '"></textarea></div>';
      if (c.type === 'select') return '<div class="form-section"><label class="f-lbl">' + c.label + '</label><select id="nc-' + c.id + '" class="f-inp">' + c.options.map(function(o){return '<option>'+o+'</option>';}).join('') + '</select></div>';
      return '<div class="form-section"><label class="f-lbl">' + c.label + '</label><input id="nc-' + c.id + '" class="f-inp" type="' + c.type + '" placeholder="' + (c.placeholder||'') + '"></div>';
    }).join('');
  }
  goScreen('nouveau-contrat', null);
}

function genererDocumentContrat() {
  const cle = STATE._contratActuel;
  const modele = MODELES_CONTRATS[cle];
  if (!modele) return;

  const clientId = el('nc-client')?.value;
  const clientChoisi = clientId ? (STATE.clients || []).find(function(c) { return String(c.id) === clientId; }) : null;
  const nomClient = clientChoisi ? clientChoisi.nom : (el('nc-client-nom-libre')?.value.trim() || '[Nom du client / partenaire]');

  const donnees = {};
  modele.champs.forEach(function(c) { donnees[c.id] = el('nc-' + c.id)?.value.trim() || ''; });

  const profil = STATE.profil || {};
  const aujourdhui = formatDate(today());

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Georgia,serif;color:#241F1B;line-height:1.6;padding:40px;max-width:800px;margin:0 auto}
    h1{font-size:20px;text-align:center;margin-bottom:24px}
    h2{font-size:15px;color:#1F6F72;margin-top:20px}
    .parties{display:flex;gap:20px;margin:20px 0;font-size:13px}
    .partie{flex:1;border:1px solid #E3DCCF;border-radius:8px;padding:12px}
    .alerte{background:#FBF0DA;border-left:3px solid #C9971F;padding:10px 14px;font-size:12px;margin-bottom:24px}
    .signatures{display:flex;justify-content:space-between;margin-top:60px}
    .signature{width:45%;text-align:center;font-size:12px}
    .ligne-sign{border-top:1px solid #241F1B;margin-top:50px;padding-top:6px}
    p{font-size:13px}
  </style></head><body>
    <div class="alerte">${el('nc-alerte')?.textContent || ''}</div>
    <h1>${modele.nom.toUpperCase()}</h1>
    <p style="text-align:right;font-size:12px">Fait à ${escapeHTML(profil.ville || '____________')}, le ${aujourdhui}</p>
    <div class="parties">
      <div class="partie"><strong>Entre les soussignés :</strong><br>${escapeHTML(profil.raison || '[Raison sociale]')}<br>ICE : ${escapeHTML(profil.ice || '—')}<br>Ci-après « la Première Partie »</div>
      <div class="partie"><strong>Et :</strong><br>${escapeHTML(nomClient)}<br>Ci-après « la Seconde Partie »</div>
    </div>
    ${modele.corps(donnees)}
    <div class="signatures">
      <div class="signature">${escapeHTML(profil.raison || 'Première Partie')}<div class="ligne-sign">Signature</div></div>
      <div class="signature">${escapeHTML(nomClient)}<div class="ligne-sign">Signature</div></div>
    </div>
  </body></html>`;

  ouvrirPDFViewer(html, modele.nom.replace(/\s+/g, '_'));
}
