// logs/botLogger.js
// Système de logs pour le bot

const { EmbedBuilder } = require('discord.js');

const logConfig = {
    logChannelId: null, // ID du salon de logs du bot (à configurer)
    
    // Types de logs à enregistrer
    enabled: {
        commands: true,          // Commandes exécutées
        errors: true,            // Erreurs du bot
        memberJoin: true,        // Membres qui rejoignent
        memberLeave: true,       // Membres qui partent
        channelCreate: true,     // Salons créés
        channelDelete: true,     // Salons supprimés
        roleCreate: true,        // Rôles créés
        roleDelete: true,        // Rôles supprimés
        messageDelete: false,    // Messages supprimés (désactivé par défaut)
        messageEdit: false       // Messages édités (désactivé par défaut)
    },
    
    colors: {
        success: '#00FF00',
        error: '#FF0000',
        info: '#0066FF',
        warning: '#FFA500',
        member: '#9B59B6'
    }
};

function setupBotLogger(client) {
    
    // Log: Membre rejoint
    if (logConfig.enabled.memberJoin) {
        client.on('guildMemberAdd', async (member) => {
            await sendLog('member', {
                title: '📥 Nouveau membre',
                description: member.user.tag + ' a rejoint le serveur',
                fields: [
                    { name: '👤 Utilisateur', value: member.toString(), inline: true },
                    { name: '🆔 ID', value: member.id, inline: true },
                    { name: '📅 Compte créé', value: '<t:' + Math.floor(member.user.createdTimestamp / 1000) + ':R>', inline: true }
                ],
                thumbnail: member.user.displayAvatarURL()
            }, member.guild);
        });
    }
    
    // Log: Membre parti
    if (logConfig.enabled.memberLeave) {
        client.on('guildMemberRemove', async (member) => {
            await sendLog('member', {
                title: '📤 Membre parti',
                description: member.user.tag + ' a quitté le serveur',
                fields: [
                    { name: '👤 Utilisateur', value: member.user.tag, inline: true },
                    { name: '🆔 ID', value: member.id, inline: true },
                    { name: '📅 Rejoint le', value: '<t:' + Math.floor(member.joinedTimestamp / 1000) + ':R>', inline: true }
                ],
                thumbnail: member.user.displayAvatarURL()
            }, member.guild);
        });
    }
    
    // Log: Salon créé
    if (logConfig.enabled.channelCreate) {
        client.on('channelCreate', async (channel) => {
            if (!channel.guild) return;
            
            await sendLog('info', {
                title: '➕ Salon créé',
                description: 'Un nouveau salon a été créé',
                fields: [
                    { name: '📝 Nom', value: channel.name, inline: true },
                    { name: '🆔 ID', value: channel.id, inline: true },
                    { name: '📁 Type', value: channel.type.toString(), inline: true }
                ]
            }, channel.guild);
        });
    }
    
    // Log: Salon supprimé
    if (logConfig.enabled.channelDelete) {
        client.on('channelDelete', async (channel) => {
            if (!channel.guild) return;
            
            await sendLog('warning', {
                title: '➖ Salon supprimé',
                description: 'Un salon a été supprimé',
                fields: [
                    { name: '📝 Nom', value: channel.name, inline: true },
                    { name: '🆔 ID', value: channel.id, inline: true },
                    { name: '📁 Type', value: channel.type.toString(), inline: true }
                ]
            }, channel.guild);
        });
    }
    
    // Log: Rôle créé
    if (logConfig.enabled.roleCreate) {
        client.on('roleCreate', async (role) => {
            await sendLog('info', {
                title: '🎭 Rôle créé',
                description: 'Un nouveau rôle a été créé',
                fields: [
                    { name: '📝 Nom', value: role.name, inline: true },
                    { name: '🆔 ID', value: role.id, inline: true },
                    { name: '🎨 Couleur', value: role.hexColor, inline: true }
                ]
            }, role.guild);
        });
    }
    
    // Log: Rôle supprimé
    if (logConfig.enabled.roleDelete) {
        client.on('roleDelete', async (role) => {
            await sendLog('warning', {
                title: '🎭 Rôle supprimé',
                description: 'Un rôle a été supprimé',
                fields: [
                    { name: '📝 Nom', value: role.name, inline: true },
                    { name: '🆔 ID', value: role.id, inline: true }
                ]
            }, role.guild);
        });
    }
    
    // Log: Message supprimé
    if (logConfig.enabled.messageDelete) {
        client.on('messageDelete', async (message) => {
            if (!message.guild || message.author.bot) return;
            
            await sendLog('warning', {
                title: '🗑️ Message supprimé',
                description: 'Un message a été supprimé',
                fields: [
                    { name: '👤 Auteur', value: message.author.tag, inline: true },
                    { name: '📍 Salon', value: message.channel.toString(), inline: true },
                    { name: '💬 Contenu', value: message.content.substring(0, 1000) || '*Aucun texte*', inline: false }
                ]
            }, message.guild);
        });
    }
    
    // Log: Message édité
    if (logConfig.enabled.messageEdit) {
        client.on('messageUpdate', async (oldMessage, newMessage) => {
            if (!newMessage.guild || newMessage.author.bot) return;
            if (oldMessage.content === newMessage.content) return;
            
            await sendLog('info', {
                title: '✏️ Message édité',
                description: 'Un message a été modifié',
                fields: [
                    { name: '👤 Auteur', value: newMessage.author.tag, inline: true },
                    { name: '📍 Salon', value: newMessage.channel.toString(), inline: true },
                    { name: '📝 Avant', value: oldMessage.content.substring(0, 500) || '*Aucun texte*', inline: false },
                    { name: '📝 Après', value: newMessage.content.substring(0, 500) || '*Aucun texte*', inline: false }
                ]
            }, newMessage.guild);
        });
    }
    
    console.log('📋 Système de logs du bot: ACTIF');
}

