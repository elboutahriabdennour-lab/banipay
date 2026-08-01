// ZELTO — support.js — Support (email, WhatsApp, formulaire, chatbot FAQ)
// ============================================================
// PÉRIMÈTRE HONNÊTE : le "chatbot" ci-dessous n'est PAS une IA — c'est un
// simple assistant à mots-clés qui répond aux questions fréquentes déjà
// prévues ci-dessous, avec un renvoi vers le vrai support humain si aucune
// correspondance n'est trouvée. À ajuster : email/téléphone de support
// (placeholders ci-dessous, à remplacer par les vraies coordonnées).

const SUPPORT_EMAIL = 'support@zelto.ma'; // ⚠️ À remplacer par la vraie adresse
const SUPPORT_TEL = '+212600000000'; // ⚠️ À remplacer par le vrai numéro

function contacterSupportEmail() {
  const sujet = encodeURIComponent('Support Zelto');
  const corps = encodeURIComponent('Bonjour,\n\nDécrivez votre problème ici...\n\nCompte : ' + (sb.user?.email || ''));
  window.location.href = 'mailto:' + SUPPORT_EMAIL + '?subject=' + sujet + '&body=' + corps;
}

function contacterSupportWhatsApp() {
  const msg = encodeURIComponent('Bonjour, j\'ai besoin d\'aide sur Zelto (compte: ' + (sb.user?.email || '') + ')');
  window.open('https://wa.me/' + SUPPORT_TEL.replace(/[^0-9]/g,'') + '?text=' + msg, '_blank');
}

async function envoyerTicketSupport() {
  const sujet = (el('sup-sujet')?.value || '').trim();
  const message = (el('sup-message')?.value || '').trim();
  if (!sujet || !message) { showToast('Sujet et message obligatoires', 'error'); return; }
  try {
    const resp = await fetch(SUPABASE_URL + '/rest/v1/rpc/creer_ticket_support', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + sb.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_email: sb.user?.email || '',
        p_nom: sb.user?.user_metadata?.nom || '',
        p_sujet: sujet,
        p_message: message
      })
    });
    if (!resp.ok) { showToast('Erreur — réessayez ou utilisez l\'email/WhatsApp', 'error'); return; }
    el('sup-sujet') && (el('sup-sujet').value = '');
    el('sup-message') && (el('sup-message').value = '');
    showToast('✅ Message envoyé — nous vous répondrons par email', 'success');
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
  }
}

// ============================================================
// CHATBOT FAQ — mots-clés, pas une IA (voir note en tête de fichier)
// ============================================================
const FAQ_ZELTO = [
  { mots: ['facture', 'créer une facture', 'nouvelle facture'], reponse: 'Pour créer une facture : Dashboard → "Facture" (action rapide), remplissez le client et les lignes, puis "Sauvegarder".' },
  { mots: ['devis'], reponse: 'Pour créer un devis : Dashboard → "Devis", remplissez le client et les lignes. Une fois accepté par le client, vous pouvez le convertir en facture d\'un clic.' },
  { mots: ['tva', 'déclarer'], reponse: 'L\'écran TVA (Dashboard → TVA) récapitule votre TVA collectée par mois. Si vous avez un comptable lié, il peut la vérifier et vous notifier.' },
  { mots: ['comptable', 'inviter'], reponse: 'Profil → section "Mon comptable" → "Inviter mon comptable", puis saisissez son email.' },
  { mots: ['gratuit', 'prix', 'abonnement', 'payant'], reponse: 'Contactez-nous par email ou WhatsApp pour connaître les conditions d\'utilisation actuelles.' },
  { mots: ['supprimer', 'compte', 'désinscrire'], reponse: 'Profil → Paramètres → Sécurité → "Supprimer mon compte". Cette action est irréversible.' },
  { mots: ['mot de passe', 'password'], reponse: 'Profil → Paramètres → Sécurité → "Changer le mot de passe". Si vous êtes déconnecté, utilisez "Mot de passe oublié" sur l\'écran de connexion.' },
  { mots: ['client', 'ajouter un client'], reponse: 'Écran Clients → "+ Ajouter" — manuellement, via un lien Zelto, ou en import CSV.' },
  { mots: ['stock'], reponse: 'Activez le suivi de stock sur un article (Catalogue → modifier l\'article) pour voir sa quantité et recevoir une alerte si elle est basse.' },
  { mots: ['bon de commande', 'bc'], reponse: 'Paramètres → "Bons de commande" ou directement depuis Achats. Vous pouvez aussi en recevoir automatiquement quand un client accepte un devis.' },
];

function envoyerMessageChatbot() {
  const input = el('chatbot-input');
  const question = (input?.value || '').trim();
  if (!question) return;
  ajouterMessageChatbot(question, true);
  if (input) input.value = '';

  const ql = question.toLowerCase();
  const match = FAQ_ZELTO.find(function(faq) {
    return faq.mots.some(function(m) { return ql.includes(m); });
  });

  setTimeout(function() {
    if (match) {
      ajouterMessageChatbot(match.reponse, false);
    } else {
      ajouterMessageChatbot('Je n\'ai pas de réponse toute prête pour ça 🙏 — contactez le support par email, WhatsApp ou le formulaire ci-dessus, une vraie personne vous répondra.', false);
    }
  }, 400);
}

function ajouterMessageChatbot(texte, estUtilisateur) {
  const zone = el('chatbot-messages');
  if (!zone) return;
  const bulle = document.createElement('div');
  bulle.style.cssText = 'display:flex;justify-content:' + (estUtilisateur ? 'flex-end' : 'flex-start') + ';margin-bottom:8px';
  bulle.innerHTML = '<div style="max-width:80%;padding:9px 13px;border-radius:' + (estUtilisateur ? '14px 14px 4px 14px' : '14px 14px 14px 4px') + ';background:' + (estUtilisateur ? '#1F6F72' : '#F1EEE8') + ';color:' + (estUtilisateur ? '#fff' : '#2A2420') + ';font-size:13px;line-height:1.4">' + escapeHTML(texte) + '</div>';
  zone.appendChild(bulle);
  zone.scrollTop = zone.scrollHeight;
}

function initChatbot() {
  const zone = el('chatbot-messages');
  if (zone && !zone.dataset.init) {
    zone.dataset.init = '1';
    ajouterMessageChatbot('👋 Bonjour ! Posez-moi une question sur Zelto (facture, devis, TVA, comptable...). Si je ne sais pas répondre, contactez le support directement au-dessus.', false);
  }
}
