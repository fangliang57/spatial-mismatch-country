#!/bin/zsh
cd -- "$(dirname -- "$0")"
if command -v node >/dev/null 2>&1; then
  node scripts/serve.mjs
elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" scripts/serve.mjs
else
  print 'Node.js 20 or later is needed. Install Node.js, then run this launcher again.'
  read -k 1 '?Press any key to close.'
fi
