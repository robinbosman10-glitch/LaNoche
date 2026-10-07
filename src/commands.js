import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

// Names and descriptions follow the supplied screenshots. Wiring comes later.
export const definitions = [
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
  return builder.toJSON();
});
