"""<Bracket data={q} /> — the single-elimination knockout tree.

Reconstructs the bracket from each knockout match's `team1`/`team2` (real team
names in the Round of 32, or `W74` / `L101` "winner/loser of match N" references
in later rounds), lays the rounds out left→right and draws SVG connectors. The
third-place play-off is rendered as a separate card.
"""
import html
import json

from dashdown import Component, register_component


@register_component("Bracket")
class Bracket(Component):
    def render(self, attrs, ctx, inner=None):
        cfg = {
            "query": attrs["data"].name,
            "title": str(attrs.get("title", "")),
        }
        data_config = html.escape(json.dumps(cfg), quote=True)
        return (
            '<div class="wc-bracket" data-async-component="wc-bracket" '
            f'data-config="{data_config}">'
            '<div class="wc-br-skel">Loading bracket…</div></div>'
        )
