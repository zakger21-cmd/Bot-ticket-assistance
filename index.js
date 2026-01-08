const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot SPVM - Système complet en ligne!');
});

app.listen(PORT, () => {
    console.log('Serveur web sur port ' + PORT);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const config = {
    token: process.env.TOKEN,
    staffRoleId: process.env.STAFF_ROLE_ID,
    absenceRoleId: process.env.ABSENCE_ROLE_ID,
    demandesChannelId: process.env.DEMANDES_CHANNEL_ID,
    absenceCategoryId: null,
    adminRoleId: process.env.ADMIN_ROLE_ID,
    ticketCategoryId: process.env.TICKET_CATEGORY_ID
};

const absenceTickets = new Map();
const absences = new Map();
const pendingAbsences = new Map();
const spvmTickets = new Map();

client.on('ready', () => {
    console.log('Bot connecté: ' + client.user.tag);
    console.log('Système absences: ACTIF');
    console.log('Système tickets SPVM: ACTIF');
    setInterval(checkAbsences, 3600000);
    checkAbsences();
});

async function checkAbsences() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    console.log('Vérification des absences...');
    
    for (const [userId, absence] of absences.entries()) {
        try {
            const guild = client.guilds.cache.get(absence.guildId);
            if (!guild) continue;
            
            const member = await guild.members.fetch(userId).catch(() => null);
            if (!member) {
                absences.delete(userId);
                continue;
            }
            
            if (now >= absence.dateDepart && now < absence.dateRetour) {
                if (!member.roles.cache.has(config.absenceRoleId)) {
                    await member.roles.add(config.absenceRoleId);
                    console.log('Rôle ajouté: ' + member.user.tag);
                    
                    if (absence.channelId) {
                        const channel = guild.channels.cache.get(absence.channelId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor('#00ff00')
                                .setTitle('Absence active')
                                .setDescription('Le rôle d\'absence a été automatiquement ajouté à ' + member.toString())
                                .setTimestamp();
                            await channel.send({ embeds: [embed] });
                        }
                    }
                }
            }
            
            if (now >= absence.dateRetour) {
                if (member.roles.cache.has(config.absenceRoleId)) {
                    await member.roles.remove(config.absenceRoleId);
                    console.log('Rôle retiré: ' + member.user.tag);
                    
                    if (absence.channelId) {
                        const channel = guild.channels.cache.get(absence.channelId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor('#0066ff')
                                .setTitle('Absence terminée')
                                .setDescription('Le rôle d\'absence a été retiré de ' + member.toString() + '\n\nBon retour!')
                                .setTimestamp();
                            await channel.send({ embeds: [embed] });
                        }
                    }
                }
                absences.delete(userId);
            }
        } catch (error) {
            console.error('Erreur absence:', error);
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

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    console.log('Message reçu:', message.content, 'de', message.author.tag);

    if (message.content === '!setup-absence') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('Administrateur requis!');
        }

        let category = message.guild.channels.cache.find(c => c.name === 'ABSENCES' && c.type === ChannelType.GuildCategory);
        if (!category) {
            category = await message.guild.channels.create({
                name: 'ABSENCES',
                type: ChannelType.GuildCategory
            });
        }
        config.absenceCategoryId = category.id;

        const embed = new EmbedBuilder()
            .setColor('#0066ff')
            .setTitle('Motiver une absence')
            .setDescription('Pour signaler une absence, cliquez sur le bouton ci-dessous.\n\nFormat des dates: JJ/MM/AAAA (ex: 15/01/2026)')
            .setFooter({ text: 'Système absences - SPVM' })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_absence')
                    .setLabel('Motiver une absence')
                    .setStyle(ButtonStyle.Primary)
            );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    }

    if (message.content === '!setup-tickets') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('Administrateur requis!');
        }

        const embed = new EmbedBuilder()
            .setColor('#0066ff')
            .setTitle('Centre d\'Assistance SPVM')
            .setDescription('Bienvenue au centre d\'assistance du Service de Police de la Ville Métropolitaine.\n\nPour ouvrir un ticket, sélectionnez le type de demande ci-dessous.\n\nUn salon privé sera créé pour communiquer avec notre administration.')
            .setFooter({ text: 'Service de Police de la Ville Métropolitaine' })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_type_select')
            .setPlaceholder('Sélectionnez le type de demande')
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

