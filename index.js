console.log("🔥 INDEX.JS VERSION TEST - 2026");

const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, ChannelType, 
    ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const express = require('express');

// ========================================
// CLIENT DISCORD
// ========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ========================================
// CONFIGURATION
// ========================================
const config = {
    token: process.env.DISCORD_TOKEN,
    staffRoleId: process.env.STAFF_ROLE_ID,
    absenceRoleId: process.env.ABSENCE_ROLE_ID,
    demandesChannelId: process.env.DEMANDES_CHANNEL_ID,
    absenceCategoryId: null,
    adminRoleId: process.env.ADMIN_ROLE_ID,
    ticketCategoryId: process.env.TICKET_CATEGORY_ID
};

// ========================================
// STOCKAGE EN MÉMOIRE
// ========================================
const absenceTickets = new Map();
const absences = new Map();
const pendingRequests = new Map();
const activeTickets = new Map();

// ========================================
// UTILITAIRES
// ========================================
function parseDate(dateStr) {
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]), month = parseInt(parts[1]) - 1, year = parseInt(parts[2]);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    return date;
}

// ========================================
// DÉMARRAGE
// ========================================
client.once('ready', () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
    console.log(`📋 Système d'absences: ACTIF`);
    console.log(`🎫 Système de tickets SPVM: ACTIF`);
    setInterval(checkAbsences, 3600000); // Vérifie toutes les heures
    checkAbsences();
});

// ========================================
// VÉRIFICATION DES ABSENCES
// ========================================
async function checkAbsences() {
    const now = new Date();
    now.setHours(0,0,0,0);

    for (const [userId, absence] of absences.entries()) {
        try {
            const guild = client.guilds.cache.get(absence.guildId);
            if (!guild) continue;
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) { absences.delete(userId); continue; }

            const { dateDepart, dateRetour, channelId } = absence;

            if (now >= dateDepart && now < dateRetour && !member.roles.cache.has(config.absenceRoleId)) {
                await member.roles.add(config.absenceRoleId);
                if (channelId) {
                    const channel = guild.channels.cache.get(channelId);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle('🟢 Absence active')
                            .setDescription(`Le rôle d'absence a été ajouté à ${member}.`)
                            .setTimestamp();
                        channel.send({ embeds: [embed] });
                    }
                }
            }

            if (now >= dateRetour && member.roles.cache.has(config.absenceRoleId)) {
                await member.roles.remove(config.absenceRoleId);
                if (channelId) {
                    const channel = guild.channels.cache.get(channelId);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setColor('#0066ff')
                            .setTitle('🔵 Absence terminée')
                            .setDescription(`Le rôle d'absence a été retiré de ${member}.`)
                            .setTimestamp();
                        channel.send({ embeds: [embed] });
                    }
                }
                absences.delete(userId);
            }
        } catch (err) {
            console.error(`Erreur absence pour ${userId}:`, err);
        }
    }
}

// ========================================
// COMMANDES
// ========================================
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // === SETUP ABSENCE ===
    if (message.content === '!setup-absence' && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        let category = message.guild.channels.cache.find(c => c.name === '📋 ABSENCES' && c.type === ChannelType.GuildCategory);
        if (!category) category = await message.guild.channels.create({ name: '📋 ABSENCES', type: ChannelType.GuildCategory });
        config.absenceCategoryId = category.id;

        const embed = new EmbedBuilder()
            .setColor('#0066ff')
            .setTitle('📋 Motiver une absence')
            .setDescription('Clique sur le bouton pour signaler une absence.\nFormat: JJ/MM/AAAA')
            .setFooter({ text: 'Système d\'absences - SPVM' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('create_absence').setLabel('📝 Motiver une absence').setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    }

    // === SETUP TICKETS SPVM ===
    if (message.content === '!setup-tickets' && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const embed = new EmbedBuilder()
            .setColor('#0066ff')
            .setTitle('🎫 Centre d\'Assistance SPVM')
            .setDescription('Sélectionne le type de demande dans le menu.')
            .setFooter({ text: 'Service de Police de la Ville Métropolitaine' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_type_select')
            .setPlaceholder('📋 Sélectionnez le type de demande')
            .addOptions([
                { label: 'Plainte contre un agent', value: 'plainte_agent', description: 'Déposer une plainte', emoji: '⚠️' },
                { label: 'Autre demande', value: 'autre_demande', description: 'Autre demande', emoji: '📝' },
                { label: 'Informations et renseignements', value: 'informations', description: 'Obtenir infos', emoji: 'ℹ️' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
    }
});

// ========================================
// INTERACTIONS
// ========================================
client.on('interactionCreate', async interaction => {
    try {
        // BOUTON ABSENCE
        if (interaction.isButton() && interaction.customId === 'create_absence') {
            const modal = new ModalBuilder().setCustomId('absence_form').setTitle('📋 Formulaire d\'absence');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('motif').setLabel('Motif').setStyle(TextInputStyle.Paragraph).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('date_depart').setLabel('Date départ').setStyle(TextInputStyle.Short).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('date_retour').setLabel('Date retour').setStyle(TextInputStyle.Short).setRequired(true)
                )
            );
            await interaction.showModal(modal);
        }

        // FORMULAIRE ABSENCE
        if (interaction.isModalSubmit() && interaction.customId === 'absence_form') {
            await interaction.deferReply({ ephemeral: true });
            const motif = interaction.fields.getTextInputValue('motif');
            const dateDepart = parseDate(interaction.fields.getTextInputValue('date_depart'));
            const dateRetour = parseDate(interaction.fields.getTextInputValue('date_retour'));
            if (!dateDepart || !dateRetour) return interaction.editReply({ content: '❌ Format de date invalide!' });

            const absenceChannel = await interaction.guild.channels.create({
                name: `absence-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: config.absenceCategoryId,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            absenceTickets.set(interaction.user.id, absenceChannel.id);
            await interaction.editReply({ content: `✅ Ton absence a été signalée: <#${absenceChannel.id}>` });
        }

        // MENU TICKETS
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
            await interaction.deferReply({ ephemeral: true });
            const ticketType = interaction.values[0];
            if (activeTickets.has(interaction.user.id)) return interaction.editReply({ content: '❌ Vous avez déjà un ticket ouvert.' });

            const ticketName = ticketType === 'plainte_agent' ? `plainte-${interaction.user.username}`
                             : ticketType === 'autre_demande' ? `demande-${interaction.user.username}`
                             : `info-${interaction.user.username}`;

            const ticketChannel = await interaction.guild.channels.create({
                name: ticketName,
                type: ChannelType.GuildText,
                parent: config.ticketCategoryId,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: config.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            activeTickets.set(interaction.user.id, ticketChannel.id);
            await interaction.editReply({ content: `✅ Votre ticket a été créé: <#${ticketChannel.id}>` });
        }

    } catch (err) {
        console.error('Erreur interaction:', err);
        if (!interaction.replied) await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true });
    }
});

// ========================================
// CONNEXION
// ========================================
client.login(config.token);

// ========================================
// SERVEUR WEB
// ========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req,res)=> res.send('🚔 Bot SPVM en ligne!'));
app.listen(PORT, ()=> console.log(`Serveur web sur le port ${PORT}`));
