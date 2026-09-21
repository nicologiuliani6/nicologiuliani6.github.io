#!/usr/bin/env python3
"""Render the cavium repo's markdown docs into the site's /docs/ section.

Usage:  SRC=~/cavium-cn6640-snic10e-octeon-ii-nic python3 tools/gendocs.py
"""
import html
import os
import re

SRC = os.path.expanduser(os.environ.get("SRC", "~/cavium-cn6640-snic10e-octeon-ii-nic"))
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "docs", "cavium-cn6640-snic10e")
BASE = "/docs/cavium-cn6640-snic10e"
REPO = "https://github.com/nicologiuliani6/cavium-cn6640-snic10e-octeon-ii-nic"

PAGES = [
    # slug, source, title, one-line description
    ("", "README.md", "Cavium CN6640-SNIC10E — overview",
     "What this project is, what it does to the card, and a quick start."),
    ("flashing", "docs/FLASHING.md", "Flashing & booting the card",
     "Building the modules and the card image, the one-time serial u-boot provisioning, and booting with octboot."),
    ("usage", "docs/USAGE.md", "Usage",
     "Day-to-day operation: autostart, octnic parameters, sensors, benchmarking, troubleshooting."),
    ("hardware", "docs/HARDWARE.md", "Hardware",
     "The board itself: SoC, PHY, PCIe BARs, the BAR0 window freeze hazard, serial pinout, XAUI mapping."),
    ("performance", "docs/PERFORMANCE.md", "Performance",
     "Measured throughput, the tuning that got there, and how to reproduce the numbers."),
    ("architecture", "docs/ARCHITECTURE.md", "Architecture",
     "The datapath end to end: the BAR2 shared-memory rings, the card and host modules, the boot flow."),
    ("dma-design", "docs/DMA-DESIGN.md", "DMA design",
     "Why RX is card-mastered DPI DMA and TX is host PIO, and the constraints behind that split."),
]

DOC_URL = {
    "README.md": BASE + "/",
    "../README.md": BASE + "/",
    "docs/README.md": BASE + "/",
    "docs/FLASHING.md": BASE + "/flashing/",
    "docs/USAGE.md": BASE + "/usage/",
    "docs/HARDWARE.md": BASE + "/hardware/",
    "docs/PERFORMANCE.md": BASE + "/performance/",
    "docs/ARCHITECTURE.md": BASE + "/architecture/",
    "docs/DMA-DESIGN.md": BASE + "/dma-design/",
    "FLASHING.md": BASE + "/flashing/",
    "USAGE.md": BASE + "/usage/",
    "HARDWARE.md": BASE + "/hardware/",
    "PERFORMANCE.md": BASE + "/performance/",
    "ARCHITECTURE.md": BASE + "/architecture/",
    "DMA-DESIGN.md": BASE + "/dma-design/",
    "LICENSE": REPO + "/blob/master/LICENSE",
}


def slug(text):
    """GitHub-style heading anchor, so intra-doc links keep working."""
    t = re.sub(r"<[^>]+>", "", text).lower()
    t = re.sub(r"[^\w\- ]", "", t, flags=re.UNICODE)
    return t.replace(" ", "-")


def rewrite_link(href):
    target, _, anchor = href.partition("#")
    if target in DOC_URL:
        url = DOC_URL[target]
        return url + ("#" + anchor if anchor else "")
    if not target:                       # same-page anchor
        return href
    if target.startswith(("http://", "https://", "mailto:")):
        return href
    # any other repo-relative path: point at the file on GitHub
    clean = target.lstrip("./")
    return f"{REPO}/blob/master/{clean}" + ("#" + anchor if anchor else "")


def inline(text):
    """Inline markdown -> HTML. Code spans are protected from everything else."""
    spans = []

    def stash(m):
        spans.append(html.escape(m.group(1)))
        return f"\x00{len(spans) - 1}\x00"

    text = re.sub(r"`([^`]+)`", stash, text)
    text = html.escape(text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)",
                  lambda m: f'<a href="{html.escape(rewrite_link(m.group(2)), quote=True)}">{m.group(1)}</a>',
                  text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text, flags=re.S)
    text = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", text)
    text = re.sub(r"\x00(\d+)\x00", lambda m: f"<code>{spans[int(m.group(1))]}</code>", text)
    return text


def table(rows, out):
    head, body = rows[0], rows[2:]
    out.append("<table>")
    out.append("<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead>")
    out.append("<tbody>")
    for r in body:
        out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
    out.append("</tbody></table>")


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def is_table_sep(line):
    return bool(re.match(r"^\s*\|?[\s:-]*-[\s:|-]*$", line)) and "-" in line


