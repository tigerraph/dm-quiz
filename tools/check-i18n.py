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


def missing_keys(src):
    """Schlüssel, die im Markup stehen, aber in einem Wörterbuch fehlen.

    Der Haken oben findet nur Text *ohne* `data-i18n`. Ein Element mit Haken,
    dessen Schlüssel in einem der Wörterbücher fehlt, ist genauso deutsch —
    `if (v) el.innerHTML = v` lässt das Markup dann einfach stehen. Genau so
    stand «Regie aufs Handy» am 04.09.2026 in der französischen Fassung, sechs
    Wochen nachdem EN und IT die Zeile bekommen hatten.

    Gesucht wird pro Sprachblock nach «schluessel:» — mit oder ohne
    Anführungszeichen, die Folien schreiben 's1.lede': und die Topic Card gov:.
    Die Schlüssel werden nicht aus dem JavaScript geparst, sondern aus dem
    Markup genommen und im Block nachgeschlagen. Das kommt ohne JS-Parser aus
    und kann keine Zeichenkette im Wert für einen Schlüssel halten.
    """
    keys = sorted(set(re.findall(r'data-i18n="([^"]+)"', src)))
    if not keys or "var T = {" not in src:
        return []
    body = src[src.index("var T = {"):]
    out = []
    for lang, blk in re.findall(r"\n  ([a-z]{2}): \{(.*?)\n  \}", body, re.S):
        for k in keys:
            e = re.escape(k)
            if not re.search(r"(?:^|[{,\s])(?:'%s'|%s)\s*:" % (e, e), blk, re.M):
                out.append((lang, k))
    return out


bad = 0
for f in sorted(pathlib.Path("slides").glob("*.html")):
    src = f.read_text(encoding="utf-8")
    s = Scan()
    s.feed(src)
    seen = set()
    for ln, t in s.hits:
        if t in seen:
            continue
        seen.add(t)
        print(f"🔴 {f}:{ln}  deutsch ohne data-i18n — «{t}»")
        bad += 1
    for lang, k in missing_keys(src):
        print(f"🔴 {f}  «{k}» fehlt im Wörterbuch {lang} — bleibt dort deutsch")
        bad += 1

print("Keine Sprachmischung gefunden." if not bad else
      f"\n{bad} Stelle(n) bleiben in jeder Sprache deutsch.")
sys.exit(1 if bad else 0)
