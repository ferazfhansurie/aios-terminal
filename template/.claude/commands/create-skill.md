## Create a New Skill

Walk the user through creating a custom skill.

1. Ask: What do you want this skill to do? (e.g., "audit leaked leads", "weekly revenue report", "check unread messages")

2. Based on the answer:
   - Figure out what data sources are needed
   - Draft any queries or API calls
   - Define the analysis logic
   - Define the output format

3. Create the skill file at `.claude/skills/{skill-name}.md` with:
   - A clear title and description
   - Step-by-step instructions
   - The actual queries/scripts
   - How to analyze and present the results

4. Test the skill by running it once.

5. Ask if the user wants a command shortcut for it — if yes, create `.claude/commands/{name}.md`.
