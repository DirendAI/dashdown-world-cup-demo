"""<MatchTimeline data={q} /> — a chronological tournament timeline.

Renders match results (and upcoming fixtures) as a vertical, date-railed
timeline of cards with flags, scorelines and venues. Self-hydrating: it ships a
placeholder and its JS fetches the query in the browser (see MatchTimeline.js).
"""
import html
import json

from dashdown import Component, register_component


@register_component("MatchTimeline")
class MatchTimeline(Component):
    def render(self, attrs, ctx, inner=None):
        raw_limit = attrs.get("limit")
        limit = int(raw_limit) if raw_limit not in (None, "") else None
        cfg = {
            "query": attrs["data"].name,
            "limit": limit,
            "order": str(attrs.get("order", "asc")),   # asc | desc (most-recent first)
            "empty": str(attrs.get("empty_message", "No matches to show.")),
        }
        data_config = html.escape(json.dumps(cfg), quote=True)
        return (
            '<div class="wc-timeline" data-async-component="wc-timeline" '
            f'data-config="{data_config}">'
            '<div class="wc-tl-skel">Loading timeline…</div></div>'
        )
