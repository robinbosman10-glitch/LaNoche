import { syncApplicationLinks } from './applications.js';
import { handleTicketInteraction, handleTicketMessage, syncTicketAccess } from './tickets.js';
import { invalidateMembers } from './member-cache.js';
import { existsSync } from 'node:fs';
import { Client, Events, GatewayIntentBits, MessageFlags, ActivityType, REST, Routes, ApplicationFlagsBitField } from 'discord.js';
import { commands } from './commands.js';
import { readConfig } from './config.js';
import { handleInteraction } from './handler.js';
import { createStore } from './store.js';
import { updateMemberlist } from './memberlist.js';
import { createLiveRefresh } from './live-list.js';
import { settings } from './settings.js';

if (existsSync('.env')) process.loadEnvFile('.env');
let config;
try { config = readConfig(); }
catch (error) { console.error(error.message); process.exit(1); }

const store = createStore(process.env.DATA_DIR || './data');
const intents=[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages];
try {
  const application=await new REST({version:'10'}).setToken(config.token).get(Routes.currentApplication());
  const flags=new ApplicationFlagsBitField(application.flags ?? 0);
  if(flags.any([ApplicationFlagsBitField.Flags.GatewayMessageContent,ApplicationFlagsBitField.Flags.GatewayMessageContentLimited])) intents.push(GatewayIntentBits.MessageContent);
  else console.warn('$delete staat uit: schakel Message Content Intent in de Developer Portal in en herstart de bot.');
} catch { console.warn('Message Content Intent kon niet worden gecontroleerd; $delete is voorlopig uitgeschakeld.'); }
const client = new Client({ intents, allowedMentions: { parse: [] } });
let ready = false;
let refreshTimer;
let liveRefresh;
function stop(code) { clearInterval(refreshTimer); liveRefresh?.stop(); client.destroy(); store.close(); process.exit(code); }
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
    syncApplicationLinks(guild,store).then(result=>{
      console.log(`Sollicitatieknoppen bijgewerkt: ${result.updated}; mislukt: ${result.failed}.`);
    }).catch(error=>logError('Sollicitatieknoppen bijwerken mislukt',error));
    syncTicketAccess(guild,store).then(result=>{
      console.log(`Tickettoegang bijgewerkt: ${result.updated}; mislukt: ${result.failed}.`);
    }).catch(error=>logError('Tickettoegang bijwerken mislukt',error));
    liveRefresh = createLiveRefresh(() => updateMemberlist(guild,store), error=>logError('Ledenlijst bijwerken mislukt',error));
    liveRefresh.schedule();
    refreshTimer = setInterval(() => liveRefresh.schedule(), 5 * 60 * 1000);
    refreshTimer.unref();
    current.user.setPresence({ status: 'online', activities: [{ name: 'La Noche', type: ActivityType.Watching }] });
    console.log(`La Noche online als ${current.user.tag}. ${commands.length} commands geregistreerd.`);
  } catch (error) { logError('Commands registreren mislukt; controleer GUILD_ID en de botuitnodiging', error); stop(1); }
});
client.on(Events.InteractionCreate, async interaction => {
  const ticket = (interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('ln-ticket:');
  if (!ticket && !interaction.isChatInputCommand() && !(interaction.isModalSubmit() && interaction.customId === 'lanoche:afwezig')) return;
  try {
    if (!ready) {
      await interaction.reply({ content: 'De bot start nog op. Probeer het zo opnieuw.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (ticket) await handleTicketInteraction(interaction, config.guildId, store);
    else await handleInteraction(interaction, config.guildId, store);
  } catch (error) {
    logError('Command uitvoeren mislukt', error);
    try {
      const content = 'Er ging iets mis. Probeer het opnieuw of neem contact op met het beheer.';
      if (interaction.deferred) await interaction.editReply({ content, embeds: [] });
      else if (!interaction.replied) await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (replyError) { logError('Foutmelding versturen mislukt', replyError); }
  }
});
client.on(Events.ShardReady, shardId => {
  for (const guild of client.guilds.cache.values()) {
    if (guild.shardId === shardId) invalidateMembers(guild);
  }
  liveRefresh?.schedule();
});
function relevantMember(member) { return member.guild.id === config.guildId && settings.ranks.some(id=>member.roles.cache.has(id)); }
client.on(Events.GuildMemberUpdate, (before, after) => {
  if (relevantMember(before) || relevantMember(after)) liveRefresh?.schedule();
});
client.on(Events.GuildMemberAdd, member => { if (member.guild.id===config.guildId) liveRefresh?.schedule(); });
client.on(Events.GuildMemberRemove, member => { if (member.guild.id===config.guildId) liveRefresh?.schedule(); });
client.on(Events.MessageCreate, async message => {
  if (message.guildId !== config.guildId || message.author.bot || message.webhookId) return;
  if (ready && intents.includes(GatewayIntentBits.MessageContent)) {
    try { await handleTicketMessage(message,config.guildId,store); }
    catch(error) { logError('Ticket verwijderen mislukt',error); }
  }
  try { store.activity(message.guildId, message.author.id, message.createdTimestamp); }
  catch (error) { logError('Activiteit opslaan mislukt', error); }
});
client.on(Events.Error, error => logError('Discord-verbinding', error));
process.once('SIGTERM', () => stop(0));
process.once('SIGINT', () => stop(0));
client.login(config.token).catch(error => { logError('Inloggen mislukt; controleer DISCORD_TOKEN', error); stop(1); });
