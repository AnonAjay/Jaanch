# Project brief: Jaanch (working name)

## Problem
At cyber cafes and form-filling stalls, an operator types a customer's details into an online form. A one-character slip in a date of birth, a district, or a name spelling can get an application rejected. Court records document real cost: a Supreme Court case (Jan 2024) revived a candidate's application after a cafe operator entered his date of birth as the 8th instead of the 18th; a Delhi High Court judgment described a similar slip as a bona fide mistake linked to reliance on cafe staff; other cases involve a wrong district and a wrongly uploaded certificate. Caveat: these are cases that reached court, so they show cost, not frequency. Re-verify each case before citing it publicly.

## Users
- Operator: types the form, serves up to about six customers in turn, is the bottleneck.
- Customer: may have low literacy or find small on-screen text hard to check.

## What v1 does
1. Content script reads fields and values from a live portal.
2. Operator opens the popup from the toolbar or the in-page Recheck trigger.
3. The popup shows each critical field and reads it aloud using on-device speech synthesis.
4. The customer replies by voice. The reply is transcribed and classified by rules: confirm, reject, repeat, correct_value, correct_instruction, unclear.
5. The popup flags mismatches. The operator decides: Accept (shows the corrected value to type), Keep, or Ask again.
6. A summary lists each field as match, mismatch, not checked, or unsure. Everything is wiped when done.

## v1 scope (hard limit)
Form fields are discovered on live portals; automated tests use synthetic fixtures. No LLM. No certificate OCR. No photos.

## Not
Not a legal tool. Does not guarantee a form is correct. Does not edit or submit forms. Does not handle ID numbers. Not tested at any real cafe yet.

## Success metrics (measured, see docs/TEST_PLAN.md)
Detection rate per seeded error type with counts; false-flag rate; intent accuracy; zero returned values that are not in the transcript; spoken-prompt latency from cache.

## Hackathon constraints (gnani.ai/internship, read 9 Nov 2026; re-read before submitting)
- Public post on LinkedIn and/or X with both hashtags, live before submission, with a demo video of the working app.
- Name the Gnani models used and each member's contribution.
- No paid promotion, bots, or engagement swaps. No misleading demos.
- Synthetic data only. One entry; team of at most two.
- Read the full terms on the registration page.

## Honest limits
Prototype on synthetic data. No operator or customer has used it. Hindi speech models may misread numbers or names. Spoken confirmation can be given politely without checking.

## After the hackathon
One-hour cafe visit (questions in docs/ARCHITECTURE.md section 13), swap in open-source speech models behind the proxy, check terms, consent, and data-protection obligations before any public deployment, then think about pricing.
