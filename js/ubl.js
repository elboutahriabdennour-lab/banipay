// ZELTO — ubl.js — Génération de factures structurées UBL 2.1
// ============================================================
// PRÉPARATION À LA FACTURATION ÉLECTRONIQUE DGI (Maroc) — une réforme
// est annoncée par la DGI, mais sans date ni seuils officiellement
// publiés à ce jour (vérifié août 2026). CE FICHIER EST UNE PRÉPARATION,
// PAS UNE CONFORMITÉ GARANTIE — à ajuster dès la publication des
// spécifications définitives.
function _ubl_echap(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function genererXMLUBLFacture(facture, profilEmetteur, clientInfo) {
  const f = facture;
  const p = profilEmetteur || {};
  const lignes = typeof f.lignes === 'string' ? JSON.parse(f.lignes || '[]') : (f.lignes || []);
  const devise = f.devise || 'MAD';
  const dateEmission = f.date_emission || new Date().toISOString().split('T')[0];
  const lignesXML = lignes.map(function(l, i) {
    const qte = Number(l.qte) || 0;
    const pu = Number(l.pu) || 0;
    const montantHT = qte * pu;
    return `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${_ubl_echap(l.unite || 'C62')}">${qte}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${devise}">${montantHT.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${_ubl_echap(l.desc)}</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${devise}">${pu.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Généré par Zelto — préparation UBL 2.1, format international OASIS.
     Profil marocain DGI/xHub non encore publié au moment de la génération :
     ce fichier n'est PAS garanti conforme tant que la DGI n'a pas publié
     ses spécifications définitives. Voir commentaire en tête de ubl.js. -->
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>${_ubl_echap(f.ref)}</cbc:ID>
  <cbc:IssueDate>${dateEmission}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${devise}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${_ubl_echap(p.raison)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${_ubl_echap(p.ice)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>ICE</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PostalAddress><cbc:StreetName>${_ubl_echap(p.adresse)}</cbc:StreetName><cbc:CityName>${_ubl_echap(p.ville)}</cbc:CityName><cac:Country><cbc:IdentificationCode>MA</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${_ubl_echap(f.client)}</cbc:Name></cac:PartyName>
      ${clientInfo && clientInfo.ice ? `<cac:PartyTaxScheme><cbc:CompanyID>${_ubl_echap(clientInfo.ice)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>ICE</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
      <cac:PostalAddress><cbc:StreetName>${_ubl_echap(clientInfo?.adresse)}</cbc:StreetName><cac:Country><cbc:IdentificationCode>MA</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${devise}">${(Number(f.tva)||0).toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${devise}">${(Number(f.ht)||0).toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${devise}">${(Number(f.tva)||0).toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${devise}">${(Number(f.ht)||0).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${devise}">${(Number(f.ht)||0).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${devise}">${(Number(f.ttc)||0).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${devise}">${(Number(f.ttc)||0).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lignesXML}
</Invoice>`;
}
function telechargerXMLUBLFacture(factureId) {
  if (typeof verifierAccesFeature === 'function' && !verifierAccesFeature('export_ubl', 'Export UBL / préparation DGI')) return;
  const f = (STATE.factures || []).find(function(x) { return x.id === factureId; });
  if (!f) { showToast('Facture introuvable', 'error'); return; }
  const clientInfo = (STATE.clients || []).find(function(c) { return c.nom === f.client; });
  if (!STATE.profil?.ice) {
    showToast('⚠️ Renseignez l\'ICE de votre entreprise dans Profil avant d\'exporter (obligatoire DGI)', 'error');
    return;
  }
  const xml = genererXMLUBLFacture(f, STATE.profil, clientInfo);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'UBL_' + (f.ref || 'facture').replace(/\s+/g, '_') + '.xml';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
  showToast('✅ XML UBL 2.1 exporté (préparation — pas encore connecté à la plateforme DGI)', 'success');
}
function afficherStatutDGI() {
  const el_status = document.getElementById('dgi-readiness-status');
  if (!el_status) return;
  const p = STATE.profil || {};
  const manquants = [];
  if (!p.ice) manquants.push('ICE');
  if (!p.rc) manquants.push('RC');
  if (!p.identifiant_fiscal) manquants.push('Identifiant fiscal');
  if (!manquants.length) {
    el_status.innerHTML = '<span style="color:#6E8F4E;font-weight:600">✅ Informations légales complètes</span>';
  } else {
    el_status.innerHTML = '<span style="color:#B23A2E;font-weight:600">⚠️ Manquant : ' + manquants.join(', ') + '</span>';
  }
}
