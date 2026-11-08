# CueDesk-Agent

Kleiner Dienst für ein TV-Gerät (z. B. Raspberry Pi). Er fährt das Gerät herunter, wenn in CueDesk **TV-Gerät herunterfahren** geklickt wird. Er braucht nur Python 3 und fragt alle 30 Sekunden bei CueDesk nach.

## Voraussetzungen

- Ein Benutzer `billardagent`, der ohne Passwort `/usr/sbin/shutdown` aufrufen darf (`/etc/sudoers.d`).
- Der Fernseher ist in CueDesk gekoppelt, unter **Tische und Geräte** ist ein **Agent-Schlüssel** erzeugt.

## Einrichten

1. `cuedesk_agent.py` nach `/opt/billard/` kopieren.
2. `/etc/cuedesk-agent.conf` anlegen. Adresse und öffentlicher Schlüssel sind dieselben wie in der Anwendung:

   ```
   SUPABASE_URL=https://<projekt>.supabase.co
   SUPABASE_KEY=<öffentlicher Schlüssel>
   AGENT_SCHLUESSEL=<Agent-Schlüssel aus CueDesk>
   ```

3. Nur für den Dienst lesbar machen:

   ```bash
   sudo chown root:billardagent /etc/cuedesk-agent.conf
   ```

   ```bash
   sudo chmod 640 /etc/cuedesk-agent.conf
   ```

4. Probelauf, der nur meldet und nichts herunterfährt (Ende mit Strg+C):

   ```bash
   sudo -u billardagent python3 /opt/billard/cuedesk_agent.py --probe
   ```

5. `cuedesk-agent.service` nach `/etc/systemd/system/` kopieren und einschalten:

   ```bash
   sudo systemctl daemon-reload
   ```

   ```bash
   sudo systemctl enable --now cuedesk-agent.service
   ```

Protokoll: `journalctl -u cuedesk-agent.service -f`