// Envoyer un log
async function sendLog(type, data, guild) {
    if (!logConfig.logChannelId) return;
    
    try {
        const logChannel = guild.channels.cache.get(logConfig.logChannelId);
        if (!logChannel) return;
        
        const embed = new EmbedBuilder()
            .setColor(logConfig.colors[type] || logConfig.colors.info)
            .setTitle(data.title)
            .setDescription(data.description || null)
            .setTimestamp();
        
        if (data.fields) {
            embed.addFields(data.fields);
        }
        
        if (data.thumbnail) {
            embed.setThumbnail(data.thumbnail);
        }
        
        embed.setFooter({ text: 'Logs SPVM' });
        
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Erreur envoi log:', error);
    }
}

// Log une commande
async function logCommand(interaction) {
    if (!logConfig.enabled.commands || !logConfig.logChannelId) return;
    
    try {
        const guild = interaction.guild;
        if (!guild) return;
        
        const logChannel = guild.channels.cache.get(logConfig.logChannelId);
        if (!logChannel) return;
        
        const embed = new EmbedBuilder()
            .setColor(logConfig.colors.success)
            .setTitle('⚙️ Commande exécutée')
            .addFields(
                { name: '📝 Commande', value: '`/' + interaction.commandName + '`', inline: true },
                { name: '👤 Par', value: interaction.user.tag, inline: true },
                { name: '📍 Salon', value: interaction.channel.toString(), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Logs SPVM' });
        
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Erreur log commande:', error);
    }
}

// Log une erreur
async function logError(error, context, guild) {
    if (!logConfig.enabled.errors || !logConfig.logChannelId) return;
    
    try {
        const logChannel = guild.channels.cache.get(logConfig.logChannelId);
        if (!logChannel) return;
        
        const embed = new EmbedBuilder()
            .setColor(logConfig.colors.error)
            .setTitle('❌ Erreur du bot')
            .addFields(
                { name: '📍 Contexte', value: context || 'Non spécifié', inline: false },
                { name: '⚠️ Erreur', value: '```' + error.message.substring(0, 1000) + '```', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Logs SPVM' });
        
        await logChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error('Erreur log erreur:', err);
    }
}

module.exports = {
    setupBotLogger,
    logCommand,
    logError,
    logConfig
};
