import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { fileURLToPath } from 'node:url';
const asset = name => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
export function branded(title, description, fields = [], banner = 'banner.png') {
  const embed = new EmbedBuilder().setColor(0xff7900)
    .setAuthor({ name: 'LA NOCHE  •  OFFICIEEL', iconURL: 'attachment://logo.png' })
    .setThumbnail('attachment://logo.png').setTitle(title).setDescription(description)
    .setImage(`attachment://${banner}`).setFooter({ text: 'LA NOCHE  •  Loyaliteit. Respect. Familie.' }).setTimestamp();
  if (fields.length) embed.addFields(fields);
  return { embeds: [embed], files: [new AttachmentBuilder(asset('logo.png')), new AttachmentBuilder(asset(banner), { name: banner })], allowedMentions: { parse: [] } };
}
export const field = (name, value, inline = true) => ({ name, value: String(value), inline });
