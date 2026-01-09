// automod/automodListener.js
// Écouteurs pour l'auto-modération

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { automodConfig, userInfractions, userMessages } = require('./automodConfig');

function setupAutomod(client) {
    
    client.on('messageCreate', async (message) => {
        // Ignorer les bots et les MPs
        if (message.author.bot || !message.guild) return;
        
        // Vérifier si l'utilisateur est exempté
        if (isExempt(message.member)) return;
        
        // Vérifier chaque module
        try {
            // Anti-spam
            if (automodConfig.enabled.antiSpam) {
                if (await checkSpam(message)) return;
            }
            
            // Anti-flood
            if (automodConfig.enabled.antiFlood) {
                if (await checkFlood(message)) return;
            }
            
            // Anti-caps
            if (automodConfig.enabled.antiCaps) {
                if (await checkCaps(message)) return;
            }
            
            // Anti-liens
            if (automodConfig.enabled.antiLinks) {
                if (await checkLinks(message)) return;
            }
            
            // Anti-mentions
            if (automodConfig.enabled.antiMentions) {
                if (await checkMentions(message)) return;
            }
            
            // Anti-mots interdits
            if (automodConfig.enabled.antiWords) {
                if (await checkBadWords(message)) return;
            }
            
        } catch (error) {
            console.error('Erreur automod:', error);
        }
    });
}

// Vérifier si l'utilisateur est exempté
function isExempt(member) {
    if (!member) return false;
    
    // Vérifier les permissions admin
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    
    // Vérifier les rôles exemptés
    for (const roleId of automodConfig.exemptRoles) {
        if (member.roles.cache.has(roleId)) return true;
    }
    
    return false;
}

// Anti-spam
async function checkSpam(message) {
    const userId = message.author.id;
    const now = Date.now();
    
    if (!userMessages.has(userId)) {
        userMessages.set(userId, []);
    }
    
    const messages = userMessages.get(userId);
    
    // Nettoyer les anciens messages
    const recentMessages = messages.filter(m => now - m.timestamp < automodConfig.antiSpam.timeWindow);
    
    // Ajouter le nouveau message
    recentMessages.push({ content: message.content, timestamp: now });
    userMessages.set(userId, recentMessages);
    
    // Vérifier le spam
    if (recentMessages.length > automodConfig.antiSpam.maxMessages) {
        await handleViolation(message, 'Anti-spam', 'Messages trop rapides', automodConfig.antiSpam);
        
        // Supprimer les messages en spam
        const messagesToDelete = await message.channel.messages.fetch({ limit: automodConfig.antiSpam.maxMessages });
        const userMessagesToDelete = messagesToDelete.filter(m => m.author.id === userId);
        await message.channel.bulkDelete(userMessagesToDelete).catch(() => {});
        
        userMessages.delete(userId);
        return true;
    }
    
    return false;
}

// Anti-flood
async function checkFlood(message) {
    const userId = message.author.id;
    const now = Date.now();
    
    if (!userMessages.has(userId)) return false;
    
    const messages = userMessages.get(userId);
    const recentMessages = messages.filter(m => now - m.timestamp < automodConfig.antiFlood.timeWindow);
    
    // Compter les messages identiques
    const duplicates = recentMessages.filter(m => m.content === message.content);
    
    if (duplicates.length >= automodConfig.antiFlood.maxDuplicates) {
        await handleViolation(message, 'Anti-flood', 'Messages identiques répétés', automodConfig.antiFlood);
        
        // Supprimer les messages en flood
        const messagesToDelete = await message.channel.messages.fetch({ limit: 10 });
        const duplicateMessages = messagesToDelete.filter(m => 
            m.author.id === userId && m.content === message.content
        );
        await message.channel.bulkDelete(duplicateMessages).catch(() => {});
        
        return true;
    }
    
    return false;
}

// Anti-caps
async function checkCaps(message) {
    const content = message.content;
    
    if (content.length < automodConfig.antiCaps.minLength) return false;
    
    const uppercaseCount = (content.match(/[A-Z]/g) || []).length;
    const totalLetters = (content.match(/[A-Za-z]/g) || []).length;
    
    if (totalLetters === 0) return false;
    
    const capsPercentage = (uppercaseCount / totalLetters) * 100;
    
    if (capsPercentage > automodConfig.antiCaps.threshold) {
        await handleViolation(message, 'Anti-caps', 'Trop de majuscules (' + Math.round(capsPercentage) + '%)', automodConfig.antiCaps);
        await message.delete().catch(() => {});
        return true;
    }
    
    return false;
}

// Anti-liens
async function checkLinks(message) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = message.content.match(urlRegex);
    
    if (!urls) return false;
    
    // Vérifier si les liens sont dans la whitelist
    for (const url of urls) {
        let isWhitelisted = false;
        for (const whitelistedDomain of automodConfig.antiLinks.whitelist) {
            if (url.includes(whitelistedDomain)) {
                isWhitelisted = true;
                break;
            }
        }
        
        if (!isWhitelisted) {
            await handleViolation(message, 'Anti-liens', 'Lien non autorisé détecté', automodConfig.antiLinks);
            await message.delete().catch(() => {});
            return true;
        }
    }
    
    return false;
}

// Anti-mentions
async function checkMentions(message) {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    
    if (mentionCount > automodConfig.antiMentions.maxMentions) {
        await handleViolation(message, 'Anti-mentions', 'Trop de mentions (' + mentionCount + ')', automodConfig.antiMentions);
        await message.delete().catch(() => {});
        return true;
    }
    
    return false;
}

