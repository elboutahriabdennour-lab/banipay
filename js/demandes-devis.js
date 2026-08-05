// ZELTO — demandes-devis.js — Demandes de devis reçues des clients
// ============================================================
// Complète le cycle : Client demande un devis (page publique, sans
// compte) → Entreprise voit la demande → crée le devis en réponse
// (pré-rempli) → l'envoie → client accepte → BC généré (phase 25).

STATE.demandesDevis = STATE.demandesDevis || [];

async function loadDemandesDevis() {
  try {
    STATE.demandesDevis = (await sb.get('demandes_devis', 'entreprise_id=eq.' + sb.user.id + '&order=created_at.desc')) || [];
  } catch(e) { STATE.demandesDevis = []; }
  renderDemandesDevis();
}

function renderDemandesDevis() {
  const container = el('demandes-devis-liste');
  if (!container) return;
  const demandes = STATE.demandesDevis || [];
  const nouvelles = demandes.filter(function(d) { return d.statut === 'nouvelle'; });

  const resume = el('demandes-devis-resume');
  if (resume) {
    resume.innerHTML = nouvelles.length
      ? '<div style="background:#FBF0DA;border-radius:12px;padding:12px;margin-bottom:14px"><span style="font-size:12px;font-weight:700;color:#A67A16">📝 ' + nouvelles.length + ' nouvelle(s) demande(s) de devis</span></div>'
      : '';
  }

  container.innerHTML = !demandes.length
    ? '<div class="empty"><div class="empty-ico">📝</div><div class="empty-title">Aucune demande de devis</div><div>Partagez votre lien de profil pour en recevoir</div></div>'
    : demandes.map(function(d) {
        const estTraitee = d.statut === 'traitee';
        return '<div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;border:1px solid #E3DCCF">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">' +
            '<div><div style="font-size:13px;font-weight:700">' + escapeHTML(d.client_nom||'') + '</div>' +
            '<div style="font-size:11px;color:#9C9186">' + (d.client_tel||'') + (d.client_email ? ' · ' + d.client_email : '') + '</div></div>' +
            (estTraitee ? '<span style="font-size:10px;font-weight:600;color:#6E8F4E">✅ Traitée</span>' : '<span style="font-size:10px;font-weight:600;color:#A67A16">⏳ Nouvelle</span>') +
          '</div>' +
          '<div style="font-size:12px;color:#6B5F54;background:#F1EEE8;padding:8px;border-radius:8px;margin-bottom:8px">' + escapeHTML(d.description||'') + '</div>' +
          (!estTraitee ? '<button onclick="creerDevisDepuisDemande(' + d.id + ')" style="width:100%;padding:9px;background:#B8860B;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">📝 Créer le devis</button>' : '') +
        '</div>';
      }).join('');
}

// Pré-remplit l'écran de création de devis à partir d'une demande reçue,
// et marque la demande comme traitée dès qu'on commence à y répondre.
async function creerDevisDepuisDemande(demandeId) {
  const d = (STATE.demandesDevis || []).find(function(x) { return x.id === demandeId; });
  if (!d) return;

  try {
    await sb.patch('demandes_devis', 'id=eq.' + demandeId + '&entreprise_id=eq.' + sb.user.id, { statut: 'traitee' });
    d.statut = 'traitee';
  } catch(e) {}

  goScreen('nouveau-devis', null);
  setTimeout(function() {
    el('d-client') && (el('d-client').value = d.client_nom || '');
    el('d-note') && (el('d-note').value = 'Suite à votre demande : ' + (d.description || ''));
    showToast('📝 Devis pré-rempli depuis la demande de ' + d.client_nom, 'success');
  }, 150);
}
