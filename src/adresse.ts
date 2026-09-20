// Ruecksprungziel fuer Anmelde- und Einladungslinks.
//
// window.location.origin waere nur "https://daucoder2001.github.io" und damit
// ohne den Unterordner, in dem die Anwendung liegt. import.meta.env.BASE_URL
// enthaelt genau diesen Unterordner ("/cuedesk/" nach dem Bauen, "/" beim
// Entwickeln). Bei einer eigenen Domain bleibt der Wert richtig.
export const ANWENDUNGSADRESSE = window.location.origin + import.meta.env.BASE_URL;
