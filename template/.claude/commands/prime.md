## Prime Session

Fast context load. No external calls — just read files and get ready.

### Step 1: Load context (in parallel)
- `.claude/context/personal-info.md`
- `.claude/context/current-data.md`
- `.claude/context/business-info.md`

If `personal-info.md` contains `[NOT SET]`, tell the user to run `/onboard` first and stop.

### Step 2: Present

```
AIOS Ready — [date]
[Name] | [Role] | [Business]

Last data: [date from current-data.md or "No data yet"]
[2-3 key numbers if available, or "Run /onboard to set up"]

Commands: /onboard, /create-skill
```

### Step 3: Ask
"What's the play?"

That's it. Under 10 lines.
