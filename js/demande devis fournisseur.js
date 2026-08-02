// ZELTO — demande-devis-fournisseur.js — Demander un devis à un
// fournisseur, dans l'autre sens de demandes-devis.js (là, c'est un
// client qui demande à nous ; ici, c'est nous qui demandons à notre
// fournisseur).
// ============================================================
// Deux cas : le fournisseur a un compte Zelto (on réutilise directement
// creer_demande_devis, comme s'il recevait la demande de "son client")
// ou pas (on envoie simplement un message WhatsApp/email avec la
// description du besoin).

function ouvrirDemandeDevisFournisseur() {
  el('ddf-fournisseur-lien') && (el('ddf-fournisseur-lien').value = '');
  el('ddf-fournisseur-nom') && (el('ddf-fournisseur-nom').value = '');
  el('ddf-fournisseur-tel') && (el('ddf-fournisseur-tel').value = '');
  el('ddf-description') && (el('ddf-description').value = '');
  goScreen('demande-devis-fournisseur', null);
}

async function envoyerDemandeDevisFournisseur() {
  const lien = (el('ddf-fournisseur-lien')?.value || '').trim();
  const nom = (el('ddf-fournisseur-nom')?.value || '').trim();
  const tel = (el('ddf-fournisseur-tel')?.value || '').trim();
  const description = (el('ddf-description')?.value || '').trim();

  if (!description) { showToast('Décrivez ce dont vous avez besoin', 'error'); return; }
  if (!lien && !nom) { showToast('Indiquez le fournisseur (nom ou lien Zelto)', 'error'); return; }

  const p = STATE.profil || {};

  // CAS 1 : fournisseur sur Zelto (lien collé) — on lui envoie la demande
  // directement via la même RPC que celle utilisée par nos propres clients.
  if (lien) {
    let idUnique = null;
    try {
      const url = new URL(lien.startsWith('http') ? lien : 'https://x.com?' + lien);
      idUnique = url.searchParams.get('profil') || url.searchParams.get('portail');
    } catch(e) { idUnique = lien.trim(); }

    if (idUnique) {
      showToast('⏳ Envoi...');
      try {
        const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/creer_demande_devis', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_id_unique: idUnique,
            p_client_nom: p.raison || sb.user?.email || 'Client Zelto',
            p_client_tel: p.tel || '',
            p_client_email: sb.user?.email || '',
            p_description: description
          })
        });
        if (resp.ok) {
          showToast('✅ Demande envoyée au fournisseur sur Zelto', 'success');
          goScreen('bon-commande', null);
          return;
        }
        showToast('Fournisseur introuvable sur Zelto — envoi par WhatsApp à la place', 'error');
      } catch(e) {}
    }
  }

  // CAS 2 : pas de compte Zelto — message WhatsApp classique
  const msg = encodeURIComponent(
    'Bonjour ' + (nom || '') + ',\n\n' +
    'Pourriez-vous nous établir un devis pour :\n' + description + '\n\n' +
    'Cordialement,\n' + (p.raison || '')
  );
  if (tel) {
    window.open('https://wa.me/' + tel.replace(/[^0-9+]/g,'').replace(/^0/,'212') + '?text=' + msg, '_blank');
  } else {
    navigator.clipboard?.writeText(decodeURIComponent(msg));
    showToast('Numéro non renseigné — message copié, collez-le où vous voulez', 'success');
  }
  goScreen('bon-commande', null);
}

// ============================================================
// DISCUTER / PROPOSER UN RENDEZ-VOUS avec le fournisseur (WhatsApp — pas
// de vraie messagerie interne avec les fournisseurs pour l'instant,
// contrairement à celle avec le comptable).
// ============================================================
function discuterAvecFournisseur() {
  const tel = (el('ddf-fournisseur-tel')?.value || '').trim();
  const nom = (el('ddf-fournisseur-nom')?.value || 'Bonjour').trim();
  if (!tel) { showToast('Renseignez le téléphone du fournisseur', 'error'); return; }
  window.open('https://wa.me/' + tel.replace(/[^0-9+]/g,'').replace(/^0/,'212') + '?text=' + encodeURIComponent('Bonjour ' + nom + ', je vous contacte au sujet de ma demande de devis.'), '_blank');
}

function proposerRendezVousFournisseur() {
  const tel = (el('ddf-fournisseur-tel')?.value || '').trim();
  const nom = (el('ddf-fournisseur-nom')?.value || '').trim();
  if (!tel) { showToast('Renseignez le téléphone du fournisseur', 'error'); return; }
  const msg = 'Bonjour ' + nom + ', seriez-vous disponible pour un rendez-vous afin d\'échanger sur ma demande de devis ? Merci de me proposer un créneau qui vous convient.';
  window.open('https://wa.me/' + tel.replace(/[^0-9+]/g,'').replace(/^0/,'212') + '?text=' + encodeURIComponent(msg), '_blank');
}
