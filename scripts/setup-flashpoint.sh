#!/usr/bin/env bash
# Extracts Flashpoint Ultimate into a directory Dotcom Arcade can serve, and
# can download it first from a torrent you got from Flashpoint. Safe to re-run:
# it resumes the download and skips archives it has already extracted.
#
#   scripts/setup-flashpoint.sh [options] /path/to/flashpoint
#
# Options:
#   --torrent FILE     download Flashpoint Ultimate with aria2c, from the
#                      .torrent file on https://flashpointarchive.org/downloads
#   --downloads DIR    where the archives are or will be downloaded to
#                      (default: DEST/../downloads)
#   --infinity FILE    add the software streaming needs (FPSoftware/, Server/)
#                      from Flashpoint Infinity for Linux (.7z, same page)
#   --keep-archives    keep each archive after extracting it, e.g. to seed;
#                      needs room for both copies
#   --yes              don't ask for confirmation
#
# Without --torrent, it uses the Ultimate archives already in the downloads
# directory. Requires 7-Zip (7z, 7zz or 7za), and aria2c with --torrent.
#
# Flashpoint Ultimate is more than 2 TB. This script checks for the space
# before it starts and refuses to run without it.
#
# Flashpoint Archive's legal standing is unsettled. You are responsible for
# complying with copyright law where you live. This script contains no
# download links: it only downloads from a torrent you supply.
set -euo pipefail

# Free space to leave on the disk after each archive, and headroom for the
# largest archive being extracted while its zip still exists
MARGIN=$((20 * 1024 ** 3))
LARGEST_ARCHIVE=$((100 * 1024 ** 3))

usage() {
  sed -n '6,27p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

DEST=
DOWNLOADS=
TORRENT=
INFINITY=
KEEP=false
YES=false
while (($#)); do
  case $1 in
    --torrent) TORRENT=${2:?}; shift ;;
    --downloads) DOWNLOADS=${2:?}; shift ;;
    --infinity) INFINITY=${2:?}; shift ;;
    --keep-archives) KEEP=true ;;
    --yes) YES=true ;;
    -h | --help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage ;;
    *) DEST=$1 ;;
  esac
  shift
done
[[ -n $DEST ]] || usage
[[ -z $TORRENT || -f $TORRENT ]] || { echo "No torrent file at $TORRENT" >&2; exit 1; }
[[ -z $INFINITY || -f $INFINITY ]] || { echo "No Infinity archive at $INFINITY" >&2; exit 1; }
mkdir -p "$DEST"
DEST=$(cd "$DEST" && pwd)
DOWNLOADS=${DOWNLOADS:-$(dirname "$DEST")/downloads}
mkdir -p "$DOWNLOADS"

SEVENZIP=$(command -v 7zz || command -v 7z || command -v 7za || true)
[[ -n $SEVENZIP ]] || { echo "7-Zip is required (7z, 7zz or 7za)" >&2; exit 1; }
[[ -z $TORRENT ]] || command -v aria2c >/dev/null || { echo "aria2c is required for --torrent" >&2; exit 1; }

gib() { echo "$(($1 / 1024 ** 3))G"; }
free_bytes() { df --output=avail -B1 "$1" | tail -1; }
same_disk() { [[ $(stat -c %d "$1") == $(stat -c %d "$2") ]]; }

DONE=$DOWNLOADS/.extracted
touch "$DONE"

# What's left to extract, measured from the archives on disk
remaining=0
while IFS= read -r -d '' archive; do
  grep -qxF "$(basename "$archive")" "$DONE" || remaining=$((remaining + $(stat -c %s "$archive")))
done < <(find "$DOWNLOADS" -maxdepth 2 -name '*.zip' -print0)

# The download's size, from the torrent
download=0
if [[ -n $TORRENT ]]; then
  download=$(aria2c -S "$TORRENT" | awk -F'[()]' '/Total Length/ { gsub(/,/, "", $2); print $2; exit }')
  [[ $download =~ ^[0-9]+$ ]] || { echo "Couldn't read the download's size from $TORRENT" >&2; exit 1; }
  remaining=$download
fi

# Extracted files take about as much room as the archives. Unless they're
# kept, each archive is deleted once extracted, so on a shared disk only the
# largest one is ever stored twice.
if $KEEP; then extra=$remaining; else extra=$((remaining < LARGEST_ARCHIVE ? remaining : LARGEST_ARCHIVE)); fi
if same_disk "$DOWNLOADS" "$DEST"; then
  checks=("$DEST:$((download + extra + MARGIN))")
else
  checks=("$DOWNLOADS:$((download + MARGIN))" "$DEST:$((remaining + MARGIN))")
fi

