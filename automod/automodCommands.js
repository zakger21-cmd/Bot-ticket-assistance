// automod/automodCommands.js
// Commandes slash pour l'auto-modération

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { automodConfig, userInfractions } = require('./automodConfig');

const automodCommands = [
    // Commande principale /automod
    {
        data: new SlashCommandBuilder()
            .setName('automod')
            .setDescription('Gérer l\'auto-modération')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('toggle')
                    .setDescription('Activer/désactiver un module')
                    .addStringOption(option =>
                        option
                            .setName('module')
                            .setDescription('Module à activer/désactiver')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Anti-spam', value: 'antiSpam' },
                                { name: 'Anti-flood', value: 'antiFlood' },
                                { name: 'Anti-caps', value: 'antiCaps' },
                                { name: 'Anti-liens', value: 'antiLinks' },
                                { name: 'Anti-mentions', value: 'antiMentions' },
                                { name: 'Anti-mots interdits', value: 'antiWords' }
                            ))
                    .addBooleanOption(option =>
                        option
                            .setName('enabled')
                            .setDescription('Activer (true) ou désactiver (false)')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('configure')
                    .setDescription('Configurer un module')
                    .addStringOption(option =>
                        option
                            .setName('module')
                            .setDescription('Module à configurer')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Anti-spam', value: 'antiSpam' },
                                { name: 'Anti-flood', value: 'antiFlood' },
                                { name: 'Anti-caps', value: 'antiCaps' },
                                { name: 'Anti-liens', value: 'antiLinks' },
                                { name: 'Anti-mentions', value: 'antiMentions' },
                                { name: 'Anti-mots interdits', value: 'antiWords' }
                            ))
                    .addStringOption(option =>
                        option
                            .setName('sanction')
                            .setDescription('Type de sanction')
                            .setRequired(false)
                            .addChoices(
                                { name: 'Avertissement', value: 'warn' },
                                { name: 'Timeout', value: 'timeout' },
                                { name: 'Kick', value: 'kick' },
                                { name: 'Ban', value: 'ban' }
                            ))
                    .addIntegerOption(option =>
                        option
                            .setName('duration')
                            .setDescription('Durée en minutes (pour timeout)')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('logchannel')
                    .setDescription('Définir le salon de logs')
                    .addChannelOption(option =>
                        option
                            .setName('channel')
                            .setDescription('Salon où envoyer les logs')
                            .setRequired(true)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('exempt')
                    .setDescription('Gérer les rôles exemptés')
                    .addRoleOption(option =>
                        option
                            .setName('role')
                            .setDescription('Rôle à exempter/retirer')
                            .setRequired(true))
                    .addStringOption(option =>
                        option
                            .setName('action')
                            .setDescription('Ajouter ou retirer')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Ajouter', value: 'add' },
                                { name: 'Retirer', value: 'remove' }
                            )))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('status')
                    .setDescription('Voir l\'état de l\'auto-modération'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('reset')
                    .setDescription('Réinitialiser les infractions d\'un utilisateur')
                    .addUserOption(option =>
                        option
                            .setName('user')
                            .setDescription('Utilisateur à réinitialiser')
                            .setRequired(true))),
        
        async execute(interaction) {
            const subcommand = interaction.options.getSubcommand();
            
            switch (subcommand) {
                case 'toggle':
                    await handleToggle(interaction);
                    break;
                case 'configure':
                    await handleConfigure(interaction);
                    break;
                case 'logchannel':
                    await handleLogChannel(interaction);
                    break;
                case 'exempt':
                    await handleExempt(interaction);
                    break;
                case 'status':
                    await handleStatus(interaction);
                    break;
                case 'reset':
                    await handleReset(interaction);
                    break;
            }
        }
    }
];

