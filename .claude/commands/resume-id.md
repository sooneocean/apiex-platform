---
description: "快速取得當前對話的 --resume session ID"
allowed-tools: Bash
---

# 取得 Resume ID

```bash
PROJECT_DIR="$HOME/.claude/projects"
ENCODED=$(echo "$PWD" | sed 's|/|-|g')
TRANSCRIPT=$(ls -t "$PROJECT_DIR/$ENCODED/"*.jsonl 2>/dev/null | head -1)
SESSION_ID=$(basename "$TRANSCRIPT" .jsonl)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  claude --resume $SESSION_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
```

直接輸出上面 bash 的結果，不加任何額外說明。
