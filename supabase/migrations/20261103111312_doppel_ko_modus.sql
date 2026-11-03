-- Doppel-KO (BLVN-STO Pool 3.3): neuer Turniermodus. Wer verliert, rutscht
-- in die Verliererrunde; erst die zweite Niederlage scheidet aus. Die letzten
-- 4 (ab 24 Spielern 8) spielen im einfachen KO, Platz 3 wird ausgespielt.
-- Baum und Endtabelle rechnet src/doppelko.ts; die Partien stehen in partien
-- mit phase 'dko' und der Spielkennung (g1-1, v2-3, hf1, fin, p3) in gruppe.
--
-- Ein neuer Wert in einem Aufzaehlungstyp muss abgeschlossen sein, bevor er
-- benutzt werden darf. Deshalb steht er allein in dieser Migration; die
-- oeffentliche Ansicht folgt in der naechsten.

alter type public.turnier_modus add value if not exists 'doppel-ko';
