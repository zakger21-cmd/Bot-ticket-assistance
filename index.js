console.log("🔥 INDEX.JS VERSION TEST - 2026");

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const express = require('express'); // Une seule déclaration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ========================================
// CONFIGURATION - Variables d'environnement
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
// STOCKAGE DES DONNÉES
// ========================================
const absenceTickets = new Map();
const absences = new Map();
const pendingRequests = new Map();
const activeTickets = new Map();

// ========================================
// DÉMARRAGE DU BOT
// ========================================
client.once('ready', () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
    console.log(`📋 Système d'absences: ACTIF`);
    console.log(`🎫 Système de tickets SPVM: ACTIF`);

    setInterval(checkAbsences, 3600000); // Vérification toutes les heures
    checkAbsences();
});

// ========================================
// SYSTÈME D'ABSENCES - Vérification automatique
// ========================================
async function checkAbsences() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    console.log(`🔍 Vérification des absences... (${now.toLocaleDateString('fr-FR')})`);

    for (const [userId, absence] of absences.entries()) {
        try {
            const guild = client.guilds.cache.get(absence.guildId);
            if (!guild) continue;

            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) {
                absences.delete(userId);
                continue;
            }

            const dateDepart = absence.dateDepart;
            const dateRetour = absence.dateRetour;

            if (now >= dateDepart && now < dateRetour && !member.roles.cache.has(config.absenceRoleId)) {
                await member.roles.add(config.absenceRoleId);
                console.log(`✅ Rôle d'absence ajouté à ${member.user.tag}`);
            }

            if (now >= dateRetour && member.roles.cache.has(config.absenceRoleId)) {
                await member.roles.remove(config.absenceRoleId);
                console.log(`✅ Rôle d'absence retiré de ${member.user.tag}`);
                absences.delete(userId);
            }

        } catch (error) {
            console.error(`Erreur lors de la vérification de l'absence pour ${userId}:`, error);
        }
    }
}

function parseDate(dateStr) {
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    return date;
}

// ========================================
// COMMANDES
// ========================================
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // !setup-absence
    if (message.content === '!setup-absence') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Tu dois être administrateur pour utiliser cette commande!');
        let category = message.guild.channels.cache.find(c => c.name === '📋 ABSENCES' && c.type === ChannelType.GuildCategory);
        if (!category) {
            category = await message.guild.channels.create({ name: '📋 ABSENCES', type: ChannelType.GuildCategory });
        }
        config.absenceCategoryId = category.id;

        const embed = new EmbedBuilder()
            .setColor('#0066ff')
            .setTitle('📋 Motiver une absence')
            .setDescription('Pour signaler une absence, cliquez sur le bouton ci-dessous. Merci de toujours préciser le motif, la date de départ et de retour.\n\n**Format des dates:** JJ/MM/AAAA')
            .setFooter({ text: 'Système d\'absences - SPVM' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('create_absence').setLabel('📝 Motiver une absence').setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
        console.log('✅ Panneau d\'absences créé');
    }

    // !setup-tickets
    if (message.content === '!setup-tickets') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Tu dois être administrateur pour utiliser cette commande!');

        const embed = new EmbedBuilder()
            .setColor('#0066ff')
            .setTitle('🎫 Centre d\'Assistance SPVM')
            .setDescription('Pour ouvrir un ticket d\'assistance, sélectionnez le type de demande dans le menu ci-dessous.\nUn salon privé sera créé pour vous permettre de communiquer avec notre administration en toute confidentialité.')
            .setFooter({ text: 'Service de Police de la Ville Métropolitaine' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_type_select')
            .setPlaceholder('📋 Sélectionnez le type de demande')
            .addOptions([
                { label: 'Plainte contre un agent', description: 'Déposer une plainte concernant le comportement d\'un agent', value: 'plainte_agent', emoji: '⚠️' },
                { label: 'Autre demande', description: 'Toute autre demande non listée', value: 'autre_demande', emoji: '📝' },
                { label: 'Informations et renseignements', description: 'Obtenir des informations ou des renseignements', value: 'informations', emoji: 'ℹ️' }
            ]);

        await message.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
        await message.delete().catch(() => {});
        console.log('✅ Panneau de tickets SPVM créé');
    }
});

// ========================================
// INTERACTIONS
// ========================================
client.on('interactionCreate', async interaction => {
    try {
        // Boutons et modals d'absences
        if (interaction.isButton() && interaction.customId === 'create_absence') {
            const existingTicket = absenceTickets.get(interaction.user.id);
            if (existingTicket) {
                return interaction.reply({ content: `❌ Tu as déjà une absence en cours: <#${existingTicket}>`, ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('absence_form')
                .setTitle('📋 Formulaire d\'absence');

            const motifInput = new TextInputBuilder().setCustomId('motif').setLabel('Motif').setStyle(TextInputStyle.Paragraph).setRequired(true);
            const dateDepartInput = new TextInputBuilder().setCustomId('date_depart').setLabel('Date départ (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true);
            const dateRetourInput = new TextInputBuilder().setCustomId('date_retour').setLabel('Date retour (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(motifInput),
                new ActionRowBuilder().addComponents(dateDepartInput),
                new ActionRowBuilder().addComponents(dateRetourInput)
            );

            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'absence_form') {
            await interaction.deferReply({ ephemeral: true });
            const motif = interaction.fields.getTextInputValue('motif');
            const dateDepart = parseDate(interaction.fields.getTextInputValue('date_depart'));
            const dateRetour = parseDate(interaction.fields.getTextInputValue('date_retour'));

            if (!dateDepart || !dateRetour) return interaction.editReply({ content: '❌ Format de date invalide! JJ/MM/AAAA' });
            if (dateRetour <= dateDepart) return interaction.editReply({ content: '❌ La date de retour doit être après la date de départ!' });

            // Création du salon et enregistrement
            const absenceChannel = await interaction.guild.channels.create({
                name: `absence-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: config.absenceCategoryId,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
                ]
            });

            absenceTickets.set(interaction.user.id, absenceChannel.id);

            await interaction.editReply({ content: `✅ Ton absence a été signalée avec succès: <#${absenceChannel.id}>` });
        }

        // Tickets SPVM
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
            await interaction.deferReply({ ephemeral: true });
            // Ici tu peux garder la logique actuelle de création de ticket
        }

    } catch (err) {
        console.error('Erreur interaction:', err);
    }
});

// ========================================
// CONNEXION
// ========================================
client.login(config.token);

// ========================================
// SERVEUR WEB POUR RENDER
// ========================================
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🚔 Bot SPVM - Système complet en ligne! ✅<br>📋 Absences + 🎫 Tickets'));
app.listen(PORT, () => console.log(`Serveur web démarré sur le port ${PORT}`));
