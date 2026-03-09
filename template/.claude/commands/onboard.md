## Onboard

Set up AIOS with a complete understanding of the business. Two modes:

### Detect Mode
If `.claude/context/personal-info.md` contains `[NOT SET]`, run **Full Onboard**.
Otherwise, run **Update** — ask what they want to add/change.

---

## Full Onboard

### Step 1: Who
Ask:
1. What's your name?
2. What's your role?
3. What's the business? (name, what it does, market)

### Step 2: Business Profile
Ask these in a natural flow, not a form. Skip what they've already answered.

**Revenue & Clients**
- Who are your current clients? Names, what they pay, how long.
- What's your monthly revenue? Monthly expenses?

**Products & Pricing**
- What do you sell? List each product/service with pricing.

**Team**
- Who's on the team? Names, roles.

**Tools & Systems**
- What tools do you use? (CRM, WhatsApp, ads, accounting, etc.)

### Step 3: Ingest Files
Ask:
> Do you have any files I should know about? Drop them here — I can read:
> - **CSV/XLSX** — financials, client list, leads
> - **PDF/DOCX** — proposals, contracts, SOPs
> - **Screenshots** — dashboards, analytics
>
> These go into my context so I can reference them in every session.

### Step 4: Save Context
Save to `.claude/context/business-info.md`:
- Company — name, what it does, market
- Products — each product with pricing
- Clients — name, revenue, status
- Team — members, roles
- Financials — revenue, expenses, profit
- Tools — what they use

Save to `.claude/context/personal-info.md`:
```
# Team Member
- **Name:** {name}
- **Role:** {role}
- **Business:** {business name}
- **Onboarded:** {today's date}
```

### Step 5: Confirm
Show a business snapshot and say: "What's the first thing you want me to help with?"

---

## Update Mode
If already onboarded, ask what to update:
- "Drop a file" → ingest and update business-info.md
- "Update financials" → ask for new numbers
- "Add a client" → add to business-info.md
