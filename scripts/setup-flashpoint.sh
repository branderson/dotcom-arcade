#!/usr/bin/env bash
# Downloads Flashpoint Ultimate and extracts it into a directory Dotcom Arcade
# can serve. Safe to re-run: it resumes the download and skips archives it has
# already extracted.
#
#   scripts/setup-flashpoint.sh [options] /path/to/flashpoint
#
# Options:
#   --downloads DIR    where the torrent downloads to (default: DEST/../downloads)
#   --keep-archives    keep each archive after extracting it, to keep seeding;
#                      needs room for both (about 4.6 TB for Ultimate 14)
#   --skip-download    use archives already in the downloads directory
#   --with-infinity    add Flashpoint Infinity for Linux's software, which
#                      streaming needs (FPSoftware/, Server/)
#
# Requires aria2c (unless --skip-download) and 7-Zip (7z, 7zz or 7za).
set -euo pipefail

ULTIMATE_VERSION=14
TORRENT_URL="https://download.unstable.life/FlashpointUltimate${ULTIMATE_VERSION}.torrent"
INFINITY_URL="https://download.unstable.life/upload/fp14.0.3_lin_20251201.7z"
INFINITY_SHA256=f393a98c5c35e229a744c102b0cb53270b1b4f1b3ebd40d604f98323444a4b1f
# Free space to leave on the disk after each archive
MARGIN=$((20 * 1024 ** 3))

usage() {
  sed -n '6,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

DEST=
DOWNLOADS=
KEEP=false
DOWNLOAD=true
INFINITY=false
while (($#)); do
  case $1 in
    --downloads) DOWNLOADS=${2:?}; shift ;;
    --keep-archives) KEEP=true ;;
    --skip-download) DOWNLOAD=false ;;
    --with-infinity) INFINITY=true ;;
    -h | --help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage ;;
    *) DEST=$1 ;;
  esac
  shift
done
[[ -n $DEST ]] || usage
mkdir -p "$DEST"
DEST=$(cd "$DEST" && pwd)
DOWNLOADS=${DOWNLOADS:-$(dirname "$DEST")/downloads}
mkdir -p "$DOWNLOADS"

SEVENZIP=$(command -v 7zz || command -v 7z || command -v 7za || true)
[[ -n $SEVENZIP ]] || { echo "7-Zip is required (7z, 7zz or 7za)" >&2; exit 1; }

gib() { echo "$(($1 / 1024 ** 3))G"; }

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
if $DOWNLOAD; then
  command -v aria2c >/dev/null || { echo "aria2c is required to download" >&2; exit 1; }
  echo "==> Downloading Flashpoint Ultimate ${ULTIMATE_VERSION} into $DOWNLOADS"
  aria2c --dir="$DOWNLOADS" --seed-time=0 --check-integrity=true \
    --file-allocation=falloc --bt-max-peers=100 --follow-torrent=mem "$TORRENT_URL"
fi
# fp-index.json stays behind once the archives are extracted and deleted
PACKED=$(find "$DOWNLOADS" -maxdepth 2 \( -name GameData_1.zip -o -name fp-index.json \) -printf '%h\n' | head -1)
[[ -n $PACKED ]] || { echo "No Ultimate archives found under $DOWNLOADS" >&2; exit 1; }

# 2. Extract the game data, images and htdocs, one archive at a time
DONE=$DOWNLOADS/.extracted
touch "$DONE"
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
if $INFINITY; then
  infinity=$DOWNLOADS/$(basename "$INFINITY_URL")
  if [[ ! -f $infinity ]]; then
    echo "==> Downloading Flashpoint Infinity for Linux"
    curl -fL --retry 3 -o "$infinity.part" "$INFINITY_URL"
    mv "$infinity.part" "$infinity"
  fi
  echo "$INFINITY_SHA256  $infinity" | sha256sum -c --quiet
  staging=$DEST/.extracting
  rm -rf "$staging"
  "$SEVENZIP" x -y -bso0 -bsp1 -o"$staging" "$infinity"
  root=$(dirname "$(find "$staging" -maxdepth 3 -name version.txt | head -1)")
  cp -an "$root/." "$DEST/"
  rm -rf "$staging"
fi

[[ -f $DEST/Data/flashpoint.sqlite ]] ||
  echo "Warning: no Data/flashpoint.sqlite. Re-run with --with-infinity to take Infinity's." >&2
echo "Done. Set FLASHPOINT_HOST_PATH=$DEST in .env."
