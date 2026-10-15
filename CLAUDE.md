# Centavo

Personal cash flow tracker PWA. Privacy-first, offline, no backend.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that does not match DESIGN.md.

Key rules from DESIGN.md:
- Hero balance number: Instrument Serif, 44px, income/expense/muted color based on sign
- All other text: Plus Jakarta Sans
- Amounts in lists: Plus Jakarta Sans with `font-variant-numeric: tabular-nums lining-nums`
- Income color: #2D6A4F (emerald). Expense color: #9B2335 (burgundy). Never use these for non-financial UI.
- Background: #F7F5F1 (warm off-white). Never pure white as page background.
- Buttons are dark (#1A1816) for generic actions. Only use income/expense colors for save buttons when the form type is set.
