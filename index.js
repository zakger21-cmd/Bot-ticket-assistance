const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ========================================
// CONFIGURATION - MODIFIE CES VALEURS
// ========================================
const config = {
    token: process.env.TOKEN, // Token du bot (dans les variables d'environnement)
    adminRoleId: process.env.ADMIN_ROLE_ID, // ID du rôle administration (ex: "1234567890123456789")
    ticketCategoryId: process.env.TICKET_CATEGORY_ID // ID de la catégorie où créer les tickets
};

// Stockage des tickets actifs
const activeTickets = new Map(); // userId -> channelId

// ========================================
// DÉMARRAGE DU BOT
// ========================================
client.once('ready', () => {
    console.log(`✅ Bot SPVM connecté en tant que ${client.user.tag}`);
});

// ========================================
// COMMANDE POUR CRÉER LE PANNEAU DE TICKETS
// ========================================
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Commande: !setup-tickets
    if (message.content === '!setup-tickets') {
        // Vérifie que l'utilisateur est admin
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Tu dois être administrateur pour utiliser cette commande!');
        }

        // Créer l'embed professionnel
        const embed = new EmbedBuilder()
            .setColor('#0066ff') // Couleur bleue SPVM
            .setTitle('🎫 Centre d\'Assistance SPVM')
            .setDescription(
                '**Bienvenue au centre d\'assistance du Service de Police de la Ville Métropolitaine.**\n\n' +
                'Pour ouvrir un ticket d\'assistance, veuillez sélectionner le type de demande dans le menu ci-dessous.\n\n' +
                '📌 Un salon privé sera créé pour vous permettre de communiquer avec notre administration en toute confidentialité.'
            )
            .setFooter({ text: 'Service de Police de la Ville Métropolitaine' })
            .setTimestamp();

        // Créer le menu de sélection
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

        // Envoyer le message avec le menu
        await message.channel.send({ embeds: [embed], components: [row] });
        
        // Supprimer la commande de l'admin
        await message.delete().catch(() => {});
    }
});

// ========================================
// GESTION DES INTERACTIONS (MENU + BOUTONS)
// ========================================
client.on('interactionCreate', async interaction => {
    
    // ========================================
    // SÉLECTION DU TYPE DE TICKET
    // ========================================
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
        await interaction.deferReply({ ephemeral: true });

        const ticketType = interaction.values[0];
        const userId = interaction.user.id;

        // Vérifier si l'utilisateur a déjà un ticket ouvert
        if (activeTickets.has(userId)) {
            const existingChannelId = activeTickets.get(userId);
            const existingChannel = interaction.guild.channels.cache.get(existingChannelId);
            
            if (existingChannel) {
                return interaction.editReply({
                    content: `❌ Vous avez déjà un ticket ouvert: <#${existingChannelId}>`
                });
            } else {
                // Le salon n'existe plus, on peut supprimer l'entrée
                activeTickets.delete(userId);
            }
        }

        // Définir les informations selon le type de ticket
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
            // Créer le salon du ticket
            const ticketChannel = await interaction.guild.channels.create({
                name: ticketName,
                type: ChannelType.GuildText,
                parent: config.ticketCategoryId, // Catégorie configurée
                permissionOverwrites: [
                    {
                        // Cacher pour @everyone
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        // Visible pour l'utilisateur
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles
                        ]
                    },
                    {
                        // Visible pour l'administration
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

            // Enregistrer le ticket
            activeTickets.set(userId, ticketChannel.id);

            // Message dans le ticket
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

            // Bouton pour fermer le ticket
            const closeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('🔒 Fermer le ticket')
                        .setStyle(ButtonStyle.Danger)
                );

            // Envoyer le message dans le ticket
            await ticketChannel.send({
                content: `${interaction.user} <@&${config.adminRoleId}>`,
                embeds: [ticketEmbed],
                components: [closeButton]
            });

            // Confirmer à l'utilisateur
            await interaction.editReply({
                content: `✅ Votre ticket a été créé avec succès: <#${ticketChannel.id}>`
            });

        } catch (error) {
            console.error('Erreur lors de la création du ticket:', error);
            await interaction.editReply({
                content: '❌ Une erreur est survenue lors de la création du ticket. Veuillez réessayer.'
            });
        }
    }

    // ========================================
    // FERMETURE DU TICKET
    // ========================================
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        // Vérifier que c'est bien un salon de ticket
        if (!interaction.channel.name.startsWith('plainte-') && 
            !interaction.channel.name.startsWith('demande-') && 
            !interaction.channel.name.startsWith('info-')) {
            return interaction.reply({
                content: '❌ Ce bouton ne fonctionne que dans un salon de ticket!',
                ephemeral: true
            });
        }

        // Message de confirmation
        const closeEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🔒 Ticket en cours de fermeture')
            .setDescription(`Ce ticket sera supprimé dans 5 secondes...\n\nFermé par: ${interaction.user}`)
            .setTimestamp();

        await interaction.reply({ embeds: [closeEmbed] });

        // Supprimer le ticket de la liste active
        const userId = Array.from(activeTickets.entries())
            .find(([, channelId]) => channelId === interaction.channel.id)?.[0];
        
        if (userId) {
            activeTickets.delete(userId);
        }

        // Supprimer le salon après 5 secondes
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
// SERVEUR WEB POUR RENDER (OBLIGATOIRE)
// ========================================
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🚔 Bot SPVM - Système de Tickets en ligne! ✅');
});

app.listen(PORT, () => {
    console.log(`Serveur web démarré sur le port ${PORT}`);
});
