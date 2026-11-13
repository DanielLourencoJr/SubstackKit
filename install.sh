#!/usr/bin/env bash
#
# Install the unified `substack` CLI (read + write side), wire credentials
# and deploy the agent skill.
#
#   ./install.sh              full install (deps, bin links, credentials, skill)
#   ./install.sh --dry-run    show what would happen, change nothing
#   ./install.sh --no-bin     skip the ~/.local/bin links
#   ./install.sh --no-skill   skip skill deployment
#   ./install.sh --no-deps    skip npm install
#
# Idempotent: re-run after pulling updates. Never overwrites a real file with
# a symlink (existing non-symlink files are left alone with a warning).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
SKILL_DIR="$HOME/.agents/skills/substack"

DRY_RUN=0
DO_BIN=1
DO_SKILL=1
DO_DEPS=1

usage() {
  cat <<EOF
Usage: $(basename "$0") [--dry-run] [--no-bin] [--no-skill] [--no-deps] [-h]

  --dry-run     show what would happen, change nothing
  --no-bin      do not link substack/substack-cli into $BIN_DIR
  --no-skill    do not deploy skill/SKILL.md to $SKILL_DIR
  --no-deps     do not run npm install
  -h, --help    show this help
EOF
}

fail() {
  echo "install.sh: $*" >&2
  exit 1
}

info() { echo "  $*"; }

while (($# > 0)); do
  case "$1" in
  --dry-run) DRY_RUN=1 ;;
  --no-bin) DO_BIN=0 ;;
  --no-skill) DO_SKILL=0 ;;
  --no-deps) DO_DEPS=0 ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    fail "unknown option: $1"
    ;;
  esac
  shift
done

# Run a command (or just print it under --dry-run).
run() {
  if ((DRY_RUN)); then
    echo "  would: $*"
  else
    "$@"
  fi
}

# Link a bin, refusing to clobber a real file.
link_bin() {
  local name="$1"
  local target="$2"
  local dest="$BIN_DIR/$name"
  if [[ -e "$dest" && ! -L "$dest" ]]; then
    echo "  warning: $dest exists and is not a symlink; leaving it alone" >&2
    return 0
  fi
  run ln -sfn "$target" "$dest"
}

# ---- Preflight -------------------------------------------------------------

command -v node >/dev/null 2>&1 || fail "node is required (Node.js 18+)"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' ||
  fail "Node.js 18+ required, found $(node --version)"
[[ -f "$ROOT/package.json" ]] || fail "package.json not found in $ROOT"
[[ -f "$ROOT/bin/substack.js" ]] || fail "bin/substack.js not found in $ROOT"

echo "Installing substack from $ROOT"

# ---- Dependencies ----------------------------------------------------------

if ((DO_DEPS)); then
  if command -v npm >/dev/null 2>&1; then
    if ((DRY_RUN)); then
      info "would run: npm install"
    else
      echo "Installing dependencies (npm install)..."
      npm install --prefix "$ROOT" --no-audit --no-fund ||
        echo "  warning: npm install failed; the write side has no deps, the read side needs substack-api" >&2
    fi
  else
    echo "  warning: npm not found; skipping dependencies" >&2
  fi
fi

# ---- Local .env bootstrap --------------------------------------------------

if [[ ! -f "$ROOT/.env" && -f "$ROOT/.env.example" ]]; then
  run cp "$ROOT/.env.example" "$ROOT/.env"
  info "created .env from .env.example (fill in SUBSTACK_SID or rely on the central store)"
fi

# ---- Bin links -------------------------------------------------------------

if ((DO_BIN)); then
  mkdir -p "$BIN_DIR"
  link_bin substack "$ROOT/bin/substack.js"
  link_bin substack-cli "$ROOT/bin/cli.js"
  info "linked $BIN_DIR/substack -> $ROOT/bin/substack.js"
  info "linked $BIN_DIR/substack-cli -> $ROOT/bin/cli.js (compat alias)"

  case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo "  warning: $BIN_DIR is not on PATH; add to your shell rc:" >&2
    echo "    export PATH=\"$BIN_DIR:\$PATH\"" >&2
    ;;
  esac
fi

# ---- Credentials -----------------------------------------------------------

PROJECTS_ROOT="$(dirname "$ROOT")"
CRED_CENTRAL="$PROJECTS_ROOT/.substack-credentials.env"
CRED_TEST="$PROJECTS_ROOT/.substack.test.env"
CRED_SRC=""
if [[ -f "$CRED_CENTRAL" ]]; then
  CRED_SRC="$CRED_CENTRAL"
elif [[ -f "$CRED_TEST" ]]; then
  CRED_SRC="$CRED_TEST"
fi

if [[ -n "$CRED_SRC" ]]; then
  mkdir -p "$CONFIG_HOME/substack"
  # Symlink is what lib/credentials.js checks (~/.config/substack/credentials.env).
  if [[ -e "$CONFIG_HOME/substack/credentials.env" && ! -L "$CONFIG_HOME/substack/credentials.env" ]]; then
    echo "  warning: $CONFIG_HOME/substack/credentials.env is a real file; not overwriting" >&2
  else
    run ln -sfn "$CRED_SRC" "$CONFIG_HOME/substack/credentials.env"
    info "credentials: $CONFIG_HOME/substack/credentials.env -> $CRED_SRC"
  fi
  # Optional pointer for shells: source it to pin the store explicitly.
  run tee "$CONFIG_HOME/substack/config.env" >/dev/null <<EOF
# Written by SubstackKit/install.sh — pins the Substack credential store.
# Optional: source this file in your shell rc to set SUBSTACK_CREDENTIALS_FILE.
export SUBSTACK_CREDENTIALS_FILE=$CRED_SRC
EOF
  info "config: $CONFIG_HOME/substack/config.env (source it to pin the store)"
  info "writes default to the TEST account; MAIN is never auto-selected"
else
  cat >&2 <<EOF
  warning: no central credential store found (looked for:
    $CRED_CENTRAL
    $CRED_TEST
  ). The CLI will fall back to .env / --env.
  To create one: put a file named .substack-credentials.env in the Projects/
  root (next to this repo) containing SUBSTACK_SID_TEST=... (and optionally
  SUBSTACK_SID_MAIN=...). See README "Requirements".
EOF
fi

# ---- Skill -----------------------------------------------------------------

if ((DO_SKILL)); then
  if [[ -f "$ROOT/skill/SKILL.md" ]]; then
    mkdir -p "$SKILL_DIR"
    run cp "$ROOT/skill/SKILL.md" "$SKILL_DIR/SKILL.md"
    info "skill: $SKILL_DIR/SKILL.md"
  else
    echo "  warning: $ROOT/skill/SKILL.md not found; skipping skill deploy" >&2
  fi
fi

# ---- Summary ---------------------------------------------------------------

cat <<EOF

Done.$( ((DRY_RUN)) && echo " (dry-run — nothing was changed)" )

Next:
  substack --help                      # all commands (read + write)
  substack export <handle> --author "Name"   # download articles as Markdown
  substack drafts list --json          # list your drafts
  substack sync --dir ./Articles --dry-run   # preview folder sync

Agent skill: $SKILL_DIR/SKILL.md (re-run ./install.sh after changing it)
EOF
