#!/bin/sh
# Publishes the site: stamps the CSS and JS links with a new version (so browsers fetch the
# new files instead of mixing a cached script with the new page), then commits and pushes.
#
#   ./publish.sh "What changed"

set -e
cd "$(dirname "$0")"
[ -n "$1" ] || { echo 'Usage: ./publish.sh "What changed"'; exit 1; }

version=$(date +%Y%m%d%H%M)
for page in *.html; do
  sed -i '' -E "s/((href=\"css|src=\"js)\/[a-z]+\.(css|js))(\?v=[A-Za-z0-9._-]+)?\"/\1?v=$version\"/g" "$page"
done

git add -A
git commit -q -m "$1"
git push -q
echo "Pushed. The site updates at https://sargeywargey.github.io/whattheflight/ in a minute or so."
