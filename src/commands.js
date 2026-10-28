import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

// Names and descriptions follow the supplied screenshots. Wiring comes later.
export const definitions = [
  ['logsite', 'Open het beveiligde live logdashboard', false, 'logdashboard'],
  ['blacklist', 'Blokkeer een lid voor de serverkanalen of herstel toegang', true, 'blacklist'],
  ['kluis', 'Beheer geld, wapens en voorraad in de kluis', false, 'losstaande kluisregistratie'],
  ['geldreset', 'Zet een gekozen potje of alle potjes op nul', false, 'geldreset voor bevoegde rol'],
  ['geld', 'Beheer zwart en wit geld in de potjes', false, 'geldbeheer voor leiding'],
  ['zeg', 'Plaats tekst namens de bot in dit kanaal', true, 'tekstformulier'],
  ['warn', 'Geef een waarschuwing met optioneel een waarschuwingsrol', true, 'waarschuwing en optionele rol'],
  ['aangenomen', 'Neem iemand aan in de gang', true, 'proefrang, aanvullende rollen en het aangenomen-kanaal'],
  ['afwezig', 'Meld je afwezig (formaat: DD-MM-YYYY)', false, 'afwezigheidsformulier, opslag, goedkeuring en afwezigheidsrol'],
  ['demote', 'Degradeer iemand naar een nieuwe rol', true, 'gangrangen, bevoegdheden en het demotie-kanaal'],
  ['discordinactief', 'Toon hoe lang leden niets hebben gezegd + afwezigheid', true, 'gangleden, activiteitsregistratie en afwezigheden'],
  ['ledenlijst', 'Post of update de automatische gang ledenlijst', true, 'gangrangen en het ledenlijst-kanaal'],
  ['ontslaan', 'Ontsla iemand (haalt alle rollen weg behalve 1)', true, 'de uitzonderingsrol en het ontslag-kanaal'],
  ['promotie', 'Promoveer iemand naar een nieuwe rol', true, 'gangrangen, bevoegdheden en het promotie-kanaal'],
  ['rolaanvraag', 'Vraag een rol aan voor iemand in de gang', false, 'aanvraagbare rollen, beoordelaars en het aanvraag-kanaal'],
  ['sollistatus', 'Forceer update van de sollicitatie-status embeds', true, 'sollicitatiestatussen en bijbehorende berichten'],
  ['ticket-panel', 'Lanceer het ticket panel in dit kanaal', true, 'ticketcategorieën, toegang en het ticketformulier'],
].map(([name, description, adminOnly, pending]) => ({ name, description, adminOnly, pending }));

export const commands = definitions.map(command => {
  const builder = new SlashCommandBuilder()
    .setName(command.name)
    .setDescription(command.description);
  if (command.adminOnly) builder.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
  if (['aangenomen', 'ontslaan', 'promotie', 'demote'].includes(command.name)) {
    builder.addUserOption(option => option.setName('persoon').setDescription('Het ganglid').setRequired(true));
    builder.addStringOption(option => option.setName('reden').setDescription('Toelichting bij deze wijziging').setMaxLength(700));
  }
  if (command.name === 'blacklist') {
    for(const name of ['toevoegen','verwijderen'])builder.addSubcommand(sub=>sub.setName(name).setDescription(name==='toevoegen'?'Neem rollen af en blokkeer alle kanalen':'Hef de kanaalblokkade op zonder rollen terug te zetten').addUserOption(o=>o.setName('persoon').setDescription('Het lid').setRequired(true)));
  }
  if (command.name === 'promotie') builder.addRoleOption(option => option.setName('rang').setDescription('Gewenste hogere gangrang; leeg laten voor één rang omhoog').setRequired(false));
  if (command.name === 'kluis') {
    builder.addStringOption(o=>o.setName('actie').setDescription('Toegevoegd of verwijderd').setRequired(true).addChoices({name:'Toegevoegd aan kluis',value:'add'},{name:'Verwijderd uit kluis',value:'remove'}));
    builder.addStringOption(o=>o.setName('soort').setDescription('Geld, wapens, munitie of voorraad').setRequired(true).addChoices({name:'Zwart geld',value:'zwart'},{name:'Wit geld',value:'wit'},{name:'Wapens',value:'wapen'},{name:'Munitie',value:'munitie'},{name:'Overige voorraad',value:'voorraad'}));
  }
  if (command.name === 'warn') {
    builder.addUserOption(option => option.setName('persoon').setDescription('Het lid dat je waarschuwt').setRequired(true));
    builder.addStringOption(option => option.setName('reden').setDescription('Reden van de waarschuwing').setRequired(true).setMaxLength(700));
    builder.addRoleOption(option => option.setName('rol').setDescription('Optioneel: een waarschuwingsrol toevoegen'));
  }
  return builder.toJSON();
});
