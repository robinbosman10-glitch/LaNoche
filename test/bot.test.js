import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags, PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { commands } from '../src/commands.js';
import { readConfig } from '../src/config.js';
import { handleInteraction } from '../src/handler.js';

test('all ten screenshot commands serialize with safe default permissions', () => {
  assert.deepEqual(commands.map(c => c.name).sort(), ['aangenomen','afwezig','demote','discordinactief','ledenlijst','ontslaan','promotie','rolaanvraag','sollistatus','ticket-panel'].sort());
  for (const command of commands) {
    assert.ok(command.description.length <= 100);
    if (!['afwezig','rolaanvraag'].includes(command.name)) assert.equal(command.default_member_permissions, '8');
  }
});
test('missing credentials fail before connecting', () => {
  assert.throws(() => readConfig({}), /DISCORD_TOKEN/);
  assert.throws(() => readConfig({ DISCORD_TOKEN: 'test' }), /GUILD_ID/);
});
function interaction(name, admin = false, guildId = '123456789012345678') {
  return { commandName: name, guildId, isChatInputCommand: () => true, inGuild: () => Boolean(guildId), memberPermissions: new PermissionsBitField(admin ? PermissionFlagsBits.Administrator : 0n), reply: async payload => payload };
}
const guild = '123456789012345678';
test('privileged command rejects ordinary members', async () => {
  const result = await handleInteraction(interaction('ontslaan'), guild);
  assert.match(result.content, /beheerdersrechten/);
  assert.equal(result.flags, MessageFlags.Ephemeral);
});
test('all commands honestly report pending setup to authorized users', async () => {
  for (const command of commands) {
    const result = await handleInteraction(interaction(command.name, true), guild);
    assert.match(result.embeds[0].toJSON().title, /Nog niet ingesteld/);
    assert.equal(result.flags, MessageFlags.Ephemeral);
  }
});
test('afwezig is accessible without admin, and wrong guilds are rejected', async () => {
  assert.ok((await handleInteraction(interaction('afwezig'), guild)).embeds);
  assert.match((await handleInteraction(interaction('afwezig', false, null), guild)).content, /alleen beschikbaar/);
  assert.match((await handleInteraction(interaction('afwezig', true, '999999999999999999'), guild)).content, /alleen beschikbaar/);
});
