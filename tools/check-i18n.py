#!/usr/bin/env python3
"""Findet deutschen Text in den Folien, der keine Übersetzung tragen kann.

Die Folien sind deutsch geschrieben; die anderen drei Sprachen kommen aus
Wörterbüchern, die über `data-i18n` greifen. Ein Element ohne diesen Haken bleibt
deshalb in **jeder** Sprache deutsch — und genau so standen «Die Runde» und
«2 · Die Runde» am 04.09.2026 in der englischen, französischen und italienischen
Fassung, mitten in einer Session.

    python3 tools/check-i18n.py            # Exit 1, wenn etwas gefunden wird

Vor jeder Session laufen lassen, und nach jeder Folienänderung.
"""
import re, sys, pathlib
from html.parser import HTMLParser

# Wörter, die in einer nicht-deutschen Fassung nichts verloren haben. Bewusst kurz
# gehalten: lieber wenige sichere Treffer als eine Liste, die jeder Eigenname auslöst.
GERMAN = re.compile(
    r'\b(die|der|das|dem|den|und|mit|für|von|zum|zur|nicht|ist|sind|wird|werden|'
    r'Runde|Puffer|Übergang|Frage|Fragen|Regeln|Ablauf|Ziel|Quelle|Beispiel|'
    r'Sterne|Tafel|Karte|dann|beim|einer|eines|auch|aber|noch|jede|jeder)\b', re.I)


class Scan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack, self.hits = [], []

    def handle_starttag(self, tag, attrs):
        self.stack.append(("data-i18n" in dict(attrs), tag))

    def handle_startendtag(self, tag, attrs):
        pass                                   # selbstschliessend: kein Textkind

    def handle_endtag(self, tag):
        if self.stack:
            self.stack.pop()

    def handle_data(self, data):
        t = data.strip()
        if len(t) < 3 or not GERMAN.search(t):
            return
        if any(has for has, _ in self.stack):  # ein Vorfahr ist übersetzbar
            return
        if self.stack and self.stack[-1][1] in ("script", "style"):
            return
        self.hits.append((self.getpos()[0], t[:78]))


bad = 0
for f in sorted(pathlib.Path("slides").glob("*.html")):
    s = Scan()
    s.feed(f.read_text(encoding="utf-8"))
    seen = set()
    for ln, t in s.hits:
        if t in seen:
            continue
        seen.add(t)
        print(f"🔴 {f}:{ln}  deutsch ohne data-i18n — «{t}»")
        bad += 1

print("Keine Sprachmischung gefunden." if not bad else
      f"\n{bad} Stelle(n) bleiben in jeder Sprache deutsch.")
sys.exit(1 if bad else 0)
