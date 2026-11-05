// Rueckweg auf den Rechtsseiten (Impressum, Datenschutz, Nutzungsbedingungen,
// Auftragsverarbeitung) und dem Kontaktformular.
//
// Die Seiten werden auch von der Website www.cuedesk.de aus verlinkt. Kommt man
// von dort, heisst der Link oben "← zurück zur Website" und fuehrt dorthin
// zurueck, auch nach dem Wechsel zwischen den Rechtsseiten (Merker in der
// sessionStorage). Kommt man aus der Anwendung, bleibt der Link unveraendert.
// Der Link muss das Attribut data-rueckweg tragen.

const WEBSITE = 'https://www.cuedesk.de/';
const MERKER = 'cuedesk-von-website';
const RECHTSSEITEN = /\/(impressum|datenschutz|nutzungsbedingungen|auftragsverarbeitung|kontakt)\.html$/;

function herkunft(): URL | null {
  try {
    return document.referrer ? new URL(document.referrer) : null;
  } catch {
    return null;
  }
}

const von = herkunft();
const direktVonWebsite = von !== null && /^(www\.)?cuedesk\.de$/.test(von.hostname);

let vonWebsite = direktVonWebsite;
try {
  if (direktVonWebsite) {
    sessionStorage.setItem(MERKER, '1');
  } else if (von && von.origin === location.origin && !RECHTSSEITEN.test(von.pathname)) {
    // Aus der Anwendung selbst gekommen: Merker vergessen.
    sessionStorage.removeItem(MERKER);
  }
  vonWebsite = sessionStorage.getItem(MERKER) === '1';
} catch {
  // Ohne sessionStorage zaehlt nur die direkte Herkunft.
}

const link = document.querySelector<HTMLAnchorElement>('a[data-rueckweg]');
if (link && vonWebsite) {
  link.textContent = '← zurück zur Website';
  link.href = direktVonWebsite && von ? von.href : WEBSITE;
  if (direktVonWebsite) {
    // Genau auf die Seite zurueck, von der man kam (der Browser verraet
    // fremden Seiten meist nur die Adresse der Website, nicht die Unterseite).
    link.addEventListener('click', (e) => {
      if (history.length > 1) {
        e.preventDefault();
        history.back();
      }
    });
  }
}
