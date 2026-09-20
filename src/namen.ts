// Namen aus der alten Serienwertung sind einzeilig ("Olli", "Matthias N.").
// Hier werden sie in Vor- und Nachname zerlegt und wieder zusammengesetzt.

export function nameZerlegen(text: string): { vorname: string; nachname: string } {
  const sauber = text.trim().replace(/\s+/g, ' ');
  const teile = sauber.split(' ');
  if (teile.length === 1) return { vorname: sauber, nachname: '' };
  return { vorname: teile.slice(0, -1).join(' '), nachname: teile[teile.length - 1] };
}

export function personName(person: { vorname: string; nachname: string }): string {
  if (!person.nachname) return person.vorname;
  if (!person.vorname) return person.nachname;
  return `${person.nachname}, ${person.vorname}`;
}

export function kuerzelAus(person: { vorname: string; nachname: string }): string {
  const a = person.vorname.charAt(0);
  const b = person.nachname.charAt(0);
  return (a + (b || person.vorname.charAt(1) || '')).toUpperCase();
}
