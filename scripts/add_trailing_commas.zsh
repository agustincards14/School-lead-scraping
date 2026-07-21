#!/usr/bin/env zsh
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: add_trailing_commas.zsh [-i] <file>

Add a trailing comma to every non-empty line in a CSV file that does not already end with a comma.

Options:
  -i    Edit the file in-place (creates a timestamped backup: <file>.bak.<ts>)

If -i is omitted the result is written to stdout so you can redirect to a file.
EOF
  exit 1
}

inplace=false
while getopts ":i" opt; do
  case $opt in
    i) inplace=true ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))

file=${1:-}
if [[ -z "$file" ]]; then
  echo "Error: missing file argument" >&2
  usage
fi

if [[ ! -f "$file" ]]; then
  echo "Error: file not found: $file" >&2
  exit 2
fi

process() {
  awk '
  {
    # If the line is empty or only whitespace, print it unchanged.
    if ($0 ~ /^[[:space:]]*$/) { print ""; next }
    # If the line already ends with a comma, print as-is.
    if ($0 ~ /,$/) { print $0; next }
    # Otherwise append a comma.
    print $0 ","
  }
  ' "$1"
}

if $inplace; then
  ts=$(date +%s)
  backup="${file}.bak.${ts}"
  cp -- "$file" "$backup"
  # Write to a temp file then move into place
  tmpfile="${file}.$ts.tmp"
  process "$file" > "$tmpfile"
  mv -- "$tmpfile" "$file"
  echo "Updated $file (backup at $backup)"
else
  process "$file"
fi
