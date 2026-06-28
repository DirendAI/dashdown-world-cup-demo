"""<GoalHeatmap data={q} /> — when are goals scored?

A custom SVG heat-histogram of goals binned by match minute (1‒90, plus
stoppage). Bar height encodes volume; fill runs a cool→hot heat scale, with a
half-time divider and a peak marker. Expects a query with a minute column and a
goal-count column; bins client-side.
"""
import html
import json

from dashdown import Component, register_component


@register_component("GoalHeatmap")
class GoalHeatmap(Component):
    def render(self, attrs, ctx, inner=None):
        cfg = {
            "query": attrs["data"].name,
            "minute": str(attrs.get("minute", "minute")),
            "value": str(attrs.get("value", "goals")),
            "bin": int(attrs.get("bin") or 5),
            "title": str(attrs.get("title", "")),
        }
        data_config = html.escape(json.dumps(cfg), quote=True)
        return (
            '<div class="wc-heat" data-async-component="wc-goalheat" '
            f'data-config="{data_config}">'
            '<div class="wc-heat-skel">Loading goal heatmap…</div></div>'
        )
