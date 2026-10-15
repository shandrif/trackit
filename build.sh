#!/bin/sh
# Assemble index.html from the base markup and src files
cd "$(dirname "$0")"
{ sed -n 1,165p base.html; cat src/extra.css src/motion.css; sed -n 166,207p base.html; echo "<script>"; cat src/app.js; echo; cat src/motion.js; echo "</script>"; echo "</body>"; echo "</html>"; } > index.html
