// automod/automodConfig.js
// Configuration de l'auto-modération

const automodConfig = {
    // Activation des modules
    enabled: {
        antiSpam: true,
        antiFlood: true,
        antiCaps: true,
        antiLinks: true,
        antiMentions: true,
        antiWords: true
    },
    
    // Configuration anti-spam
    antiSpam: {
        maxMessages: 5,          // Nombre max de messages
        timeWindow: 5000,        // Dans cette fenêtre (ms)
        sanction: 'timeout',     // warn, timeout, kick, ban
        duration: 300000         // Durée timeout (5 min)
    },
    
    // Configuration anti-flood
    antiFlood: {
        maxDuplicates: 3,        // Nombre max de messages identiques
        timeWindow: 10000,       // Dans cette fenêtre (ms)
        sanction: 'warn',
        duration: 60000
    },
    
    // Configuration anti-caps
    antiCaps: {
        threshold: 70,           // Pourcentage de MAJUSCULES
        minLength: 10,           // Longueur min du message
        sanction: 'warn',
        duration: 60000
    },
    
    // Configuration anti-liens
    antiLinks: {
        whitelist: [
            'discord.gg',
            'youtube.com',
            'youtu.be',
            'twitch.tv'
        ],
        sanction: 'timeout',
        duration: 600000         // 10 min
    },
    
    // Configuration anti-mentions
    antiMentions: {
        maxMentions: 5,          // Nombre max de mentions
        sanction: 'timeout',
        duration: 300000
    },
    
    // Configuration anti-mots interdits
    antiWords: {
        blacklist: [
            'mot1',
            'mot2',
            'mot3'
            // Ajoute tes mots interdits ici
        ],
        sanction: 'warn',
        duration: 60000
    },
    
    // Système de progression des sanctions
    sanctions: {
        progression: true,       // Activer la progression
        levels: [
            { infractions: 1, action: 'warn' },
            { infractions: 3, action: 'timeout', duration: 300000 },    // 5 min
            { infractions: 5, action: 'timeout', duration: 3600000 },   // 1h
            { infractions: 7, action: 'kick' },
            { infractions: 10, action: 'ban' }
        ],
        resetAfter: 86400000     // Réinitialiser après 24h
    },
    
    // Rôles exemptés
    exemptRoles: [],             // IDs des rôles exemptés (à configurer)
    
    // Salon de logs
    logChannel: null,            // ID du salon de logs (à configurer)
    
    // Message RP SPVM
    sanctionMessage: {
        title: '🚨 SPVM – Avis de sanction',
        description: 'Vous avez enfreint le règlement du serveur.\n\n**Infraction:** {reason}\n**Sanction:** {sanction}\n**Durée:** {duration}',
        color: '#FF0000',
        footer: 'Service de Police de la Ville Métropolitaine'
    }
};

// Stockage des infractions par utilisateur
const userInfractions = new Map();
// Format: userId -> { count: number, lastReset: timestamp, history: [] }

// Stockage des messages pour détection spam/flood
const userMessages = new Map();
// Format: userId -> [{ content: string, timestamp: number }]

module.exports = {
    automodConfig,
    userInfractions,
    userMessages
};
