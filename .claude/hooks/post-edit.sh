#!/usr/bin/env bash
# PostToolUse hook: auto-format the edited file once a formatter exists. No-op until the stack is chosen.
f=$(jq -r '.tool_input.file_path // empty'); [[ -z $f || ! -f $f ]] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
[[ -x node_modules/.bin/prettier ]] && node_modules/.bin/prettier --write "$f" >/dev/null 2>&1
[[ $f == *.rs ]] && command -v rustfmt >/dev/null && rustfmt "$f" 2>/dev/null
exit 0
