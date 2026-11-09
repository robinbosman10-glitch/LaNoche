import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { settings } from './settings.js';
const asset = name => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
export const brandLogo = (logo = 'logo.png') => settings.branding?.logoUrl || `attachment://${logo}`;
export const brandBanner = (banner = 'banner.png') => settings.branding?.bannerUrl || `attachment://${banner}`;
export function branded(title, description, fields = [], banner = 'banner.png', logo = 'logo.png') {
  const brand = settings.branding || {};
  const embed = new EmbedBuilder().setColor(brand.color || 0xff7900)
    .setAuthor({ name: brand.author || 'LA NOCHE  •  OFFICIEEL', iconURL: brandLogo(logo) })
    .setThumbnail(brandLogo(logo)).setTitle(title).setDescription(description)
    .setImage(brandBanner(banner)).setFooter({ text: brand.footer || 'LA NOCHE  •  Loyaliteit. Respect. Familie.' }).setTimestamp();
  if (fields.length) embed.addFields(fields);
  const files=[];
  if(!brand.logoUrl) files.push(new AttachmentBuilder(asset(logo), { name: logo }));
  if(!brand.bannerUrl) files.push(new AttachmentBuilder(asset(banner), { name: banner }));
  return { embeds: [embed], files, allowedMentions: { parse: [] } };
}
export const field = (name, value, inline = true) => ({ name, value: String(value), inline });