// Gérer l'activation/désactivation
async function handleToggle(interaction) {
    const module = interaction.options.getString('module');
    const enabled = interaction.options.getBoolean('enabled');
    
    automodConfig.enabled[module] = enabled;
    
    const embed = new EmbedBuilder()
        .setColor(enabled ? '#00FF00' : '#FF0000')
        .setTitle('✅ Module ' + (enabled ? 'activé' : 'désactivé'))
        .setDescription(`Le module **${getModuleName(module)}** a été ${enabled ? 'activé' : 'désactivé'}.`)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Gérer la configuration
async function handleConfigure(interaction) {
    const module = interaction.options.getString('module');
    const sanction = interaction.options.getString('sanction');
    const duration = interaction.options.getInteger('duration');
    
    if (sanction) {
        automodConfig[module].sanction = sanction;
    }
    
    if (duration) {
        automodConfig[module].duration = duration * 60000; // Convertir en ms
    }
    
    const embed = new EmbedBuilder()
        .setColor('#0066FF')
        .setTitle('⚙️ Configuration mise à jour')
        .setDescription(`Module: **${getModuleName(module)}**`)
        .addFields(
            { name: 'Sanction', value: sanction ? getSanctionName(sanction) : 'Non modifié', inline: true },
            { name: 'Durée', value: duration ? `${duration} minute(s)` : 'Non modifié', inline: true }
        )
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Gérer le salon de logs
async function handleLogChannel(interaction) {
    const channel = interaction.options.getChannel('channel');
    
    automodConfig.logChannel = channel.id;
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('📋 Salon de logs défini')
        .setDescription(`Les logs d'auto-modération seront envoyés dans ${channel}.`)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Gérer les rôles exemptés
async function handleExempt(interaction) {
    const role = interaction.options.getRole('role');
    const action = interaction.options.getString('action');
    
    if (action === 'add') {
        if (!automodConfig.exemptRoles.includes(role.id)) {
            automodConfig.exemptRoles.push(role.id);
        }
    } else {
        const index = automodConfig.exemptRoles.indexOf(role.id);
        if (index > -1) {
            automodConfig.exemptRoles.splice(index, 1);
        }
    }
    
    const embed = new EmbedBuilder()
        .setColor(action === 'add' ? '#00FF00' : '#FF9900')
        .setTitle('🛡️ Rôle ' + (action === 'add' ? 'ajouté' : 'retiré'))
        .setDescription(`Le rôle ${role} a été ${action === 'add' ? 'ajouté aux' : 'retiré des'} rôles exemptés.`)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Afficher le statut
async function handleStatus(interaction) {
    const embed = new EmbedBuilder()
        .setColor('#0066FF')
        .setTitle('📊 Statut de l\'auto-modération')
        .setDescription('État actuel de tous les modules')
        .addFields(
            { 
                name: '🛡️ Modules actifs', 
                value: Object.entries(automodConfig.enabled)
                    .map(([key, value]) => `${value ? '✅' : '❌'} ${getModuleName(key)}`)
                    .join('\n'),
                inline: false
            },
            {
                name: '📋 Configuration',
                value: 
                    `**Salon de logs:** ${automodConfig.logChannel ? `<#${automodConfig.logChannel}>` : 'Non défini'}\n` +
                    `**Rôles exemptés:** ${automodConfig.exemptRoles.length} rôle(s)\n` +
                    `**Progression sanctions:** ${automodConfig.sanctions.progression ? 'Activée' : 'Désactivée'}`,
                inline: false
            },
            {
                name: '📈 Statistiques',
                value: `**Utilisateurs surveillés:** ${userInfractions.size}`,
                inline: false
            }
        )
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Réinitialiser les infractions
async function handleReset(interaction) {
    const user = interaction.options.getUser('user');
    
    if (userInfractions.has(user.id)) {
        userInfractions.delete(user.id);
    }
    
    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🔄 Infractions réinitialisées')
        .setDescription(`Les infractions de ${user} ont été réinitialisées.`)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Utilitaires
function getModuleName(module) {
    const names = {
        'antiSpam': 'Anti-spam',
        'antiFlood': 'Anti-flood',
        'antiCaps': 'Anti-caps',
        'antiLinks': 'Anti-liens',
        'antiMentions': 'Anti-mentions',
        'antiWords': 'Anti-mots interdits'
    };
    return names[module] || module;
}

function getSanctionName(sanction) {
    const names = {
        'warn': '⚠️ Avertissement',
        'timeout': '🔇 Timeout',
        'kick': '👢 Expulsion',
        'ban': '🔨 Bannissement'
    };
    return names[sanction] || sanction;
}

module.exports = { automodCommands };
