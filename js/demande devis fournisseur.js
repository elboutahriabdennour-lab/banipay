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
  // Mémorise l'écran d'où on vient pour que le bouton retour y ramène
  // vraiment, plutôt que de toujours renvoyer vers le formulaire BC.
  const ecranActif = document.querySelector('.screen.active');
  window._ddfRetour = (ecranActif && ecranActif.id) ? ecranActif.id.replace('screen-', '') : 'hub-achats';
  el('ddf-fournisseur-lien') && (el('ddf-fournisseur-lien').value = '');
  el('ddf-fournisseur-nom') && (el('ddf-fournisseur-nom').value = '');
  el('ddf-fournisseur-tel') && (el('ddf-fournisseur-tel').value = '');
  el('ddf-description') && (el('ddf-description').value = '');
  goScreen('demande-devis-fournisseur', null);
}

function retourDepuisDemandeDevisFournisseur() {
  goScreen(window._ddfRetour || 'hub-achats', null);
}

async function envoyerDemandeDevisFournisseur() {
  const lien = (el('ddf-fournisseur-lien')?.value || '').trim();
  const nom = (el('ddf-fournisseur-nom')?.value || '').trim();
  const tel = (el('ddf-fournisseur-tel')?.value || '').trim();
  const description = (el('ddf-description')?.value || '').trim();

  if (!description) { showToast('Décrivez ce dont vous avez besoin', 'error'); return; }
  if (!lien && !nom) { showToast('Indiquez le fournisseur (nom ou lien Zelto)', 'error'); return; }
  // FIX: sans lien Zelto ET sans téléphone, la demande ne peut être remise
  // à personne — avant, ce cas passait quand même et finissait sur une
  // tentative de copie presse-papier qui pouvait échouer silencieusement,
  // laissant l'utilisateur sans aucun retour concret ("le bouton ne
  // marche pas").
  if (!lien && !tel) { showToast('Indiquez un lien Zelto ou un téléphone pour pouvoir transmettre la demande', 'error'); return; }

  const p = STATE.profil || {};

  // CAS 1 : fournisseur sur Zelto (lien collé) — on lui envoie la demande
  // directement via la même RPC que celle utilisée par nos propres clients.
  if (lien) {
    let idUnique = null;
    try {
      const url = new URL(lien.startsWith('http') ? lien : 'https://x.com?' + lien);
      idUnique = url.searchParams.get('profil') || url.searchParams.get('portail');
    } catch(e) { idUnique = null; }
    if (!idUnique) idUnique = lien.trim(); // dernier recours : le texte collé est peut-être l'id lui-même

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
          goScreen(window._ddfRetour || 'bon-commande', null);
          return;
        }
        // FIX: on ne masque plus l'échec en silence — si on a un tel, on
        // bascule sur WhatsApp en le disant clairement ; sinon on arrête
        // ici avec un message honnête plutôt que de continuer vers un
        // repli qui pourrait lui aussi échouer sans que l'utilisateur sache.
        if (!tel) {
          showToast('❌ Fournisseur introuvable sur Zelto — ajoutez son téléphone pour l\'envoyer par WhatsApp à la place', 'error');
          return;
        }
        showToast('Fournisseur introuvable sur Zelto — envoi par WhatsApp à la place', 'error');
      } catch(e) {
        if (!tel) {
          showToast('❌ Erreur d\'envoi — ajoutez un téléphone pour envoyer par WhatsApp à la place', 'error');
          return;
        }
      }
    }
  }

  // CAS 2 : pas de compte Zelto (ou envoi Zelto raté) — message WhatsApp,
  // avec un téléphone obligatoire à ce stade (garanti par la validation
  // du début).
  const msg = encodeURIComponent(
    'Bonjour ' + (nom || '') + ',\n\n' +
    'Pourriez-vous nous établir un devis pour :\n' + description + '\n\n' +
    'Cordialement,\n' + (p.raison || '')
  );
  window.open('https://wa.me/' + tel.replace(/[^0-9+]/g,'').replace(/^0/,'212') + '?text=' + msg, '_blank');
  showToast('✅ Ouverture de WhatsApp...', 'success');
  goScreen(window._ddfRetour || 'bon-commande', null);
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
