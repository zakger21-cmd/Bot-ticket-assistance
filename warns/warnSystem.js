// warns/warnSystem.js
// Système d'avertissements SPVM

const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Stockage des avertissements (en mémoire)
// Format: userId -> [{ id, reason, staffId, timestamp, type }]
const userWarnings = new Map();

// Configuration
const warnConfig = {
    logChannelId: null, // ID du salon de logs (à configurer)
    staffRoleId: null,  // ID du rôle staff (à configurer)
    colors: {
        inactivite: '#FFA500',
        comportement: '#FF0000',
        manquement: '#FF6B6B',
        rappel: '#FFD700',
        autre: '#9B59B6'
    },
    types: [
        { name: 'Inactivité', value: 'inactivite', emoji: '💤' },
        { name: 'Comportement inapproprié', value: 'comportement', emoji: '⚠️' },
        { name: 'Manquement au règlement', value: 'manquement', emoji: '📋' },
        { name: 'Rappel procédure', value: 'rappel', emoji: '📢' },
        { name: 'Autre', value: 'autre', emoji: '📝' }
    ]
};

// Commandes slash
const warnCommands = [
    {
        data: new SlashCommandBuilder()
            .setName('warn')
            .setDescription('[SPVM] Avertir un agent')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(option =>
                option
                    .setName('agent')
                    .setDescription('L\'agent à avertir')
                    .setRequired(true))
            .addStringOption(option =>
                option
                    .setName('type')
                    .setDescription('Type d\'avertissement')
                    .setRequired(true)
                    .addChoices(
                        { name: '💤 Inactivité', value: 'inactivite' },
                        { name: '⚠️ Comportement inapproprié', value: 'comportement' },
                        { name: '📋 Manquement au règlement', value: 'manquement' },
                        { name: '📢 Rappel procédure', value: 'rappel' },
                        { name: '📝 Autre', value: 'autre' }
                    ))
            .addStringOption(option =>
                option
                    .setName('raison')
                    .setDescription('Raison de l\'avertissement')
                    .setRequired(true)
                    .setMaxLength(500)),
        
        async execute(interaction) {
            await handleWarn(interaction);
        }
    },
    
    {
        data: new SlashCommandBuilder()
            .setName('warnings')
            .setDescription('[SPVM] Voir les avertissements d\'un agent')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(option =>
                option
                    .setName('agent')
                    .setDescription('L\'agent à consulter')
                    .setRequired(true)),
        
        async execute(interaction) {
            await handleViewWarnings(interaction);
        }
    },
    
    {
        data: new SlashCommandBuilder()
            .setName('clearwarns')
            .setDescription('[SPVM] Effacer les avertissements d\'un agent')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addUserOption(option =>
                option
                    .setName('agent')
                    .setDescription('L\'agent dont effacer les avertissements')
                    .setRequired(true)),
        
        async execute(interaction) {
            await handleClearWarnings(interaction);
        }
    },
    
    {
        data: new SlashCommandBuilder()
            .setName('warnconfig')
            .setDescription('[SPVM] Configurer le système d\'avertissements')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('logchannel')
                    .setDescription('Définir le salon de logs')
                    .addChannelOption(option =>
                        option
                            .setName('salon')
                            .setDescription('Salon où envoyer les logs')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('staffrole')
                    .setDescription('Définir le rôle staff')
                    .addRoleOption(option =>
                        option
                            .setName('role')
                            .setDescription('Rôle du personnel autorisé')
                            .setRequired(true))),
        
        async execute(interaction) {
            await handleConfig(interaction);
        }
    }
];

