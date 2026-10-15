# nicologiuliani.site

Personal website of Nicolò Giuliani — Computer Science, systems and Linux kernel work.
Served with GitHub Pages at **https://nicologiuliani.site**.

## Structure

```
index.html      Home page
blog/           Blog posts, one folder per post (index.html inside)
  _template.html  Starting point for new posts
docs/           Project documentation pages (with example files)
notes/          Browsable university course notes (index.html + tree.json)
assets/         Shared stylesheet and Open Graph image
sitemap.xml     Sitemap
robots.txt      Crawler rules
CNAME           Custom domain for GitHub Pages
```

Plain static HTML and CSS: no build step, no dependencies.
## Kairos and Mnemo playgrounds

`docs/kairos/` and `docs/mnemo/` run programs in the browser: the compilers run in
Pyodide, the Kairos VM is compiled to WebAssembly with pthreads, and
`coi-serviceworker.js` adds the COOP/COEP headers GitHub Pages can't send.
After changing Kairos or Mnemo, rebuild with the repositories cloned next to this one:

```sh
source ~/emsdk/emsdk_env.sh
tools/build-kairos-playground.sh   # VM (WebAssembly) + Kairos frontend
tools/build-mnemo-playground.sh    # Mnemo + pcpp
```