client.on('interactionCreate', async interaction => {
    
    if (interaction.isButton() && interaction.customId === 'create_absence') {
        if (absenceTickets.has(interaction.user.id)) {
            const existingId = absenceTickets.get(interaction.user.id);
            const existingChannel = interaction.guild.channels.cache.get(existingId);
            if (existingChannel) {
                return interaction.reply({ 
                    content: 'Tu as déjà une absence: <#' + existingId + '>', 
                    flags: 64
                });
            }
            absenceTickets.delete(interaction.user.id);
        }

        const modal = new ModalBuilder()
            .setCustomId('absence_form')
            .setTitle('Formulaire d\'absence');

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

    if (interaction.isModalSubmit() && interaction.customId === 'absence_form') {
        await interaction.deferReply({ flags: 64 });

        const motif = interaction.fields.getTextInputValue('motif');
        const dateDepartStr = interaction.fields.getTextInputValue('date_depart');
        const dateRetourStr = interaction.fields.getTextInputValue('date_retour');

        const dateDepart = parseDate(dateDepartStr);
        const dateRetour = parseDate(dateRetourStr);

        if (!dateDepart || !dateRetour) {
            return interaction.editReply({ content: 'Format de date invalide! Utilise JJ/MM/AAAA' });
        }

        if (dateRetour <= dateDepart) {
            return interaction.editReply({ content: 'La date de retour doit être après la date de départ!' });
        }

        try {
            const absenceChannel = await interaction.guild.channels.create({
                name: 'absence-' + interaction.user.username,
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
                .setTitle('Absence signalée')
                .setDescription('Utilisateur: ' + interaction.user.toString() + '\n\nMotif: ' + motif + '\n\nDate de départ: ' + dateDepartStr + '\nDate de retour: ' + dateRetourStr + '\n\nLe rôle sera ajouté le ' + dateDepartStr + ' et retiré le ' + dateRetourStr + '.')
                .setFooter({ text: 'Un membre de l\'administration va l\'examiner' })
                .setTimestamp();

            const userButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_absence')
                        .setLabel('Fermer')
                        .setStyle(ButtonStyle.Secondary)
                );

            await absenceChannel.send({ embeds: [userEmbed], components: [userButton] });

            const demandesChannel = interaction.guild.channels.cache.get(config.demandesChannelId);
            if (demandesChannel) {
                const staffEmbed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle('Nouvelle demande d\'absence')
                    .setDescription('Utilisateur: ' + interaction.user.toString() + ' (' + interaction.user.tag + ')\nID: ' + interaction.user.id + '\n\nMotif: ' + motif + '\n\nDate départ: ' + dateDepartStr + '\nDate retour: ' + dateRetourStr + '\n\nSalon: <#' + absenceChannel.id + '>')
                    .setFooter({ text: 'Action requise - Administration' })
                    .setTimestamp();

                const staffButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('accept_absence')
                            .setLabel('Accepter')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('decline_absence')
                            .setLabel('Refuser')
                            .setStyle(ButtonStyle.Danger)
                    );

                const staffMessage = await demandesChannel.send({ 
                    content: '<@&' + config.staffRoleId + '>', 
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

            await interaction.editReply({ content: 'Absence signalée: <#' + absenceChannel.id + '>' });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Erreur lors de la création!' });
        }
    }

    if (interaction.isButton() && interaction.customId === 'accept_absence') {
        if (!interaction.member.roles.cache.has(config.staffRoleId)) {
            return interaction.reply({ content: 'Staff uniquement!', flags: 64 });
        }

        const request = pendingAbsences.get(interaction.message.id);
        if (!request) {
            return interaction.reply({ content: 'Demande introuvable!', flags: 64 });
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
            .setTitle('Absence acceptée')
            .setDescription('Absence de ' + member.toString() + ' acceptée par ' + interaction.user.toString() + '.')
            .setTimestamp();

        await interaction.reply({ embeds: [acceptEmbed] });

        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('disabled1').setLabel('Acceptée').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId('disabled2').setLabel('Refuser').setStyle(ButtonStyle.Danger).setDisabled(true)
            );

        await interaction.message.edit({ components: [disabledRow] });

        if (ticketChannel) {
            const notifEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('Absence acceptée!')
                .setDescription('Ton absence a été acceptée par ' + interaction.user.toString() + '.')
                .setTimestamp();
            await ticketChannel.send({ content: member.toString(), embeds: [notifEmbed] });
        }
        
        pendingAbsences.delete(interaction.message.id);
    }

    if (interaction.isButton() && interaction.customId === 'decline_absence') {
        if (!interaction.member.roles.cache.has(config.staffRoleId)) {
            return interaction.reply({ content: 'Staff uniquement!', flags: 64 });
        }

        const request = pendingAbsences.get(interaction.message.id);
        if (!request) {
            return interaction.reply({ content: 'Demande introuvable!', flags: 64 });
        }

        const member = await interaction.guild.members.fetch(request.userId);
        const ticketChannel = interaction.guild.channels.cache.get(request.ticketChannelId);
        
        const declineEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Absence refusée')
            .setDescription('Absence de ' + member.toString() + ' refusée par ' + interaction.user.toString() + '.')
            .setTimestamp();

        await interaction.reply({ embeds: [declineEmbed] });

        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('disabled3').setLabel('Accepter').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId('disabled4').setLabel('Refusée').setStyle(ButtonStyle.Danger).setDisabled(true)
            );

        await interaction.message.edit({ components: [disabledRow] });

        if (ticketChannel) {
            const notifEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Absence refusée')
                .setDescription('Ton absence a été refusée par ' + interaction.user.toString() + '.')
                .setTimestamp();
            await ticketChannel.send({ content: member.toString(), embeds: [notifEmbed] });
        }

        pendingAbsences.delete(interaction.message.id);
    }

    if (interaction.isButton() && interaction.customId === 'close_absence') {
        if (!interaction.channel.name.startsWith('absence-')) {
            return interaction.reply({ content: 'Pas un salon d\'absence!', flags: 64 });
        }

        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Fermeture')
            .setDescription('Suppression dans 5 secondes...')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        const userId = Array.from(absenceTickets.entries()).find(([, id]) => id === interaction.channel.id);
        if (userId) absenceTickets.delete(userId[0]);

        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
        const ticketType = interaction.values[0];

        if (ticketType === 'plainte_agent') {
            const modal = new ModalBuilder()
                .setCustomId('plainte_form')
                .setTitle('Plainte contre un agent');

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
                .setPlaceholder('Décrivez les preuves que vous avez...')
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

        await interaction.deferReply({ flags: 64 });

        if (spvmTickets.has(interaction.user.id)) {
            const existingId = spvmTickets.get(interaction.user.id);
            const existingChannel = interaction.guild.channels.cache.get(existingId);
            if (existingChannel) {
                return interaction.editReply({ content: 'Vous avez déjà un ticket: <#' + existingId + '>' });
            }
            spvmTickets.delete(interaction.user.id);
        }

        let ticketName = '';
        let ticketTitle = '';
        let ticketDescription = '';

        if (ticketType === 'autre_demande') {
            ticketName = 'demande-' + interaction.user.username;
            ticketTitle = 'Autre demande';
            ticketDescription = 'Type: Autre demande\n\nMerci d\'avoir ouvert ce ticket. Un membre de l\'administration vous assistera.\n\nVeuillez expliquer votre demande.';
        } else if (ticketType === 'informations') {
            ticketName = 'info-' + interaction.user.username;
            ticketTitle = 'Informations et renseignements';
            ticketDescription = 'Type: Informations et renseignements\n\nMerci d\'avoir ouvert ce ticket. Un membre de l\'administration répondra à vos questions.\n\nVeuillez poser vos questions.';
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
                .setDescription(ticketDescription + '\n\nCitoyen: ' + interaction.user.toString() + '\nID: ' + interaction.user.id)
                .setFooter({ text: 'SPVM - Service de Police' })
                .setTimestamp();

            const closeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Fermer le ticket')
                        .setStyle(ButtonStyle.Danger)
                );

            await ticketChannel.send({
                content: interaction.user.toString() + ' <@&' + config.adminRoleId + '>',
                embeds: [ticketEmbed],
                components: [closeButton]
            });

            await interaction.editReply({ content: 'Ticket créé: <#' + ticketChannel.id + '>' });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Erreur lors de la création.' });
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'plainte_form') {
        await interaction.deferReply({ flags: 64 });

        if (spvmTickets.has(interaction.user.id)) {
            const existingId = spvmTickets.get(interaction.user.id);
            const existingChannel = interaction.guild.channels.cache.get(existingId);
            if (existingChannel) {
                return interaction.editReply({ content: 'Vous avez déjà un ticket: <#' + existingId + '>' });
            }
            spvmTickets.delete(interaction.user.id);
        }

        const nomAgent = interaction.fields.getTextInputValue('nom_agent');
        const dateIncident = interaction.fields.getTextInputValue('date_incident');
        const description = interaction.fields.getTextInputValue('description');
        const preuves = interaction.fields.getTextInputValue('preuves') || 'Aucune preuve fournie';

        try {
            const ticketChannel = await interaction.guild.channels.create({
                name: 'plainte-' + interaction.user.username,
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
                .setTitle('Plainte contre un agent')
                .setDescription('Type: Plainte contre un agent\n\nAgent concerné: ' + nomAgent + '\nDate/Heure: ' + dateIncident + '\n\nDescription des faits:\n' + description + '\n\nPreuves:\n' + preuves + '\n\nCitoyen: ' + interaction.user.toString() + '\nID: ' + interaction.user.id)
                .setFooter({ text: 'SPVM - Plainte officielle' })
                .setTimestamp();

            const closeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Fermer le ticket')
                        .setStyle(ButtonStyle.Danger)
                );

            await ticketChannel.send({
                content: interaction.user.toString() + ' <@&' + config.adminRoleId + '>',
                embeds: [ticketEmbed],
                components: [closeButton]
            });

            await interaction.editReply({ content: 'Plainte déposée: <#' + ticketChannel.id + '>' });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Erreur lors du dépôt de la plainte.' });
        }
    }

    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        if (!interaction.channel.name.startsWith('plainte-') && 
            !interaction.channel.name.startsWith('demande-') && 
            !interaction.channel.name.startsWith('info-')) {
            return interaction.reply({ content: 'Pas un ticket SPVM!', ephemeral: true });
        }

        const closeEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Fermeture')
            .setDescription('Suppression dans 5 secondes...\n\nFermé par: ' + interaction.user.toString())
            .setTimestamp();

        await interaction.reply({ embeds: [closeEmbed] });

        const userId = Array.from(spvmTickets.entries()).find(([, id]) => id === interaction.channel.id);
        if (userId) spvmTickets.delete(userId[0]);

        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
});

console.log('Tentative de connexion du bot...');
console.log('Token présent:', config.token ? 'OUI' : 'NON');
console.log('Token longueur:', config.token ? config.token.length : 0);

client.login(config.token)
    .then(() => {
        console.log('Login réussi!');
    })
    .catch(error => {
        console.error('ERREUR DE CONNEXION:', error);
        console.error('Code erreur:', error.code);
        console.error('Message:', error.message);
    });
