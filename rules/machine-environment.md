# Machine environment

Windows 10, PowerShell 5.1, Git Bash available. These traps are specific to this
machine and every one of them has cost a session. Read before running shell commands.

## OneDrive eats repositories

Both current projects live under `C:\Users\ebhdh\OneDrive\Documents\`. OneDrive sync
has, repeatedly:

- killed dev servers mid-run
- emptied git worktrees mid-build, losing whole builds
- made `node_modules` vanish

**If a dev server dies or `node_modules` disappears, run `npm ci` and restart before
debugging anything else.** It imitates a real bug convincingly.

New repositories should be created outside OneDrive, in `C:\dev\`. The two current
projects have not been moved yet.

## PowerShell versus Bash

Two shells, two syntaxes. Pick deliberately.

- PowerShell 5.1 has **no `&&` or `||`**. Chaining with them is a parser error. Use
  `A; if ($?) { B }`.
- PowerShell 5.1 has no ternary, no `??`, no `?.`.
- **PowerShell execution policy blocks `npx.ps1`.** Run `npm` and `npx` through Bash.
  If you hand Naldo a command for his own terminal, wrap it: `cmd /c "npx ..."`. A bare
  `npx` command handed over once died silently and looked like it had succeeded.
- PowerShell 5.1 mangles here-strings passed to native executables. Pass bodies through
  a file (`-F`, `--body-file`), never inline. This bit twice.
- Avoid `2>&1` on native executables in PowerShell. It wraps stderr lines in error
  records and reports failure even on exit code 0.

## Text encoding

Python stdout on this machine is cp1252. Any script that prints repository text
containing em dashes or arrows will crash on the print.

- Set `PYTHONIOENCODING=utf-8`, or call `sys.stdout.reconfigure(encoding="utf-8")`.
- **Put file writes BEFORE prints.** This bit twice, and both times a crashed print
  made a successful run look failed after its writes had already landed.

## Environment variables

The Claude Code shell sets `ANTHROPIC_API_KEY=""`, and an empty string overrides
`.env.local`. Unset `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` before `npm run dev`
in any repository that calls the Anthropic API. `yll-call-copilot` does.

Whether the Codex shell does the same is UNVERIFIED. Check it either way before
debugging a missing-key error:

```bash
echo "[${ANTHROPIC_API_KEY}]"
```

Empty brackets with a key present in `.env.local` means the shell is overriding it.

Symptom when you forget: the dev server returns 503 with a message saying the API key
is missing, while `.env.local` clearly has one.

## Production data writes

Writes to production Supabase or GoHighLevel are frequently blocked by the tool safety
layer, even with the user's consent in hand. Do not probe the block by retrying. Write
a paste-ready script for Naldo's own terminal on the first move, and make it
PowerShell-proof per the rules above. Two separate sessions burned three attempts each
probing this.

## When a shell command gets blocked

A blocked command is one of three things. Diagnose which before reacting, and never
stall silently.

1. **Transient outage.** A routine command (git, npm, a gate) blocks for no content
   reason. Not your fault, not the command's. Fall back down the ladder: a script file
   run a different way, then an equivalent API or MCP tool, then a paste-ready command
   sequence for Naldo's terminal. Continue from the verified result. Never leave a git
   or commit step half-done without saying so.
2. **Content false positive.** The block is on what the output looks like, not the
   command. Strip query strings off URLs before returning them. Do not echo base64,
   token-shaped, or secret-shaped blobs back through tool results.
3. **A real policy block.** A production data write, or a config edit Naldo never named
   explicitly. Do not route around it. Get his explicitly named authorization, then
   script the write. A generic "merge it" never authorizes a production data write.

## Known-good tool paths

- `psql` 17.10 at `C:\Program Files\PostgreSQL\17\bin\psql.exe`. Works as a database
  fallback when other paths fail. Connect through the Supabase pooler host, not the
  direct host, which does not resolve over IPv4.
- Reading PDFs page by page needs PyMuPDF (`fitz`). The built-in reader has no
  `pdftoppm` here and its page count is wrong.
