import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags, PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { commands } from '../src/commands.js';
import { readConfig } from '../src/config.js';
import { handleInteraction } from '../src/handler.js';

test('all commands serialize with safe default permissions', () => {
  assert.deepEqual(commands.map(c => c.name).sort(), ['logsite','blacklist','aangenomen','afwezig','demote','discordinactief','ledenlijst','ontslaan','promotie','rolaanvraag','sollistatus','ticket-panel','warn','zeg','geld','geldreset','kluis'].sort());
  for (const command of commands) {
    assert.ok(command.description.length <= 100);
    if (!['logsite','afwezig','rolaanvraag','geld','geldreset','kluis'].includes(command.name)) assert.equal(command.default_member_permissions, '8');
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
test('afwezig opens a form and wrong guilds are rejected', async () => {
  const i=interaction('afwezig'); i.showModal=async modal=>modal.toJSON();
  const result=await handleInteraction(i,guild);
  assert.equal(result.custom_id,'lanoche:afwezig');
  assert.equal(result.components.length,3);
  assert.match((await handleInteraction(interaction('afwezig',false,null),guild)).content,/alleen beschikbaar/);
  assert.match((await handleInteraction(interaction('afwezig',true,'999999999999999999'),guild)).content,/alleen beschikbaar/);
});

test('zeg opens paragraph form without first deferring',async()=>{
 const i=interaction('zeg',true);i.showModal=async m=>m.toJSON();
 const form=await handleInteraction(i,guild);
 assert.equal(form.custom_id,'lanoche:zeg');
 assert.equal(form.components[0].components[0].style,2);
 assert.equal(form.components[0].components[0].max_length,2000);
});
test('zeg submission preserves lists in current channel and rechecks authorization',async()=>{
 const i=interaction('zeg',true);let sent;let deferred=false;
 i.isChatInputCommand=()=>false;i.isModalSubmit=()=>true;i.customId='lanoche:zeg';
 i.channelId='current';i.fields={getTextInputValue:()=>'- Eerste\n- Tweede @everyone'};
 i.deferReply=async()=>{deferred=true;};i.editReply=async p=>p;
 i.guild={members:{me:{}},channels:{fetch:async id=>{assert.equal(id,'current');return {
 isThread:()=>false,permissionsFor:()=>new PermissionsBitField(PermissionFlagsBits.Administrator),
 send:async p=>{sent=p;return {url:'message-link'};}};}}};
 const result=await handleInteraction(i,guild);
 assert.equal(deferred,true);assert.equal(sent.content,'- Eerste\n- Tweede @everyone');
 assert.deepEqual(sent.allowedMentions,{parse:[]});assert.match(result.content,/geplaatst/);
 sent=null;i.memberPermissions=new PermissionsBitField();
 assert.match((await handleInteraction(i,guild)).content,/beheerdersrechten/);assert.equal(sent,null);
 i.memberPermissions=new PermissionsBitField(PermissionFlagsBits.Administrator);
 i.fields.getTextInputValue=()=> '   \n';
 assert.match((await handleInteraction(i,guild)).content,/Vul tekst/);assert.equal(sent,null);
});
