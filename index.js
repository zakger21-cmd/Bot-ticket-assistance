const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

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
    token: process.env.TOKEN,
    // Système d'absences
    staffRoleId: process.env.STAFF_ROLE_ID,
    absenceRoleId: process.env.ABSENCE_ROLE_ID,
    demandesChannelId: process.env.DEMANDES_CHANNEL_ID,
    absenceCategoryId: null,
    // Système de tickets SPVM
    adminRoleId: process.env.ADMIN_ROLE_ID,
    ticketCategoryId: process.env.TICKET_CATEGORY_ID
};

// ========================================
// STOCKAGE
// ========================================
const absenceTickets = new Map();
const absences = new Map();
const pendingAbsences = new Map();
const spvmTickets = new Map();

// ========================================
// DÉMARRAGE
// ========================================
client.once('ready', () => {
    console.log(`✅ Bot connecté: ${client.user.tag}`);
    console.log(`📋 Système d'absences: ACTIF`);
    console.log(`🎫 Système de tickets SPVM: ACTIF`);
    setInterval(checkAbsences, 3600000);
    checkAbsences();
});

// ========================================
// FONCTION: Vérifier les absences
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
            
            // Ajouter le rôle à la date de départ
            if (now >= absence.dateDepart && now < absence.dateRetour) {
                if (!member.roles.cache.has(config.absenceRoleId)) {
                    await member.roles.add(config.absenceRoleId);
                    console.log(`✅ Rôle ajouté: ${member.user.tag}`);
                    
                    if (absence.channelId) {
                        const channel = guild.channels.cache.get(absence.channelId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor('#00ff00')
                                .setTitle('🟢 Absence active')
                                .setDescription(`Le rôle d'absence a été automatiquement ajouté à ${member}.`)
                                .setTimestamp();
                            await channel.send({ embeds: [embed] });
                        }
                    }
                }
            }
            
            // Retirer le rôle à la date de retour
            if (now >= absence.dateRetour) {
                if (member.roles.cache.has(config.absenceRoleId)) {
                    await member.roles.remove(config.absenceRoleId);
                    console.log(`✅ Rôle retiré: ${member.user.tag}`);
                    
                    if (absence.channelId) {
                        const channel = guild.channels.cache.get(absence.channelId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor('#0066ff')
                                .setTitle('🔵 Absence terminée')
                                .setDescription(`Le rôle d'absence a été retiré de ${member}.\n\nBon retour! 👋`)
                                .setTimestamp();
                            await channel.send({ embeds: [embed] });
                        }
                    }
                }
                absences.delete(userId);
            }
        } catch (error) {
            console.error(`Erreur absence ${userId}:`, error);
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

    // Commande: !setup-absence
    if (message.content === '!setup-absence') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Administrateur requis!');
        }

        let category = message.guild.channels.cache.find(c => c.name === '📋 ABSENCES' && c.type === ChannelType.GuildCategory);
        if (!category) {
            category = await message.guild.channels.create({
                name: '📋 ABSENCES',
                type: ChannelType.GuildCategory
            });
        }
        config.absenceCategoryId = category.id;

        const embed = new EmbedBuilder()
            .setColor('#0066ff')
            .setTitle('📋 Motiver une absence')
            .setDescription('Pour signaler une absence, cliquez sur le bouton ci-dessous.\n\n**Format des dates:** JJ/MM/AAAA (ex: 15/01/2026)')
            .setFooter({ text: 'Système d\'absences - SPVM' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_absence')
                    .setLabel('📝 Motiver une absence')
                    .setStyle(ButtonStyle.Primary)
            );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    }

    // Commande: !setup-tickets
    if (message.content === '!setup-tickets') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Administrateur requis!');
        }

        const embed = new EmbedBuilder()
            .setColor('#0066ff')
            .setTitle('🎫 Centre d\'Assistance SPVM')
            .setDescription(
                '**Bienvenue au centre d\'assistance du Service de Police de la Ville Métropolitaine.**\n\n' +
                'Pour ouvrir un ticket, sélectionnez le type de demande ci-dessous.\n\n' +
                '📌 Un salon privé sera créé pour communiquer avec notre administration.'
            )
            .setFooter({ text: 'Service de Police de la Ville Métropolitaine' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_type_select')
            .setPlaceholder('📋 Sélectionnez le type de demande')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('Informations et renseignements')
                    .setDescription('Obtenir des informations ou des renseignements')
                    .setValue('informations')
                    .setEmoji('ℹ️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Plainte contre un agent')
                    .setDescription('Déposer une plainte concernant un agent')
                    .setValue('plainte_agent')
                    .setEmoji('⚠️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Autre demande')
                    .setDescription('Toute autre demande')
                    .setValue('autre_demande')
                    .setEmoji('📝')
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
    
    // ========== SYSTÈME D'ABSENCES - Bouton ==========
    if (interaction.isButton() && interaction.customId === 'create_absence') {
        if (absenceTickets.has(interaction.user.id)) {
            const existingId = absenceTickets.get(interaction.user.id);
            const existingChannel = interaction.guild.channels.cache.get(existingId);
            if (existingChannel) {
                return interaction.reply({ content: `❌ Tu as déjà une absence: <#${existingId}>`, ephemeral: true });
            }
            absenceTickets.delete(interaction.user.id);
        }

        const modal = new ModalBuilder()
            .setCustomId('absence_form')
            .setTitle('📋 Formulaire d\'absence');

        const motifInput = new TextInputBuilder()
            .setCustomId('motif')
            .setLabel('Motif de l\'absence')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ex: Maladie, rendez-vous médical...')
            .setRequired(true)
            .setMaxLength(500);

        const dateDepartInput = new TextInputBuilder()
            .setCustomId('date_depart')
            .setLabel('Date de départ (JJ/MM/AAAA)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 15/01/2026')
            .setRequired(true)
            .setMaxLength(10);

        const dateRetourInput = new TextInputBuilder()
            .setCustomId('date_retour')
            .setLabel('Date de retour (JJ/MM/AAAA)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 20/01/2026')
            .setRequired(true)
            .setMaxLength(10);

        modal.addComponents(
            new ActionRowBuilder().addComponents(motifInput),
            new ActionRowBuilder().addComponents(dateDepartInput),
            new ActionRowBuilder().addComponents(dateRetourInput)
        );

        await interaction.showModal(modal);
    }

    // ========== SYSTÈME D'ABSENCES - Formulaire ==========
    if (interaction.isModalSubmit() && interaction.customId === 'absence_form') {
        await interaction.deferReply({ ephemeral: true });

        const motif = interaction.fields.getTextInputValue('motif');
        const dateDepartStr = interaction.fields.getTextInputValue('date_depart');
        const dateRetourStr = interaction.fields.getTextInputValue('date_retour');

        const dateDepart = parseDate(dateDepartStr);
        const dateRetour = parseDate(dateRetourStr);

        if (!dateDepart || !dateRetour) {
            return interaction.editReply({ content: '❌ Format de date invalide! Utilise JJ/MM/AAAA' });
        }

        if (dateRetour <= dateDepart) {
            return interaction.editReply({ content: '❌ La date de retour doit être après la date de départ!' });
        }

        try {
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

            const userEmbed = new EmbedBuilder()
                .setColor('#0066ff')
                .setTitle('📋 Absence signalée')
                .setDescription(`**Utilisateur:** ${interaction.user}\n\n**Motif:** ${motif}\n\n**Date de départ:** ${dateDepartStr}\n**Date de retour:** ${dateRetourStr}\n\n⏳ Le rôle sera ajouté le ${dateDepartStr} et retiré le ${dateRetourStr}.`)
                .setFooter({ text: 'Un membre de l\'administration va l\'examiner' })
                .setTimestamp();

            const userButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_absence')
                        .setLabel('🔒 Fermer')
                        .setStyle(ButtonStyle.Secondary)
                );

            await absenceChannel.send({ embeds: [userEmbed], components: [userButton] });

            const demandesChannel = interaction.guild.channels.cache.get(config.demandesChannelId);
            if (demandesChannel) {
                const staffEmbed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('🔔 Nouvelle demande d\'absence')
                    .setDescription(`**Utilisateur:** ${interaction.user} (${interaction.user.tag})\n**ID:** ${interaction.user.id}\n\n**Motif:** ${motif}\n\n**Date départ:** ${dateDepartStr}\n**Date retour:** ${dateRetourStr}\n\n**Salon:** <#${absenceChannel.id}>`)
                    .setFooter({ text: 'Action requise - Administration' })
                    .setTimestamp();

                const staffButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('accept_absence')
                            .setLabel('✅ Accepter')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('decline_absence')
                            .setLabel('❌ Refuser')
                            .setStyle(ButtonStyle.Danger)
                    );

                const staffMessage = await demandesChannel.send({ 
                    content: `<@&${config.staffRoleId}>`, 
                    embeds: [staffEmbed], 
                    components: [staffButtons] 
                });

                pendingAbsences.set(staffMessage.id, {
                    userId: interaction.user.id,
                    ticketChannelId: absenceChannel.id,
                    motif: motif,
                    dateDepart: dateDepartStr,
                    dateRetour: dateRetourStr
                });
            }

            await interaction.editReply({ content: `✅ Absence signalée: <#${absenceChannel.id}>` });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '❌ Erreur lors de la création!' });
        }
    }

    // ========== SYSTÈME D'ABSENCES - Accepter ==========
    if (interaction.isButton() && interaction.customId === 'accept_absence') {
        if (!interaction.member.roles.cache.has(config.staffRoleId)) {
            return interaction.reply({ content: '❌ Staff uniquement!', ephemeral: true });
        }

        const request = pendingAbsences.get(interaction.message.id);
        if (!request) {
            return interaction.reply({ content: '❌ Demande introuvable!', ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(request.userId);
        const ticketChannel = interaction.guild.channels.cache.get(request.ticketChannelId);
        
        const dateDepart = parseDate(request.dateDepart);
        const dateRetour = parseDate(request.dateRetour);
        
        absences.set(request.userId, {
            dateDepart: dateDepart,
            dateRetour: dateRetour,
            guildId: interaction.guild.id,
            channelId: request.ticketChannelId
        });
        
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        if (now >= dateDepart && now < dateRetour) {
            await member.roles.add(config.absenceRoleId);
        }
        
        const acceptEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Absence acceptée')
            .setDescription(`Absence de ${member} **acceptée** par ${interaction.user}.`)
            .setTimestamp();

        await interaction.reply({ embeds: [acceptEmbed] });

        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('disabled1').setLabel('✅ Acceptée').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId('disabled2').setLabel('❌ Refuser').setStyle(ButtonStyle.Danger).setDisabled(true)
            );

        await interaction.message.edit({ components: [disabledRow] });

        if (ticketChannel) {
            const notifEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Absence acceptée!')
                .setDescription(`Ton absence a été acceptée par ${interaction.user}.`)
                .setTimestamp();
            await ticketChannel.send({ content: `${member}`, embeds: [notifEmbed] });
        }
        
        pendingAbsences.delete(interaction.message.id);
    }

    // ========== SYSTÈME D'ABSENCES - Refuser ==========
    if (interaction.isButton() && interaction.customId === 'decline_absence') {
        if (!interaction.member.roles.cache.has(config.staffRoleId)) {
            return interaction.reply({ content: '❌ Staff uniquement!', ephemeral: true });
        }

        const request = pendingAbsences.get(interaction.message.id);
        if (!request) {
            return interaction.reply({ content: '❌ Demande introuvable!', ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(request.userId);
        const ticketChannel = interaction.guild.channels.cache.get(request.ticketChannelId);
        
        const declineEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Absence refusée')
            .setDescription(`Absence de ${member} **refusée** par ${interaction.user}.`)
            .setTimestamp();

        await interaction.reply({ embeds: [declineEmbed] });

        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('disabled3').setLabel('✅ Accepter').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId('disabled4').setLabel('❌ Refusée').setStyle(ButtonStyle.Danger).setDisabled(true)
            );

        await interaction.message.edit({ components: [disabledRow] });

        if (ticketChannel) {
            const notifEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Absence refusée')
                .setDescription(`Ton absence a été refusée par ${interaction.user}.`)
                .setTimestamp();
            await ticketChannel.send({ content: `${member}`, embeds: [notifEmbed] });
        }

        pendingAbsences.delete(interaction.message.id);
    }

    // ========== SYSTÈME D'ABSENCES - Fermer ==========
    if (interaction.isButton() && interaction.customId === 'close_absence') {
        if (!interaction.channel.name.startsWith('absence-')) {
            return interaction.reply({ content: '❌ Pas un salon d\'absence!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🔒 Fermeture')
            .setDescription('Suppression dans 5 secondes...')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        const userId = Array.from(absenceTickets.entries()).find(([, id]) => id === interaction.channel.id)?.[0];
        if (userId) absenceTickets.delete(userId);

        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    // ========== SYSTÈME TICKETS SPVM - Menu ==========
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
        const ticketType = interaction.values[0];

        // Si c'est une plainte, afficher un formulaire
        if (ticketType === 'plainte_agent') {
            const modal = new ModalBuilder()
                .setCustomId('plainte_form')
                .setTitle('⚠️ Plainte contre un agent');

            const nomAgent = new TextInputBuilder()
                .setCustomId('nom_agent')
                .setLabel('Nom de l\'agent concerné')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: Agent Smith')
                .setRequired(true)
                .setMaxLength(100);

            const dateIncident = new TextInputBuilder()
                .setCustomId('date_incident')
                .setLabel('Date et heure de l\'incident')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 15/01/2026 à 14h30')
                .setRequired(true)
                .setMaxLength(100);

            const description = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Description détaillée des faits')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Décrivez les faits en détail...')
                .setRequired(true)
                .setMaxLength(2000);

            const preuves = new TextInputBuilder()
                .setCustomId('preuves')
                .setLabel('Preuves (si disponibles)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Décrivez les preuves que vous avez (captures, vidéos, témoins...)')
                .setRequired(false)
                .setMaxLength(500);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nomAgent),
                new ActionRowBuilder().addComponents(dateIncident),
                new ActionRowBuilder().addComponents(description),
                new ActionRowBuilder().addComponents(preuves)
            );

            return interaction.showModal(modal);
        }

        // Pour les autres types, créer directement le ticket
        await interaction.deferReply({ ephemeral: true });

        if (spvmTickets.has(interaction.user.id)) {
            const existingId = spvmTickets.get(interaction.user.id);
            const existingChannel = interaction.guild.channels.cache.get(existingId);
            if (existingChannel) {
                return interaction.editReply({ content: `❌ Vous avez déjà un ticket: <#${existingId}>` });
            }
            spvmTickets.delete(interaction.user.id);
        }

        let ticketName, ticketTitle, ticketDescription;

        if (ticketType === 'autre_demande') {
            ticketName = `demande-${interaction.user.username}`;
            ticketTitle = '📝 Autre demande';
            ticketDescription = 
                `**Type:** Autre demande\n\n` +
                `Merci d'avoir ouvert ce ticket. Un membre de l'administration vous assistera.\n\n` +
                `📝 **Veuillez expliquer votre demande.**`;
        } else if (ticketType === 'informations') {
            ticketName = `info-${interaction.user.username}`;
            ticketTitle = 'ℹ️ Informations et renseignements';
            ticketDescription = 
                `**Type:** Informations et renseignements\n\n` +
                `Merci d'avoir ouvert ce ticket. Un membre de l'administration répondra à vos questions.\n\n` +
                `📝 **Veuillez poser vos questions.**`;
        }

        try {
            const ticketChannel = await interaction.guild.channels.create({
                name: ticketName,
                type: ChannelType.GuildText,
                parent: config.ticketCategoryId,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
                    { id: config.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages] }
                ]
            });

            spvmTickets.set(interaction.user.id, ticketChannel.id);

            const ticketEmbed = new EmbedBuilder()
                .setColor('#0066ff')
                .setTitle(ticketTitle)
                .setDescription(`${ticketDescription}\n\n**Citoyen:** ${interaction.user}\n**ID:** ${interaction.user.id}`)
                .setFooter({ text: 'SPVM - Service de Police' })
                .setTimestamp();

            const closeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('🔒 Fermer le ticket')
                        .setStyle(ButtonStyle.Danger)
                );

            await ticketChannel.send({
                content: `${interaction.user} <@&${config.adminRoleId}>`,
                embeds: [ticketEmbed],
                components: [closeButton]
            });

            await interaction.editReply({ content: `✅ Ticket créé: <#${ticketChannel.id}>` });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '❌ Erreur lors de la création.' });
        }
    }

    // ========== SYSTÈME TICKETS SPVM - Formulaire plainte ==========
    if (interaction.isModalSubmit() && interaction.customId === 'plainte_form') {
        await interaction.deferReply({ ephemeral: true });

        if (spvmTickets.has(interaction.user.id)) {
            const existingId = spvmTickets.get(interaction.user.id);
            const existingChannel = interaction.guild.channels.cache.get(existingId);
            if (existingChannel) {
                return interaction.editReply({ content: `❌ Vous avez déjà un ticket: <#${existingId}>` });
            }
            spvmTickets.delete(interaction.user.id);
        }

        const nomAgent = interaction.fields.getTextInputValue('nom_agent');
        const dateIncident = interaction.fields.getTextInputValue('date_incident');
        const description = interaction.fields.getTextInputValue('description');
        const preuves = interaction.fields.getTextInputValue('preuves') || 'Aucune preuve fournie';

        try {
            const ticketChannel = await interaction.guild.channels.create({
                name: `plainte-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: config.ticketCategoryId,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
                    { id: config.adminRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages] }
                ]
            });

            spvmTickets.set(interaction.user.id, ticketChannel.id);

            const ticketEmbed = new EmbedBuilder()
                .setColor('#0066ff')
                .setTitle('⚠️ Plainte contre un agent')
                .setDescription(
                    `**Type:** Plainte contre un agent\n\n` +
                    `**Agent concerné:** ${nomAgent}\n` +
                    `**Date/Heure:** ${dateIncident}\n\n` +
                    `**Description des faits:**\n${description}\n\n` +
                    `**Preuves:**\n${preuves}\n\n` +
                    `**Citoyen:** ${interaction.user}\n` +
                    `**ID:** ${interaction.user.id}`
                )
                .setFooter({ text: 'SPVM - Plainte officielle' })
                .setTimestamp();

            const closeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('🔒 Fermer le ticket')
                        .setStyle(ButtonStyle.Danger)
                );

            await ticketChannel.send({
                content: `${interaction.user} <@&${config.adminRoleId}>`,
                embeds: [ticketEmbed],
                components: [closeButton]
            });

            await interaction.editReply({ content: `✅ Plainte déposée: <#${ticketChannel.id}>` });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '❌ Erreur lors du dépôt de la plainte.' });
        }
    }

    // ========== SYSTÈME TICKETS SPVM - Fermer ==========
    if (interaction.isButton() && interaction.custom
        <function_calls>
<invoke name="artifacts">
<parameter name="command">update</parameter>
<parameter name="id">bot_complet_fusionne</parameter>
<parameter name="new_str">    // ========== SYSTÈME TICKETS SPVM - Fermer ==========
if (interaction.isButton() && interaction.customId === 'close_ticket') {
if (!interaction.channel.name.startsWith('plainte-') &&
!interaction.channel.name.startsWith('demande-') &&
!interaction.channel.name.startsWith('info-')) {
return interaction.reply({ content: '❌ Pas un ticket SPVM!', ephemeral: true });
}
    const closeEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🔒 Fermeture')
        .setDescription(`Suppression dans 5 secondes...\n\nFermé par: ${interaction.user}`)
        .setTimestamp();

    await interaction.reply({ embeds: [closeEmbed] });

    const userId = Array.from(spvmTickets.entries()).find(([, id]) => id === interaction.channel.id)?.[0];
    if (userId) spvmTickets.delete(userId);

    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}
});
// ========================================
// CONNEXION
// ========================================
client.login(config.token);
// ========================================
// SERVEUR WEB POUR RENDER
// ========================================
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
res.send('🚔 Bot SPVM - Système complet en ligne! ✅');
});
app.listen(PORT, () => {
console.log(Serveur web sur port ${PORT});
});</parameter>
<parameter name="old_str">    // ========== SYSTÈME TICKETS SPVM - Fermer ==========
if (interaction.isButton() && interaction.custom</parameter>
