// Tafir — envoi d'emails depuis l'application (via /api/envoyer-email et Resend).
// Tant que l'envoi n'est pas activé côté serveur, tout retombe sur l'ouverture de la messagerie de l'utilisateur (mailto).
async function envoyerDocParEmail(o) {
  // Retourne true si la demande est traitée (envoyée OU erreur déjà affichée), false s'il faut ouvrir la messagerie.
  var doc = o.doc || {}, p = STATE.profil || {};
  if (!sb.token || !doc.client_email) return false;
  try {
    var r = await fetch('/api/envoyer-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sb.token },
      body: JSON.stringify({
        type: 'document', destinataire: doc.client_email, ref: doc.ref, libelle: o.libelleDoc, client: o.libelleDest,
        montant: o.isBC ? null : doc.ttc, devise: doc.devise || 'MAD', lien: o.docUrl,
        entreprise: p.raison || '', tel: p.tel || '', reponse_a: p.email || ''
      })
    });
    var d = await r.json().catch(function () { return {}; });
    if (r.status === 503 || r.status === 404 || r.status === 401) return false;
    if (!r.ok) { showToast(d.erreur || 'Envoi impossible', 'error'); return true; }
    showToast('✅ Email envoyé à ' + doc.client_email, 'success');
    return true;
  } catch (x) { return false; }
}

async function envoyerEmailTest() {
  if (!sb.token) return;
  showToast('Envoi du test…', 'info');
  try {
    var r = await fetch('/api/envoyer-email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sb.token }, body: JSON.stringify({ type: 'test', entreprise: (STATE.profil || {}).raison || '' }) });
    var d = await r.json().catch(function () { return {}; });
    if (r.ok) showToast('✅ Email de test envoyé à ' + ((sb.user || {}).email || 'votre adresse'), 'success');
    else showToast(d.erreur || 'Envoi impossible', 'error');
  } catch (x) { showToast('Envoi impossible', 'error'); }
}
