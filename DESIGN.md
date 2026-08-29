# DESIGN

# DESIGN DIRECTION

This application should look:

- modern
- premium
- calm
- simple
- clean
- sophisticated
- trustworthy

It should NOT look:

- overly corporate
- like a bank website from 2015
- like a crypto casino
- like Robinhood
- like Bloomberg Terminal
- overly futuristic
- cluttered
- AI-generated
- full of gradients everywhere

Think:

high-end modern financial software with excellent spacing and restrained visual design.

---

# COLOR SYSTEM

Primary visual identity:

# Lavender Purple + White

Use a restrained palette.

Suggested tokens:

Background:

`#FCFBFF`

Primary surface:

`#FFFFFF`

Secondary lavender surface:

`#F7F3FF`

Soft lavender:

`#EDE9FE`

Primary purple:

`#7C3AED`

Primary hover:

`#6D28D9`

Medium lavender:

`#A78BFA`

Light accent:

`#C4B5FD`

Primary text:

approximately `#211A2C`

Secondary text:

approximately `#6C6578`

Border:

approximately `#EAE4F2`

Positive:

restrained emerald/green

Negative:

restrained red

Warning:

restrained amber

Maintain accessible contrast.

---

# GRADIENTS

Gradients are allowed but should be uncommon.

Good places:

- primary Net Worth card
- landing-page hero detail
- subtle chart fill
- selected milestone

Do NOT put gradients on every card/button.

Potential primary gradient:

deep lavender → medium lavender → very soft purple.

Keep it tasteful.

---

# CARDS

Cards should have:

- generous padding
- subtle border
- modest corner radius
- extremely light shadow where useful
- clear hierarchy

Avoid extreme floating/glowing glass cards.

---

# TYPOGRAPHY

Use a clean modern sans-serif.

Candidates:

- Geist
- Inter

Prioritize legibility for financial numbers.

Use tabular numerals where possible so changing financial values remain visually aligned.

Large financial figures should feel confident but not oversized.

---

# SPACING

Use generous whitespace.

Do not crowd charts against card edges.

Use consistent spacing tokens.

Financial dashboards become difficult to understand when everything is dense.

---

# ANIMATION

Use restrained micro-interactions.

Examples:

- smooth chart transitions
- subtle card hover
- number transition where appropriate
- loading skeletons
- drawer transitions
- dropdown transitions

Animations should generally be around 150–250ms.

Do not use flashy bouncing effects.

Respect `prefers-reduced-motion`.

---

# CHART STYLE

Charts should be visually clean.

Use:

- lavender/purple primary line
- subtle gradient area fill
- lightweight grid lines
- high-quality tooltips
- responsive sizing

Avoid unnecessary chart borders.

Tooltips should contain meaningful financial context.

---

# DESKTOP NAVIGATION

Use a clean left sidebar.

Potential items:

Home

Portfolio

History

Goals

Future

Insights

Activity

Settings

Do not add pages that have no useful content.

---

# MOBILE NAVIGATION

The application must work extremely well on a phone.

Use a simplified bottom navigation or responsive compact navigation.

Prioritize:

Home

Portfolio

History

Future

More

Tables should become mobile cards where appropriate.

Do not simply shrink desktop tables until they become unreadable.

---

# DASHBOARD DESIGN

Potential desktop structure:

TOP:

Greeting / page title

Date / refresh state

Privacy toggle

Profile menu

ROW 1:

Net Worth — primary card

Investments

Monthly Change

Next Milestone

ROW 2:

Large Net-Worth History Chart

ROW 3:

Portfolio Allocation

Goal Progress

ROW 4:

What Changed?

Portfolio Summary

ROW 5:

Future Projection preview

Recent Milestones

Maintain hierarchy.

The dashboard should not feel like 20 equally important boxes.

---

# PORTFOLIO PAGE DESIGN

Top section:

Portfolio value

Total return

Daily change

Refresh time

Primary action:

Add Investment

Secondary:

Refresh Prices

Below:

Holdings table/cards.

Provide filtering by account.

Clicking a holding opens a detailed drawer/page.

---

# ADD INVESTMENT FLOW

Make this extremely easy.

User clicks:

**Add Investment**

Step 1:

Search ticker.

Step 2:

Enter:

Shares

Average cost

Account

Optional acquisition date

Step 3:

Preview.

Step 4:

Save.

Do not require unnecessary fields.

---

# EDIT INVESTMENT FLOW

Click holding → Edit.

Shares should be editable immediately.

Example:

Current:

38.71

New:

42.71

Optional reason:

Bought shares

Sold shares

Correction

Transfer

Other

---

# HISTORY PAGE

Make this a special page, not simply another line chart.

Header:

# Wealth History

Subnavigation / modes:

Net Worth

Portfolio

Time Machine

Comparison

---

# PORTFOLIO TIME MACHINE DESIGN

Large timeline at top.

Date control:

`< February 26, 2026 >`

Main historical total.

Then:

Historical Holdings

Allocation

Cash/assets

Historical goals if available

Provide:

**Compare to Today**

One click.

---

# TIMELINE SCRUBBER

Consider an interactive timeline scrubber.

Dragging through time should update the summary at useful intervals.

---

# ERROR STATES

Every API-dependent component needs:

Loading state.

Empty state.

Error state.

Stale-data state.

Example:

“Latest market price unavailable. Showing last known value from Aug 25 at 3:58 PM.”

Much better than:

“Something went wrong.”

---

# EMPTY STATES

New accounts should look intentional.

Example:

“Your wealth timeline starts here.”

CTA:

Add your first investment.

Another:

Add historical snapshot.

Do not show broken empty charts.

---

# ACCESSIBILITY

Use semantic HTML.

Keyboard navigation.

Visible focus states.

ARIA labels where appropriate.

Accessible chart alternatives where possible.

Do not rely solely on color to convey gain/loss.

Meet reasonable WCAG contrast.

---

# DESIGN PRINCIPLE

Use the lavender identity consistently, but allow financial information to remain readable.

White should actually be the dominant visual surface.

Lavender should provide personality.

Purple should provide hierarchy.

Green/red should communicate financial movement.

Neutral colors should handle everything else.