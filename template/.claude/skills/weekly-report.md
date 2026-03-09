# Skill: Weekly Report

Generate a weekly business summary from context files.

## Usage
"Weekly report" or "What happened this week?"

## Steps

### 1. Read Context
- `.claude/context/current-data.md` — latest metrics
- `.claude/context/business-info.md` — client list, revenue

### 2. Summarize
Present:
```
Weekly Report — [date range]

Revenue: RM X (vs last week)
Clients: X active
Key activity: [summary]

Priorities this week:
1. [action]
2. [action]
3. [action]
```

### 3. Update
Update `.claude/context/current-data.md` with any new data gathered.
