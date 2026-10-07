import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { definitions } from './commands.js';

export async function handleInteraction(interaction, guildId) {
  if (!interaction.isChatInputCommand()) return;
  const reply = payload => interaction.reply({ ...payload, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  if (!interaction.inGuild() || interaction.guildId !== guildId) {
    return reply({ content: 'Deze bot is alleen beschikbaar in de ingestelde La Noche-server.' });
  }
  const command = definitions.find(item => item.name === interaction.commandName);
  if (!command) return reply({ content: 'Dit command bestaat niet in deze versie van La Noche.' });
  if (command.adminOnly && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return reply({ content: 'Je hebt beheerdersrechten nodig om dit command te gebruiken.' });
  }
  // Intentionally no role changes or successful-action claims before setup.
  const embed = new EmbedBuilder()
    .setColor(0x8b1435)
    .setAuthor({ name: 'La Noche' })
    .setTitle(`/${command.name} • Nog niet ingesteld`)
    .setDescription('Dit command staat klaar in de nieuwe bot. De werking en koppelingen worden later toegevoegd.')
    .addFields({ name: 'Nog te koppelen', value: command.pending })
    .setFooter({ text: 'La Noche • Bot in voorbereiding' });
  return reply({ embeds: [embed] });
}
