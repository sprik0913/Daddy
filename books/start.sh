#!/bin/sh
# Start Sprik Books. Keep this window open while you use it.
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js is not installed. Get the LTS version from https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install --omit=dev
( sleep 1; (command -v open >/dev/null && open http://localhost:8080) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8080) ) >/dev/null 2>&1 &
exec node --disable-warning=ExperimentalWarning server.js