def render(lines, out, anchors=True):
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]

        if not line.strip():
            i += 1
            continue

        if line.startswith("```"):
            i += 1
            code = []
            while i < n and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            i += 1
            out.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            text = inline(m.group(2))
            if level == 1:                       # page title lives in <header>
                i += 1
                continue
            tag = f"h{min(level, 4)}"
            aid = f' id="{slug(m.group(2))}"' if anchors else ""
            out.append(f"<{tag}{aid}>{text}</{tag}>")
            i += 1
            continue

        if re.match(r"^---+\s*$", line):
            out.append("<hr>")
            i += 1
            continue

        if line.lstrip().startswith("|") and i + 1 < n and is_table_sep(lines[i + 1]):
            rows = []
            while i < n and lines[i].lstrip().startswith("|"):
                rows.append(cells(lines[i]))
                i += 1
            table(rows, out)
            continue

        if line.startswith(">"):
            block = []
            while i < n and (lines[i].startswith(">") or (block and lines[i].strip() and not lines[i].startswith(("#", "```", "|")))):
                block.append(re.sub(r"^>\s?", "", lines[i]))
                i += 1
            out.append("<blockquote>")
            render(block, out, anchors=False)
            out.append("</blockquote>")
            continue

        m = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", line)
        if m:
            ordered = m.group(2)[0].isdigit()
            indent = len(m.group(1))
            items = []
            while i < n:
                mm = re.match(r"^(\s*)([-*]|\d+\.)\s+(.*)$", lines[i])
                if mm and len(mm.group(1)) == indent:
                    items.append([mm.group(3)])
                    i += 1
                    continue
                if items and lines[i].strip() and lines[i].startswith(" "):
                    items[-1].append(lines[i].strip())
                    i += 1
                    continue
                if items and not lines[i].strip() and i + 1 < n and re.match(r"^\s*([-*]|\d+\.)\s", lines[i + 1]):
                    i += 1
                    continue
                break
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>")
            for parts in items:
                out.append("<li>" + inline(" ".join(parts)) + "</li>")
            out.append(f"</{tag}>")
            continue

        para = []
        while i < n and lines[i].strip() and not lines[i].startswith(("#", "```", ">", "|")) \
                and not re.match(r"^\s*([-*]|\d+\.)\s", lines[i]) and not re.match(r"^---+\s*$", lines[i]):
            para.append(lines[i].strip())
            i += 1
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>")
        else:
            i += 1


def convert(path):
    text = open(os.path.join(SRC, path), encoding="utf-8").read()
    out = []
    render(text.split("\n"), out)
    return "\n    ".join(out)


NAV = "\n".join(
    f'      <a href="{BASE}/{s + "/" if s else ""}">{t}</a>'
    for s, _, t, _ in
    [("", "", "Overview", ""), ("flashing", "", "Flashing", ""), ("usage", "", "Usage", ""),
     ("hardware", "", "Hardware", ""), ("performance", "", "Performance", ""),
     ("architecture", "", "Architecture", ""), ("dma-design", "", "DMA design", "")]
)

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Cavium CN6640-SNIC10E docs</title>
<meta name="description" content="{desc}">
<meta name="author" content="Nicolò Giuliani">
<link rel="canonical" href="https://nicologiuliani.site{url}">
<meta property="og:type" content="article">
<meta property="og:title" content="{title} — Cavium CN6640-SNIC10E docs">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://nicologiuliani.site{url}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{title} — Cavium CN6640-SNIC10E docs">
<meta name="twitter:description" content="{desc}">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<main>
  <a class="back-link" href="{back}">{back_label}</a>

  <header>
    <h1>{title}</h1>
    <p class="tagline">Cavium CN6640-SNIC10E documentation</p>
    <nav>
{nav}
    </nav>
  </header>

  <article class="post-body">

    {body}

  </article>

  <footer>{footer}</footer>
</main>
</body>
</html>
"""

FOOTER = (f'Canonical documentation for <a href="{REPO}">cavium-cn6640-snic10e-octeon-ii-nic</a>. '
          f'Rendered from the repo docs. · <a href="/">nicologiuliani.site</a>')

os.makedirs(OUT, exist_ok=True)
for s, src, title, desc in PAGES:
    body = convert(src)
    if s == "":
        body += ('\n    <hr>\n    <h2 id="documentation">Documentation</h2>'
                 '\n    <p>These pages are the canonical documentation for the project, '
                 'grouped by what you are trying to do.</p>\n    ')
        body += convert("docs/README.md").split("\n    ", 1)[1]
    d = os.path.join(OUT, s)
    os.makedirs(d, exist_ok=True)
    url = f"{BASE}/{s + '/' if s else ''}"
    page = TEMPLATE.format(
        title=html.escape(title), desc=html.escape(desc), url=url, body=body, nav=NAV,
        back="/blog/cavium-cn6640-bar2-datapath/" if s == "" else BASE + "/",
        back_label="← The write-up" if s == "" else "← Docs overview",
        footer=FOOTER)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page)
    print("wrote", os.path.join(d, "index.html"))
