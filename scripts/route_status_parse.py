#!/usr/bin/env python3
"""
Classify an IFCN status cell into a route status.

IFCN writes each status as a headline word (ABERTO / PARCIALMENTE ABERTO /
ENCERRADO / CONDICIONADO) optionally followed by a free-text caveat. The
headline on its own is not trustworthy: over 11 months of daily scrapes IFCN
published the *same physical closure* three different ways --

    ABERTOPercurso transitável desde o Pico do Areeiro até ao ... km 1,2
    PARCIALMENTE ABERTO(Transitável desde o Pico do Areeiro até ao ... km 1,2)
    ABERTO(Transitável entre a Encumeada ...)  /  ENCERRADO(Transitável ...)

-- so the caveat is what decides. This module reads the headline, then lets the
caveat override it. See scripts/test_route_status_parse.py, whose fixtures are
every distinct string IFCN has published since 2025-10-20.
"""

import re
import unicodedata

# Statuses this module can return. 'unknown' means "IFCN wrote something we
# have never seen" and is a signal to go look, not a value to render.
OPEN = 'open'
CLOSED = 'closed'
PARTIALLY_OPEN = 'partially_open'
CONDITIONAL = 'conditional'
UNKNOWN = 'unknown'

# Headline words, longest-first: 'parcialmente aberto' must beat 'aberto'.
HEADLINES = [
    (r'parcialmente\s*aberto', PARTIALLY_OPEN),
    (r'parcialmente\s*transitavel', PARTIALLY_OPEN),
    (r'parcialmente', PARTIALLY_OPEN),
    (r'condicionado', CONDITIONAL),
    (r'encerrado', CLOSED),
    (r'fechado', CLOSED),
    (r'aberto', OPEN),
]
HEADLINE_RE = re.compile(
    r'^\s*(' + '|'.join(p for p, _ in HEADLINES) + r')', re.IGNORECASE
)

# A caveat that names a closed stretch, or names the only stretch you may walk,
# means the route is not fully open however the headline is worded.
PARTIAL_CAVEAT_RE = re.compile(
    r'encerrado|fechado|transitavel\s+(?:entre|desde|ate)', re.IGNORECASE
)

# The colours IFCN paints the headline in. Advisory only -- used to cross-check
# the text reading, never to override it (a stale outer <span style="color:
# #ff0000"> wraps the green ABERTO on PR6, so the first colour in the cell
# lies).
HEADLINE_COLOURS = {
    '#99cc00': OPEN,
    '#ffcc00': PARTIALLY_OPEN,
    '#ff0000': CLOSED,
}


def _fold(text):
    """Lowercase and strip accents, so 'TRANSITÁVEL' matches 'transitavel'."""
    decomposed = unicodedata.normalize('NFKD', text.lower())
    return ''.join(c for c in decomposed if not unicodedata.combining(c))


def split_headline(status_text):
    """
    Split a status cell into (headline, caveat).

    The cell text arrives with tag boundaries collapsed away, so the headline
    runs straight into the caveat with no separator: 'ABERTOFECHADOentre o
    Caldeirão Verde...'. Match the leading keyword rather than splitting on
    whitespace or paragraphs.
    """
    folded = _fold(status_text)
    match = HEADLINE_RE.match(folded)
    if not match:
        return None, status_text.strip()
    return match.group(1), status_text[match.end():].strip()


def classify(status_text):
    """
    Return one of OPEN / CLOSED / PARTIALLY_OPEN / CONDITIONAL / UNKNOWN.

    UNKNOWN means the headline matched nothing we know about. Callers must
    surface it rather than treating it as a benign default.
    """
    if not status_text or not status_text.strip():
        return UNKNOWN

    headline, caveat = split_headline(status_text)
    if headline is None:
        return UNKNOWN

    status = next(
        value for pattern, value in HEADLINES
        if re.fullmatch(pattern, headline, re.IGNORECASE)
    )

    # A caveat naming a closed or walkable-only stretch downgrades a bare
    # ABERTO and upgrades a bare ENCERRADO -- both describe a part-open route.
    # CONDICIONADO is left alone: its caveat explains the condition (a bypass
    # shut, a one-way section) rather than closing the route.
    if status in (OPEN, CLOSED) and PARTIAL_CAVEAT_RE.search(_fold(caveat)):
        return PARTIALLY_OPEN

    return status


def colour_hint(cell_html):
    """
    What the cell's colour coding says, or None.

    Takes the last recognised colour in the cell, not the first: PR6's green
    headline span sits nested inside a leftover red one, so reading the first
    colour reports 'closed' for a route that is open. Advisory only -- a cell
    whose caveat carries its own colour would report that instead.
    """
    found = re.findall(r'color:\s*(#[0-9a-fA-F]{6})', cell_html)
    recognised = [HEADLINE_COLOURS[c.lower()] for c in found
                  if c.lower() in HEADLINE_COLOURS]
    return recognised[-1] if recognised else None
