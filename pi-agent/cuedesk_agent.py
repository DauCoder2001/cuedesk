#!/usr/bin/env python3
# CueDesk-Agent fuer ein TV-Geraet (z. B. Raspberry Pi): fragt alle 30 Sekunden
# bei CueDesk nach (Datenbankfunktion agent_abfragen) und faehrt das Geraet
# herunter, wenn die Turnierleitung darum gebeten hat. Eine Webseite darf das
# nicht, deshalb dieser kleine Dienst. Kommt ohne Zusatzpakete aus.
#
# Einrichtung: pi-agent/README.md

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

VERSION = '1.0.0'
KONFIG = '/etc/cuedesk-agent.conf'
PAUSE_S = 30
PFLICHT = ('SUPABASE_URL', 'SUPABASE_KEY', 'AGENT_SCHLUESSEL')


def melden(text):
    print(text, flush=True)


def konfig_lesen(pfad):
    werte = {}
    try:
        with open(pfad, encoding='utf-8') as datei:
            for zeile in datei:
                zeile = zeile.strip()
                if zeile and not zeile.startswith('#') and '=' in zeile:
                    name, wert = zeile.split('=', 1)
                    werte[name.strip()] = wert.strip()
    except OSError as fehler:
        sys.exit(f'Konfiguration nicht lesbar: {pfad} ({fehler.strerror})')
    fehlend = [name for name in PFLICHT if not werte.get(name)]
    if fehlend:
        sys.exit(f'In {pfad} fehlt: {", ".join(fehlend)}')
    return werte


# True nur bei einer gueltigen Bitte. Netz- und Serverfehler gelten als
# "keine Bitte", der naechste Durchlauf versucht es wieder (etwa wenn beim
# Start die Uhrzeit oder das WLAN noch fehlt).
def abfragen(konfig):
    anfrage = urllib.request.Request(
        konfig['SUPABASE_URL'].rstrip('/') + '/rest/v1/rpc/agent_abfragen',
        data=json.dumps({'p_schluessel': konfig['AGENT_SCHLUESSEL']}).encode('utf-8'),
        headers={
            'apikey': konfig['SUPABASE_KEY'],
            'Authorization': 'Bearer ' + konfig['SUPABASE_KEY'],
            'Content-Type': 'application/json'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(anfrage, timeout=15) as antwort:
            return json.load(antwort) is True
    except urllib.error.HTTPError as fehler:
        melden(f'CueDesk antwortet mit Fehler {fehler.code}.')
    except (OSError, ValueError) as fehler:
        melden(f'CueDesk nicht erreichbar: {fehler}')
    return False


def herunterfahren():
    ergebnis = subprocess.run(['sudo', '-n', '/usr/sbin/shutdown', '-h', 'now'], check=False)
    if ergebnis.returncode != 0:
        melden(f'Herunterfahren fehlgeschlagen (Rückgabewert {ergebnis.returncode}).')


def main():
    teile = argparse.ArgumentParser(description='CueDesk-Agent für ein TV-Gerät')
    teile.add_argument('--konfig', default=KONFIG, help=f'Konfigurationsdatei (Vorgabe: {KONFIG})')
    teile.add_argument('--probe', action='store_true', help='Bitte nur melden, nicht herunterfahren')
    teile.add_argument('--version', action='version', version=f'CueDesk-Agent {VERSION}')
    argumente = teile.parse_args()

    konfig = konfig_lesen(argumente.konfig)
    melden(f'CueDesk-Agent {VERSION} läuft' + (' (Probelauf, fährt nicht herunter)' if argumente.probe else '') + '.')
    while True:
        if abfragen(konfig):
            if argumente.probe:
                melden('Bitte um Herunterfahren erhalten (Probelauf: nicht ausgeführt).')
            else:
                melden('Bitte um Herunterfahren erhalten, fahre herunter.')
                herunterfahren()
        time.sleep(PAUSE_S)


if __name__ == '__main__':
    main()
