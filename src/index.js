import { existsSync } from 'node:fs';
import { Client, Events, GatewayIntentBits, MessageFlags, ActivityType } from 'discord.js';
import { commands } from './commands.js';
import { readConfig } from './config.js';
import { handleInteraction } from './handler.js';

if (existsSync('.env')) process.loadEnvFile('.env');
let config;
try { config = readConfig(); }
catch (error) { console.error(error.message); process.exit(1); }

// Only the non-privileged Guilds intent is needed for the initial command shell.
const client = new Client({ intents: [GatewayIntentBits.Guilds], allowedMentions: { parse: [] } });
let ready = false;
function stop(code) { client.destroy(); process.exit(code); }
function logError(label, error) {
  // Do not log request bodies, headers, tokens or interaction payloads.
  console.error(`${label} (${error?.code ?? error?.name ?? 'onbekend'})`);
}
client.once(Events.ClientReady, async current => {
  try {
    const guild = await current.guilds.fetch(config.guildId);
    // Own dedicated application: synchronizes exactly the 10 commands in this guild.
    await guild.commands.set(commands);
    ready = true;
    current.user.setPresence({ status: 'online', activities: [{ name: 'La Noche', type: ActivityType.Watching }] });
    console.log(`La Noche online als ${current.user.tag}. ${commands.length} commands geregistreerd.`);
  } catch (error) { logError('Commands registreren mislukt; controleer GUILD_ID en de botuitnodiging', error); stop(1); }
});
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (!ready) {
      await interaction.reply({ content: 'De bot start nog op. Probeer het zo opnieuw.', flags: MessageFlags.Ephemeral });
      return;
    }
    await handleInteraction(interaction, config.guildId);
  } catch (error) {
    logError('Command uitvoeren mislukt', error);
    try {
      const content = 'Er ging iets mis. Probeer het opnieuw of neem contact op met het beheer.';
      if (interaction.deferred) await interaction.editReply({ content, embeds: [] });
      else if (!interaction.replied) await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (replyError) { logError('Foutmelding versturen mislukt', replyError); }
  }
});
client.on(Events.Error, error => logError('Discord-verbinding', error));
process.once('SIGTERM', () => stop(0));
process.once('SIGINT', () => stop(0));
client.login(config.token).catch(error => { logError('Inloggen mislukt; controleer DISCORD_TOKEN', error); stop(1); });
