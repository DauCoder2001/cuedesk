-- Liga-Spieltage: neue Turnierart "liga".
--
-- Eine Begegnung ist ein Turnier mit acht Einzelpartien (Hin- und Rueckrunde
-- je 14.1-endlos, 8-Ball, 9-Ball, 10-Ball). Die Aufstellung steht in
-- turnier_teilnehmer, die Partien in partien mit phase 'hin' oder 'rueck'.
--
-- Ein neuer Wert in einem Aufzaehlungstyp muss abgeschlossen sein, bevor er
-- benutzt werden darf. Deshalb steht er allein in dieser Migration; die
-- Rating-Ansicht folgt in der naechsten.

alter type public.turnier_modus add value if not exists 'liga';
