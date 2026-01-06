console.log("🔥 INDEX.JS VERSION TEST - 2026");

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const express = require("express");
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
    
    // Pour le système d'absences
    staffRoleId: process.env.STAFF_ROLE_ID,
    absenceRoleId: process.env.ABSENCE_ROLE_ID,
    demandesChannelId: process.env.DEMANDES_CHANNEL_ID,
    absenceCategoryId: null,
    
    // Pour le système de tickets SPVM
    adminRoleId: process.env.ADMIN_ROLE_ID,
    ticketCategoryId: process.env.TICKET_CATEGORY_ID
};

// ========================================
// STOCKAGE DES DONNÉES
// ========================================
// Système d'absences
const absenceTickets = new Map();
const absences = new Map();
const pendingRequests = new Map();

// Système de tickets SPVM
const activeTickets = new Map();

// ========================================
// DÉMARRAGE DU BOT
// ========================================
client.once('ready', () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
    console.log(`📋 Système d'absences: ACTIF`);
    console.log(`🎫 Système de tickets SPVM: ACTIF`);
    
    // Vérifie les absences toutes les heures
    setInterval(checkAbsences, 3600000);
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
            
            // Ajouter le rôle à la date de départ
            if (now >= dateDepart && now < dateRetour) {
                if (!member.roles.cache.has(config.absenceRoleId)) {
                    await member.roles.add(config.absenceRoleId);
                    console.log(`✅ Rôle d'absence ajouté à ${member.user.tag}`);
                    
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
            if (now >= dateRetour) {
                if (member.roles.cache.has(config.absenceRoleId)) {
                    await member.roles.remove(config.absenceRoleId);
                    console.log(`✅ Rôle d'absence retiré de ${member.user.tag}`);
                    
                    if (absence.channelId) {
                        const channel = guild.channels.cache.get(absence.channelId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor('#0066ff')
                                .setTitle('🔵 Absence terminée')
                                .setDescription(`Le rôle d'absence a été automatiquement retiré de ${member}.\n\nBon retour! 👋`)
                                .setTimestamp();
                            await channel.send({ embeds: [embed] });
                        }
                    }
                }
                
                absences.delete(userId);
                console.log(`🗑️ Absence supprimée pour ${member.user.tag}`);
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

    // ========================================
    // COMMANDE: !setup-absence
    // ========================================
    if (message.content === '!setup-absence') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Tu dois être administrateur pour utiliser cette commande!');
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
            .setDescription('Pour signaler une absence, cliquez sur le bouton ci-dessous. Merci de toujours préciser le motif, la date de départ et de retour.\n\n**Format des dates:** JJ/MM/AAAA (ex: 15/01/2026)')
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
        console.log('✅ Panneau d\'absences créé');
    }

    // ========================================
    // COMMANDE: !setup-tickets
    // ========================================
    if (message.content === '!setup-tickets') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Tu dois être administrateur pour utiliser cette commande!');
        }

        const embed = new EmbedBuilder()
            .setColor('#0066ff')
            .setTitle('🎫 Centre d\'Assistance SPVM')
            .setDescription(
                '**Bienvenue au centre d\'assistance du Service de Police de la Ville Métropolitaine.**\n\n' +
                'Pour ouvrir un ticket d\'assistance, veuillez sélectionner le type de demande dans le menu ci-dessous.\n\n' +
                '📌 Un salon privé sera créé pour vous permettre de communiquer avec notre administration en toute confidentialité.'
            )
            .setFooter({ text: 'Service de Police de la Ville Métropolitaine' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_type_select')
            .setPlaceholder('📋 Sélectionnez le type de demande')
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel('Plainte contre un agent')
                    .setDescription('Déposer une plainte concernant le comportement d\'un agent')
                    .setValue('plainte_agent')
                    .setEmoji('⚠️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Autre demande')
                    .setDescription('Toute autre demande non listée ci-dessus')
                    .setValue('autre_demande')
                    .setEmoji('📝'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Informations et renseignements')
                    .setDescription('Obtenir des informations ou des renseignements')
                    .setValue('informations')
                    .setEmoji('ℹ️')
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
        console.log('✅ Panneau de tickets SPVM créé');
    }
});

// ========================================
// GESTION DES INTERACTIONS
// ========================================
client.on('interactionCreate', async interaction => {
    
    // ========================================
    // SYSTÈME D'ABSENCES - Bouton créer absence
    // ========================================
    if (interaction.isButton() && interaction.customId === 'create_absence') {
        const existingTicket = absenceTickets.get(interaction.user.id);
        if (existingTicket) {
            const channel = interaction.guild.channels.cache.get(existingTicket);
            if (channel) {
                return interaction.reply({ 
                    content: `❌ Tu as déjà une absence en cours: <#${existingTicket}>`, 
                    flags: 64
                });
            }
        }

        const modal = new ModalBuilder()
            .setCustomId('absence_form')
            .setTitle('📋 Formulaire d\'absence');

        const motifInput = new TextInputBuilder()
            .setCustomId('motif')
            .setLabel('Motif de l\'absence')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Ex: Maladie, rendez-vous médical, vacances...')
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

        const row1 = new ActionRowBuilder().addComponents(motifInput);
        const row2 = new ActionRowBuilder().addComponents(dateDepartInput);
        const row3 = new ActionRowBuilder().addComponents(dateRetourInput);

        modal.addComponents(row1, row2, row3);

        await interaction.showModal(modal);
    }

    // ========================================
    // SYSTÈME D'ABSENCES - Formulaire soumis
    // ========================================
    if (interaction.isModalSubmit() && interaction.customId === 'absence_form') {
        await interaction.deferReply({ flags: 64 });

        const motif = interaction.fields.getTextInputValue('motif');
        const dateDepartStr = interaction.fields.getTextInputValue('date_depart');
        const dateRetourStr = interaction.fields.getTextInputValue('date_retour');

        const dateDepart = parseDate(dateDepartStr);
        const dateRetour = parseDate(dateRetourStr);

        if (!dateDepart || !dateRetour) {
            return interaction.editReply({ 
                content: '❌ Format de date invalide! Utilise le format JJ/MM/AAAA (ex: 15/01/2026)' 
            });
        }

        if (dateRetour <= dateDepart) {
            return interaction.editReply({ 
                content: '❌ La date de retour doit être après la date de départ!' 
            });
        }

        try {
            const absenceChannel = await interaction.guild.channels.create({
                name: `absence-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: config.absenceCategoryId,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    },
                    {
                        id: config.staffRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    }
                ]
            });

            absenceTickets.set(interaction.user.id, absenceChannel.id);

            const userEmbed = new EmbedBuilder()
                .setColor('#0066ff')
                .setTitle('📋 Absence signalée')
                .setDescription(`**Utilisateur:** ${interaction.user}\n\n**Motif:**\n${motif}\n\n**Date de départ:** ${dateDepartStr}\n**Date de retour:** ${dateRetourStr}\n\n⏳ Le rôle d'absence sera ajouté automatiquement le ${dateDepartStr} et retiré le ${dateRetourStr}.`)
                .setFooter({ text: 'Un membre de l\'administration va bientôt l\'examiner' })
                .setTimestamp();

            const userButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_absence')
                        .setLabel('🔒 Fermer')
                        .setStyle(ButtonStyle.Secondary)
                );

            await absenceChannel.send({ 
                embeds: [userEmbed], 
                components: [userButton] 
            });

            const demandesChannel = interaction.guild.channels.cache.get(config.demandesChannelId);
            
            if (demandesChannel) {
                const staffEmbed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('🔔 Nouvelle demande d\'absence')
                    .setDescription(`**Utilisateur:** ${interaction.user} (${interaction.user.tag})\n**ID:** ${interaction.user.id}\n\n**Motif:**\n${motif}\n\n**Date de départ:** ${dateDepartStr}\n**Date de retour:** ${dateRetourStr}\n\n**Salon:** <#${absenceChannel.id}>`)
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

                pendingRequests.set(staffMessage.id, {
                    userId: interaction.user.id,
                    ticketChannelId: absenceChannel.id,
                    motif: motif,
                    dateDepart: dateDepartStr,
                    dateRetour: dateRetourStr
                });
            }

            await interaction.editReply({ 
                content: `✅ Ton absence a été signalée avec succès: <#${absenceChannel.id}>` 
            });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ 
                content: '❌ Erreur lors de la création de l\'absence!' 
            });
        }
    }

    // ========================================
    // SYSTÈME D'ABSENCES - Accepter
    // ========================================
    if (interaction.isButton() && interaction.customId === 'accept_absence') {
        if (!interaction.member.roles.cache.has(config.staffRoleId)) {
            return interaction.reply({ 
                content: '❌ Seul le staff peut accepter les absences!', 
                ephemeral: true 
            });
        }

        const request = pendingRequests.get(interaction.message.id);
        if (!request) {
            return interaction.reply({ 
                content: '❌ Impossible de trouver la demande!', 
                ephemeral: true 
            });
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
            .setDescription(`L'absence de ${member} a été **acceptée** par ${interaction.user}.\n\n${now >= dateDepart && now < dateRetour ? '🟢 Le rôle d\'absence a été ajouté immédiatement.' : '⏳ Le rôle sera ajouté automatiquement le ' + request.dateDepart + '.'}\n\nLe rôle sera retiré automatiquement le ${request.dateRetour}.`)
            .setTimestamp();

        await interaction.reply({ embeds: [acceptEmbed] });

        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('accept_absence_disabled')
                    .setLabel('✅ Acceptée')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('decline_absence_disabled')
                    .setLabel('❌ Refuser')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

        await interaction.message.edit({ components: [disabledRow] });

        if (ticketChannel) {
            const notifEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Absence acceptée!')
                .setDescription(`Ton absence a été **acceptée** par ${interaction.user}.\n\n${now >= dateDepart && now < dateRetour ? '🟢 Le rôle d\'absence t\'a été attribué.' : '⏳ Le rôle d\'absence te sera ajouté automatiquement le ' + request.dateDepart + '.'}\n\nLe rôle sera retiré automatiquement le ${request.dateRetour}.`)
                .setTimestamp();

            await ticketChannel.send({ content: `${member}`, embeds: [notifEmbed] });
        }
        
        pendingRequests.delete(interaction.message.id);
        console.log(`✅ Absence acceptée pour ${member.user.tag}`);
    }

    // ========================================
    // SYSTÈME D'ABSENCES - Refuser
    // ========================================
    if (interaction.isButton() && interaction.customId === 'decline_absence') {
        if (!interaction.member.roles.cache.has(config.staffRoleId)) {
            return interaction.reply({ 
                content: '❌ Seul le staff peut refuser les absences!', 
                ephemeral: true 
            });
        }

        const request = pendingRequests.get(interaction.message.id);
        if (!request) {
            return interaction.reply({ 
                content: '❌ Impossible de trouver la demande!', 
                ephemeral: true 
            });
        }

        const member = await interaction.guild.members.fetch(request.userId);
        const ticketChannel = interaction.guild.channels.cache.get(request.ticketChannelId);
        
        const declineEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Absence refusée')
            .setDescription(`L'absence de ${member} a été **refusée** par ${interaction.user}.`)
            .setTimestamp();

        await interaction.reply({ embeds: [declineEmbed] });

        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('accept_absence_disabled')
                    .setLabel('✅ Accepter')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('decline_absence_disabled')
                    .setLabel('❌ Refusée')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

        await interaction.message.edit({ components: [disabledRow] });

        if (ticketChannel) {
            const notifEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Absence refusée')
                .setDescription(`Ton absence a été **refusée** par ${interaction.user}.\n\nContacte un administrateur pour plus d'informations.`)
                .setTimestamp();

            await ticketChannel.send({ content: `${member}`, embeds: [notifEmbed] });
        }

        pendingRequests.delete(interaction.message.id);
    }

    // ========================================
    // SYSTÈME D'ABSENCES - Fermer
    // ========================================
    if (interaction.isButton() && interaction.customId === 'close_absence') {
        if (!interaction.channel.name.startsWith('absence-')) {
            return interaction.reply({ 
                content: '❌ Cette commande ne fonctionne que dans un salon d\'absence!', 
                 flags: 64
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🔒 Absence fermée')
            .setDescription('Ce salon sera supprimé dans 5 secondes...')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        const userId = Array.from(absenceTickets.entries()).find(([, channelId]) => channelId === interaction.channel.id)?.[0];
        if (userId) absenceTickets.delete(userId);

        setTimeout(() => {
            interaction.channel.delete();
        }, 5000);
    }

    // ========================================
    // SYSTÈME DE TICKETS SPVM - Menu sélection
    // ========================================
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
        await interaction.deferReply({ ephemeral: true });

        const ticketType = interaction.values[0];
        const userId = interaction.user.id;

        if (activeTickets.has(userId)) {
            const existingChannelId = activeTickets.get(userId);
            const existingChannel = interaction.guild.channels.cache.get(existingChannelId);
            
            if (existingChannel) {
                return interaction.editReply({
                    content: `❌ Vous avez déjà un ticket ouvert: <#${existingChannelId}>`
                });
            } else {
                activeTickets.delete(userId);
            }
        }

        let ticketName, ticketTitle, ticketDescription;

        switch (ticketType) {
            case 'plainte_agent':
                ticketName = `plainte-${interaction.user.username}`;
                ticketTitle = '⚠️ Plainte contre un agent';
                ticketDescription = 
                    `**Type de demande:** Plainte contre un agent\n\n` +
                    `Merci d'avoir ouvert ce ticket. Un membre de l'administration prendra en charge votre plainte dans les plus brefs délais.\n\n` +
                    `📝 **Veuillez décrire votre plainte en détail:**\n` +
                    `• Nom de l'agent concerné\n` +
                    `• Date et heure de l'incident\n` +
                    `• Description détaillée des faits\n` +
                    `• Preuves éventuelles (captures d'écran, vidéos)`;
                break;

            case 'autre_demande':
                ticketName = `demande-${interaction.user.username}`;
                ticketTitle = '📝 Autre demande';
                ticketDescription = 
                    `**Type de demande:** Autre demande\n\n` +
                    `Merci d'avoir ouvert ce ticket. Un membre de l'administration vous assistera dans les plus brefs délais.\n\n` +
                    `📝 **Veuillez expliquer votre demande en détail.**`;
                break;

            case 'informations':
                ticketName = `info-${interaction.user.username}`;
                ticketTitle = 'ℹ️ Informations et renseignements';
                ticketDescription = 
                    `**Type de demande:** Informations et renseignements\n\n` +
                    `Merci d'avoir ouvert ce ticket. Un membre de l'administration répondra à vos questions dans les plus brefs délais.\n\n` +
                    `📝 **Veuillez poser vos questions.**`;
                break;
        }

        try {
            const ticketChannel = await interaction.guild.channels.create({
                name: ticketName,
                type: ChannelType.GuildText,
                parent: config.ticketCategoryId,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles
                        ]
                    },
                    {
                        id: config.adminRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.ManageMessages
                        ]
                    }
                ]
            });

            activeTickets.set(userId, ticketChannel.id);

            const ticketEmbed = new EmbedBuilder()
                .setColor('#0066ff')
                .setTitle(ticketTitle)
                .setDescription(
                    `${ticketDescription}\n\n` +
                    `**Citoyen:** ${interaction.user}\n` +
                    `**ID:** ${interaction.user.id}`
                )
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

            await interaction.editReply({
                content: `✅ Votre ticket a été créé avec succès: <#${ticketChannel.id}>`
            });

            console.log(`✅ Ticket SPVM créé pour ${interaction.user.tag}`);

        } catch (error) {
            console.error('Erreur lors de la création du ticket:', error);
            await interaction.editReply({
                content: '❌ Une erreur est survenue lors de la création du ticket.'
            });
        }
    }

    // ========================================
    // SYSTÈME DE TICKETS SPVM - Fermer
    // ========================================
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        if (!interaction.channel.name.startsWith('plainte-') && 
            !interaction.channel.name.startsWith('demande-') && 
            !interaction.channel.name.startsWith('info-')) {
            return interaction.reply({
                content: '❌ Ce bouton ne fonctionne que dans un salon de ticket!',
                ephemeral: true
            });
        }

        const closeEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🔒 Ticket en cours de fermeture')
            .setDescription(`Ce ticket sera supprimé dans 5 secondes...\n\nFermé par: ${interaction.user}`)
            .setTimestamp();

        await interaction.reply({ embeds: [closeEmbed] });

        const userId = Array.from(activeTickets.entries())
            .find(([, channelId]) => channelId === interaction.channel.id)?.[0];
        
        if (userId) {
            activeTickets.delete(userId);
        }

        setTimeout(() => {
            interaction.channel.delete().catch(console.error);
        }, 5000);
    }
});

// ========================================
// CONNEXION DU BOT
// ========================================
client.login(config.token);

// ========================================
// SERVEUR WEB POUR RENDER
// ========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🚔 Bot SPVM - Système complet en ligne! ✅<br>📋 Absences + 🎫 Tickets');
});

app.listen(PORT, () => {
    console.log(`Serveur web démarré sur le port ${PORT}`);
});
