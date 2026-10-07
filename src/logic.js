import { DateTime } from 'luxon';
export class UserError extends Error {}
export function absenceDates(startText, endText, now = Date.now()) {
  const parse = text => {
    if (!/^\d{2}-\d{2}-\d{4}$/.test(text)) throw new UserError('Gebruik datums als DD-MM-YYYY.');
    const date = DateTime.fromFormat(text, 'dd-MM-yyyy', { zone: 'Europe/Amsterdam' });
    if (!date.isValid || date.toFormat('dd-MM-yyyy') !== text) throw new UserError('Deze datum bestaat niet.');
    return date;
  };
  const start = parse(startText).startOf('day');
  const end = parse(endText).endOf('day');
  if (start.startOf('day') < DateTime.fromMillis(now, {zone:'Europe/Amsterdam'}).startOf('day')) throw new UserError('De begindatum mag niet in het verleden liggen.');
  if (end < start) throw new UserError('De einddatum mag niet vóór de begindatum liggen.');
  return { start: start.toMillis(), end: end.toMillis() };
}
export function nextRank(ranks, currentIds, direction) {
  if (ranks.length < 2) throw new UserError('De rangvolgorde moet nog worden ingesteld. Stuur de gangrangen van laag naar hoog.');
  const held = ranks.filter(id => currentIds.includes(id));
  if (held.length !== 1) throw new UserError('Dit lid moet precies één ingestelde gangrang hebben.');
  const next = ranks[ranks.indexOf(held[0]) + direction];
  if (!next) throw new UserError(direction > 0 ? 'Dit lid heeft al de hoogste gangrang.' : 'Dit lid heeft al de laagste gangrang.');
  return { from: held[0], to: next };
}
export function removableRoles(roles, everyoneId, keepId) {
  const removable = roles.filter(r => r.id !== everyoneId && r.id !== keepId && !r.managed);
  if (removable.some(r => !r.editable)) throw new UserError('Ik kan niet alle rollen verwijderen. Zet mijn botrol boven de rollen van dit lid. Er is niets gewijzigd.');
  return removable;
}