if ((remaining > 0)); then
  echo "Flashpoint Ultimate is very large: about $(gib "$remaining") of game data."
  short=false
  for check in "${checks[@]}"; do
    dir=${check%:*} need=${check##*:} avail=$(free_bytes "${check%:*}")
    echo "  $dir needs about $(gib "$need"), has $(gib "$avail") free"
    ((avail >= need)) || short=true
  done
  if $short; then
    echo "Not enough free space. Free up room or choose another disk; see the README's hosting requirements." >&2
    exit 1
  fi
  if ! $YES; then
    [[ -t 0 ]] || { echo "Run with --yes to continue without a prompt." >&2; exit 1; }
    read -r -p "This takes a day or more. Continue? [y/N] " answer
    [[ $answer == [yY]* ]] || exit 1
  fi
fi

# Extracts ARCHIVE into DEST, or only the entries listed in LIST if given.
# Archives may wrap everything in one top-level folder (e.g. "Flashpoint
# Ultimate/"); its contents are moved up into DEST.
extract() {
  local archive=$1 list=${2:-}
  local need avail staging root
  need=$("$SEVENZIP" l -ba -slt "$archive" | awk -F' = ' '$1 == "Size" { s += $2 } END { print s + 0 }')
  avail=$(df --output=avail -B1 "$DEST" | tail -1)
  if ((need + MARGIN > avail)); then
    echo "Not enough space for $(basename "$archive"): needs $(gib "$need"), $(gib "$avail") free" >&2
    exit 1
  fi
  echo "==> $(basename "$archive") ($(gib "$need"))"
  staging=$DEST/.extracting
  rm -rf "$staging"
  if [[ -n $list ]]; then
    "$SEVENZIP" x -y -bso0 -bsp0 -o"$staging" "$archive" "@$list"
  else
    "$SEVENZIP" x -y -bso0 -bsp1 -o"$staging" "$archive"
  fi
  root=$staging
  if [[ $(find "$staging" -mindepth 1 -maxdepth 1 | wc -l) -eq 1 && -d "$staging/Flashpoint Ultimate" ]]; then
    root="$staging/Flashpoint Ultimate"
  fi
  # Hard links move the files without needing space for a second copy
  cp -alf "$root/." "$DEST/"
  rm -rf "$staging"
}

# 1. Download the packed archives
if [[ -n $TORRENT ]]; then
  echo "==> Downloading into $DOWNLOADS"
  aria2c --dir="$DOWNLOADS" --seed-time=0 --check-integrity=true \
    --file-allocation=falloc --bt-max-peers=100 "$TORRENT"
fi
# fp-index.json stays behind once the archives are extracted and deleted
PACKED=$(find "$DOWNLOADS" -maxdepth 2 \( -name GameData_1.zip -o -name fp-index.json \) -printf '%h\n' | head -1)
[[ -n $PACKED ]] || { echo "No Ultimate archives found under $DOWNLOADS" >&2; exit 1; }

# 2. Extract the game data, images and htdocs, one archive at a time
shopt -s nullglob
for archive in "$PACKED"/Images_*.zip "$PACKED"/Htdocs_*.zip "$PACKED"/GameData_*.zip "$PACKED"/Extras_*.zip; do
  name=$(basename "$archive")
  grep -qxF "$name" "$DONE" && continue
  extract "$archive"
  echo "$name" >>"$DONE"
  $KEEP || rm -- "$archive"
done

# 3. From Base_1.zip, which otherwise holds Windows software, take only the
#    database, settings and playlists
base=$PACKED/Base_1.zip
if [[ -f $base ]] && ! grep -qxF Base_1.zip "$DONE"; then
  list=$(mktemp)
  "$SEVENZIP" l -ba -slt "$base" | awk -F' = ' '$1 == "Path" { print $2 }' |
    grep -E '(^|/)(Data/(flashpoint\.sqlite|execs\.json|services\.json|Playlists/.*)|preferences\.json|\.preferences\.defaults\.json|version\.txt)$' \
      >"$list" || true
  extract "$base" "$list"
  rm -f "$list"
  echo Base_1.zip >>"$DONE"
  $KEEP || rm -- "$base"
fi
mkdir -p "$DEST/Data/Playlists"
# The launcher creates preferences.json from the defaults on first run
if [[ ! -f $DEST/preferences.json && -f $DEST/.preferences.defaults.json ]]; then
  cp -p "$DEST/.preferences.defaults.json" "$DEST/preferences.json"
fi

# 4. Optionally add Infinity for Linux's software, without replacing anything
if [[ -n $INFINITY ]]; then
  echo "==> $(basename "$INFINITY")"
  staging=$DEST/.extracting
  rm -rf "$staging"
  "$SEVENZIP" x -y -bso0 -bsp1 -o"$staging" "$INFINITY"
  root=$(dirname "$(find "$staging" -maxdepth 3 -name version.txt | head -1)")
  cp -an "$root/." "$DEST/"
  rm -rf "$staging"
fi

[[ -f $DEST/Data/flashpoint.sqlite ]] ||
  echo "Warning: no Data/flashpoint.sqlite. Re-run with --infinity to take Infinity's." >&2
echo "Done. Set FLASHPOINT_HOST_PATH=$DEST in .env."
