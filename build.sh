#!/bin/sh
# Assemble index.html from base.html (head, base styles, page markup) and the src files.
cd "$(dirname "$0")"
python3 - <<'PY'
base = open("base.html", encoding="utf-8").read()
head, rest = base.split("</style>", 1)            # head + base CSS | page markup + old script
markup = rest.split("\n<script>\n", 1)[0]          # page markup only
css = "".join(open(f, encoding="utf-8").read() for f in ("src/extra.css", "src/motion.css"))
js = "\n".join(open(f, encoding="utf-8").read() for f in ("src/app.js", "src/excel.js", "src/motion.js"))
out = head + css + "</style>" + markup + "\n<script>\n" + js + "\n</script>\n</body>\n</html>\n"
open("index.html", "w", encoding="utf-8").write(out)
print("index.html built")
PY