// Anti-mots interdits
async function checkBadWords(message) {
    const content = message.content.toLowerCase();
    
    for (const word of automodConfig.antiWords.blacklist) {
        if (content.includes(word.toLowerCase())) {
            await handleViolation(message, 'Anti-mots interdits', 'Mot interdit détecté: ' + word, automodConfig.antiWords);
            await message.delete().catch(() => {});
            return true;
        }
    }
    
    return false;
}

// Gérer une violation
async function handleViolation(message, type, reason, moduleConfig) {
    const userId = message.author.id;
    const now = Date.now();
    
    // Récupérer ou créer les infractions de l'utilisateur
    if (!userInfractions.has(userId)) {
        userInfractions.set(userId, {
            count: 0,
            lastReset: now,
            history: []
        });
    }
    
    const userInfractionsData = userInfractions.get(userId);
    
    // Vérifier si on doit réinitialiser
    if (automodConfig.sanctions.resetAfter && 
        now - userInfractionsData.lastReset > automodConfig.sanctions.resetAfter) {
        userInfractionsData.count = 0;
        userInfractionsData.lastReset = now;
        userInfractionsData.history = [];
    }
    
    // Incrémenter les infractions
    userInfractionsData.count++;
    userInfractionsData.history.push({
        type: type,
        reason: reason,
        timestamp: now
    });
    
    // Déterminer la sanction
    let sanction = moduleConfig.sanction;
    let duration = moduleConfig.duration;
    
    // Progression des sanctions si activée
    if (automodConfig.sanctions.progression) {
        for (const level of automodConfig.sanctions.levels) {
            if (userInfractionsData.count >= level.infractions) {
                sanction = level.action;
                if (level.duration) duration = level.duration;
            }
        }
    }
    
    // Appliquer la sanction
    await applySanction(message.member, sanction, duration, reason, type);
    
    // Envoyer un message à l'utilisateur
    await sendSanctionMessage(message.author, reason, sanction, duration);
    
    // Logger la sanction
    await logSanction(message.guild, message.author, type, reason, sanction, duration, userInfractionsData.count);
}

// Appliquer une sanction
async function applySanction(member, sanction, duration, reason, type) {
    try {
        switch (sanction) {
            case 'warn':
                // Le warn est déjà enregistré dans les infractions
                break;
                
            case 'timeout':
                await member.timeout(duration, '[AUTOMOD ' + type + '] ' + reason);
                break;
                
            case 'kick':
                await member.kick('[AUTOMOD ' + type + '] ' + reason);
                break;
                
            case 'ban':
                await member.ban({ reason: '[AUTOMOD ' + type + '] ' + reason });
                break;
        }
    } catch (error) {
        console.error('Erreur application sanction ' + sanction + ':', error);
    }
}

// Envoyer un message de sanction à l'utilisateur
async function sendSanctionMessage(user, reason, sanction, duration) {
    try {
        const durationText = formatDuration(duration);
        
        let description = automodConfig.sanctionMessage.description
            .replace('{user}', user.toString())
            .replace('{reason}', reason)
            .replace('{sanction}', getSanctionName(sanction))
            .replace('{duration}', durationText);
        
        const embed = new EmbedBuilder()
            .setColor(automodConfig.sanctionMessage.color)
            .setTitle(automodConfig.sanctionMessage.title)
            .setDescription(description)
            .setFooter({ text: automodConfig.sanctionMessage.footer })
            .setTimestamp();
        
        await user.send({ embeds: [embed] }).catch(() => {
            // L'utilisateur a peut-être désactivé les MPs
        });
    } catch (error) {
        console.error('Erreur envoi message sanction:', error);
    }
}

// Logger une sanction
async function logSanction(guild, user, type, reason, sanction, duration, infractionCount) {
    if (!automodConfig.logChannel) return;
    
    try {
        const logChannel = guild.channels.cache.get(automodConfig.logChannel);
        if (!logChannel) return;
        
        const durationText = formatDuration(duration);
        
        const embed = new EmbedBuilder()
            .setColor('#FF9900')
            .setTitle('🚨 Auto-modération - Sanction appliquée')
            .addFields(
                { name: '👤 Utilisateur', value: user.tag + ' (' + user.id + ')', inline: true },
                { name: '⚠️ Type', value: type, inline: true },
                { name: '📋 Infraction', value: reason, inline: false },
                { name: '🔨 Sanction', value: getSanctionName(sanction), inline: true },
                { name: '⏱️ Durée', value: durationText || 'N/A', inline: true },
                { name: '📊 Total infractions', value: infractionCount.toString(), inline: true },
                { name: '🤖 Modérateur', value: 'BOT SPVM', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Auto-modération SPVM' });
        
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Erreur log sanction:', error);
    }
}

// Formater la durée
function formatDuration(ms) {
    if (!ms || ms === 0) return 'Permanent';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return days + ' jour' + (days > 1 ? 's' : '');
    if (hours > 0) return hours + ' heure' + (hours > 1 ? 's' : '');
    if (minutes > 0) return minutes + ' minute' + (minutes > 1 ? 's' : '');
    return seconds + ' seconde' + (seconds > 1 ? 's' : '');
}

// Obtenir le nom de la sanction
function getSanctionName(sanction) {
    const names = {
        'warn': '⚠️ Avertissement',
        'timeout': '🔇 Timeout',
        'kick': '👢 Expulsion',
        'ban': '🔨 Bannissement'
    };
    return names[sanction] || sanction;
}

module.exports = { setupAutomod };
