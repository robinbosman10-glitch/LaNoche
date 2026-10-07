export function readConfig(env = process.env) {
  const token = env.DISCORD_TOKEN?.trim();
  const guildId = env.GUILD_ID?.trim();
  if (!token) throw new Error('DISCORD_TOKEN ontbreekt. Vul deze in bij de hosting-variabelen.');
  if (!/^\d{17,20}$/.test(guildId ?? '')) throw new Error('GUILD_ID ontbreekt of is geen geldig Discord server-ID.');
  return { token, guildId };
}
