#!/usr/bin/env python3
"""
Fixtures for route_status_parse.classify().

CASES is not a sample. It is every distinct status string IFCN published
between 2025-10-20 and 2026-09-07, recovered by replaying all 320 commits of
public/data/route_status.json (13,440 individual status readings). The counts
are how many readings each string accounts for.

When the scraper reports an unknown status, add the new string here with the
status it should map to, and adjust the rules until this passes.

Run: python3 scripts/test_route_status_parse.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from route_status_parse import (  # noqa: E402
    CLOSED, CONDITIONAL, OPEN, PARTIALLY_OPEN, UNKNOWN, classify,
)

# (observations, status text, expected status, why)
CASES = [
    (8821, 'ABERTO', OPEN, 'bare headline'),
    (2765, 'ENCERRADO', CLOSED, 'bare headline'),
    (307, 'PARCIALMENTE TRANSITÁVELMAPA', PARTIALLY_OPEN,
     "headline runs into the 'MAPA' link text"),
    (307, 'PARCIALMENTE ABERTO(Transitável desde a Boca da Corridaaté ao km 3,5)',
     PARTIALLY_OPEN, 'headline and caveat agree'),
    (186, 'ABERTO(circulação controlada num único sentido:Rabaçal – 25 Fontes (ida)'
     'pela Levada das 25 Fontese25 Fontes – Rabaçal (regresso)pelo troço '
     'alternativo, denominado deBypass)', OPEN,
     'one-way circulation control is not a closure'),
    (166, 'ABERTO(Transitável entre a EncumeadaFolhadal – Caramujo - Bica da Cana)',
     PARTIALLY_OPEN, 'caveat names the only walkable stretch'),
    (138, 'PARCIALMENTE ABERTO(Transitável desde o Pico do Areeiro até ao '
     'Miradouro da Pedra Rija - km 1,2)', PARTIALLY_OPEN,
     'headline and caveat agree'),
    (138, 'PARCIALMENTE ABERTO(Transitável entre a EncumeadaFolhadal – Caramujo '
     '- Bica da Cana)', PARTIALLY_OPEN, 'headline and caveat agree'),
    (121, 'ABERTOPercurso transitável desde o Pico do Areeiro até ao Miradouro '
     'da Pedra Rija, ao km 1,2', PARTIALLY_OPEN,
     'same closure as the PARCIALMENTE ABERTO row above, worded as ABERTO'),
    (121, 'PARCIALMENTE ABERTO(Transitável desde a Boaventura (Lombo do Urzal) '
     'até ao km 6,2)', PARTIALLY_OPEN, 'headline and caveat agree'),
    (117, 'ABERTOFECHADOentre o Caldeirão Verde e o Caldeirão do Inferno',
     PARTIALLY_OPEN, 'two headline words jammed together; the second wins'),
    (106, 'ABERTO(troço unidirecional da Levada das 25 Fontes com circulação '
     'controlada num único sentido: Rabaçal – 25 Fontes (ida) pela Levada das '
     '25 Fontes e 25 Fontes – Rabaçal (regresso) pelo troço alternativo, '
     'denominado de Bypass.)', OPEN, 'one-way circulation control, not a closure'),
    (79, 'ABERTOentre a Boca das Torrinhas e a Encumeada, manter-se-á encerrado',
     PARTIALLY_OPEN, 'caveat names a closed stretch'),
    (43, 'ABERTOPercurso nos dois sentidos entre o Pico do Areeiro e o Miradouro '
     'da Pedra Rija; percurso com sentido único entre o Miradouro da Pedra Rija '
     'e o Pico Ruivo', OPEN, 'direction rules only; nothing is shut'),
    (15, 'CONDICIONADO(troço designado de bypass estará temporariamente encerrado '
     'à circulação de pessoas, a partir do dia 11 de fevereiro de 2026, por um '
     'período aproximado de duas semanas. Durante este período, o troço '
     'unidirecional da Levada das 25 Fontes passará a funcionar de forma '
     'bidirecional, permitindo a circulação de pessoas em ambos os sentidos.)',
     CONDITIONAL,
     'the bypass is shut but the route stays walkable, bidirectionally'),
    (6, 'ABERTO( Condicionado dia 26 de novembro (quarta-feira), a partir das '
     '15h00 )', OPEN, 'a restriction on one afternoon, not a closed stretch'),
    (3, 'ENCERRADO(Transitável entre a EncumeadaFolhadal – Caramujo - Bica da '
     'Cana)', PARTIALLY_OPEN,
     'same caveat as the ABERTO row above; walkable stretch beats the headline'),
    (1, 'CONDICIONADO', CONDITIONAL, 'bare headline'),
]

# Strings IFCN has never published, kept as guardrails.
EDGE_CASES = [
    ('', UNKNOWN, 'empty cell'),
    ('   ', UNKNOWN, 'whitespace-only cell'),
    ('EM MANUTENÇÃO', UNKNOWN, 'an unseen headline must not be guessed'),
    ('aberto', OPEN, 'lowercase'),
    ('Parcialmente Aberto', PARTIALLY_OPEN, 'mixed case'),
    ('PARCIALMENTE TRANSITAVEL', PARTIALLY_OPEN, 'unaccented'),
]


def main():
    failures = []
    covered = 0

    for weight, text, expected, why in CASES:
        got = classify(text)
        covered += weight
        if got != expected:
            failures.append((text, expected, got, why))

    for text, expected, why in EDGE_CASES:
        got = classify(text)
        if got != expected:
            failures.append((text, expected, got, why))

    total = len(CASES) + len(EDGE_CASES)
    for text, expected, got, why in failures:
        print(f'FAIL  expected {expected}, got {got}\n'
              f'      {text[:100]}\n'
              f'      ({why})')

    print(f'\n{total - len(failures)}/{total} passed '
          f'({covered} historical status readings covered)')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