// Gérer l'avertissement
async function handleWarn(interaction) {
    await interaction.deferReply({ flags: 64 });
    
    const agent = interaction.options.getUser('agent');
    const type = interaction.options.getString('type');
    const raison = interaction.options.getString('raison');
    const staff = interaction.user;
    
    // Vérifier que l'agent n'est pas un bot
    if (agent.bot) {
        return interaction.editReply({ content: '❌ Vous ne pouvez pas avertir un bot!' });
    }
    
    // Vérifier que le staff n'avertit pas lui-même
    if (agent.id === staff.id) {
        return interaction.editReply({ content: '❌ Vous ne pouvez pas vous avertir vous-même!' });
    }
    
    // Créer l'avertissement
    const warnId = Date.now().toString();
    const warning = {
        id: warnId,
        reason: raison,
        staffId: staff.id,
        staffTag: staff.tag,
        timestamp: Date.now(),
        type: type
    };
    
    // Ajouter à la liste des avertissements
    if (!userWarnings.has(agent.id)) {
        userWarnings.set(agent.id, []);
    }
    userWarnings.get(agent.id).push(warning);
    
    const warnCount = userWarnings.get(agent.id).length;
    
    // Envoyer un MP à l'agent
    try {
        const typeInfo = warnConfig.types.find(t => t.value === type);
        const dmEmbed = new EmbedBuilder()
            .setColor(warnConfig.colors[type])
            .setTitle('🚨 SPVM – Avertissement Officiel')
            .setDescription(
                '**Vous avez reçu un avertissement du Service de Police de la Ville Métropolitaine.**\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            )
            .addFields(
                { name: typeInfo.emoji + ' Type', value: typeInfo.name, inline: true },
                { name: '📊 Nombre total', value: warnCount.toString(), inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '📋 Raison', value: '```' + raison + '```', inline: false },
                { name: '👮 Agent émetteur', value: staff.tag, inline: true },
                { name: '📅 Date', value: '<t:' + Math.floor(Date.now() / 1000) + ':F>', inline: true }
            )
            .setFooter({ text: 'Service de Police de la Ville Métropolitaine' })
            .setTimestamp();
        
        await agent.send({ embeds: [dmEmbed] });
    } catch (error) {
        console.error('Erreur envoi MP avertissement:', error);
    }
    
    // Logger dans le salon de logs
    if (warnConfig.logChannelId) {
        try {
            const logChannel = interaction.guild.channels.cache.get(warnConfig.logChannelId);
            if (logChannel) {
                const typeInfo = warnConfig.types.find(t => t.value === type);
                const logEmbed = new EmbedBuilder()
                    .setColor(warnConfig.colors[type])
                    .setTitle('📝 SPVM – Avertissement Émis')
                    .addFields(
                        { name: '👤 Agent averti', value: agent.tag + ' (' + agent.id + ')', inline: true },
                        { name: '👮 Par', value: staff.tag, inline: true },
                        { name: '📊 Total', value: warnCount.toString(), inline: true },
                        { name: typeInfo.emoji + ' Type', value: typeInfo.name, inline: true },
                        { name: '🆔 ID', value: '`' + warnId + '`', inline: true },
                        { name: '📅 Date', value: '<t:' + Math.floor(Date.now() / 1000) + ':R>', inline: true },
                        { name: '📋 Raison', value: raison, inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Système d\'avertissements SPVM' });
                
                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (error) {
            console.error('Erreur log avertissement:', error);
        }
    }
    
    // Confirmation au staff
    const typeInfo = warnConfig.types.find(t => t.value === type);
    const confirmEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Avertissement émis')
        .setDescription(
            '**L\'agent a été averti avec succès.**\n\n' +
            '👤 **Agent:** ' + agent.tag + '\n' +
            typeInfo.emoji + ' **Type:** ' + typeInfo.name + '\n' +
            '📊 **Total d\'avertissements:** ' + warnCount + '\n' +
            '🆔 **ID:** `' + warnId + '`'
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [confirmEmbed] });
}

// Voir les avertissements
async function handleViewWarnings(interaction) {
    await interaction.deferReply({ flags: 64 });
    
    const agent = interaction.options.getUser('agent');
    
    if (!userWarnings.has(agent.id) || userWarnings.get(agent.id).length === 0) {
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Aucun avertissement')
            .setDescription('**' + agent.tag + '** n\'a aucun avertissement.')
            .setTimestamp();
        
        return interaction.editReply({ embeds: [embed] });
    }
    
    const warnings = userWarnings.get(agent.id);
    
    const embed = new EmbedBuilder()
        .setColor('#0066FF')
        .setTitle('📋 Dossier d\'avertissements – ' + agent.tag)
        .setDescription('**Total:** ' + warnings.length + ' avertissement(s)')
        .setThumbnail(agent.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'SPVM – Système d\'avertissements' });
    
    // Afficher les 10 derniers avertissements
    const recentWarnings = warnings.slice(-10).reverse();
    
    for (const warn of recentWarnings) {
        const typeInfo = warnConfig.types.find(t => t.value === warn.type) || { emoji: '📝', name: 'Autre' };
        const date = new Date(warn.timestamp);
        
        embed.addFields({
            name: typeInfo.emoji + ' ' + typeInfo.name + ' – ' + date.toLocaleDateString('fr-FR'),
            value: 
                '**Raison:** ' + warn.reason + '\n' +
                '**Par:** ' + warn.staffTag + '\n' +
                '**ID:** `' + warn.id + '` • **Date:** <t:' + Math.floor(warn.timestamp / 1000) + ':R>',
            inline: false
        });
    }
    
    if (warnings.length > 10) {
        embed.setFooter({ text: 'Affichage des 10 derniers avertissements sur ' + warnings.length + ' total' });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

// Effacer les avertissements
async function handleClearWarnings(interaction) {
    await interaction.deferReply({ flags: 64 });
    
    const agent = interaction.options.getUser('agent');
    
    if (!userWarnings.has(agent.id) || userWarnings.get(agent.id).length === 0) {
        return interaction.editReply({ content: '❌ Cet agent n\'a aucun avertissement à effacer.' });
    }
    
    const count = userWarnings.get(agent.id).length;
    userWarnings.delete(agent.id);
    
    // Logger
    if (warnConfig.logChannelId) {
        try {
            const logChannel = interaction.guild.channels.cache.get(warnConfig.logChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor('#FF9900')
                    .setTitle('🗑️ Avertissements effacés')
                    .addFields(
                        { name: '👤 Agent', value: agent.tag, inline: true },
                        { name: '👮 Par', value: interaction.user.tag, inline: true },
                        { name: '📊 Nombre effacé', value: count.toString(), inline: true }
                    )
                    .setTimestamp();
                
                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (error) {
            console.error('Erreur log clear warnings:', error);
        }
    }
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Avertissements effacés')
        .setDescription(count + ' avertissement(s) de **' + agent.tag + '** ont été effacés.')
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

// Configuration
async function handleConfig(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'logchannel') {
        const channel = interaction.options.getChannel('salon');
        warnConfig.logChannelId = channel.id;
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Salon de logs configuré')
            .setDescription('Les logs d\'avertissements seront envoyés dans ' + channel.toString())
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], flags: 64 });
    }
    
    if (subcommand === 'staffrole') {
        const role = interaction.options.getRole('role');
        warnConfig.staffRoleId = role.id;
        
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Rôle staff configuré')
            .setDescription('Le rôle ' + role.toString() + ' peut maintenant émettre des avertissements.')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], flags: 64 });
    }
}

module.exports = {
    warnCommands,
    userWarnings,
    warnConfig
};
