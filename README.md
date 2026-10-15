# duplicate-validator

## Blank-looking placeholder values ("-")

Some source systems (this app was built against freight-invoice audit exports) use a lone dash as their universal "no value" token in a cell - across string, date, and amount columns alike - instead of leaving the cell genuinely empty. A cell containing nothing but dashes once trimmed (`-`, `--`, `" -   "`) is now treated as blank, the same as an empty or whitespace-only cell.

This matters most for SAME fields that are only populated while a record is in some active status - for example, an "Approved Amount" column that carries a real figure for an OPEN record but a dash placeholder once that same record is VOID or CLOSED. Without this, a voided record and its still-open duplicate would be compared as the literal strings `"-"` vs `"578.04"` and never match, even though the dash was never meant to be a real value at all.

A SAME field with a detected blank (dash-placeholder or otherwise) gets its "Allow blank" checkbox pre-checked in the Column Mapping panel - override it per field at any time. Enabling it promotes that field from a required exact match (SAME) to a comparison-only field (UNIQUE): records can still group together without it matching, and a genuine difference (including blank vs. a real value) downgrades a match from "Duplicate" to "Potential Duplicate" rather than being silently ignored.

## Chained "Root Id" references

A rule whose SAME fields include "Root Id" no longer requires every record in a family to carry the exact same Root Id value. In a multi-hop duplicate chain, one record's Root Id can point at a sibling record's own identifying value (its UNIQUE field, e.g. "Invoice Id") instead of at the family's ultimate shared root - record C's Root Id might equal record B's Invoice Id, while record B's Root Id equals record A's Invoice Id, so A/B/C are one family even though C's Root Id never literally equals A's.

Grouping now follows that chain: two records are only ever considered for chaining when they already agree on every OTHER SAME field (Invoice Number, Client Code, Amount, and so on), so a coincidental ID overlap between two genuinely unrelated invoices can never merge them. A rule that does not use a field literally named "Root Id" is completely unaffected. See `src/engine/ChainedFieldResolver.ts` for the implementation.

## Disposition

A reviewer can record one Disposition per duplicate group, per rule (Carrier Review, Client Review, Continue Processing, Reject Charge, Reject Invoice, Reject Shipment, Trax Review) from the dropdown in the group's detail view. It's a session-local label only - it never changes a group's DUPLICATE/POTENTIAL_DUPLICATE/UNIQUE classification or any KPI count. At export time, any record whose Disposition is set, and that has a non-blank "Audit ID" and an "Audit Exception Status" of Open, gets its Disposition written into the file's own existing "Add Action" column.

Every flagged group (DUPLICATE or POTENTIAL_DUPLICATE) is now pre-filled with a default Disposition the moment a validation run completes, based on which rule produced it: a rule whose Analysis is "Potential Duplicate" seeds `Carrier Review`, and a rule whose Analysis is "True Duplicate" (matched by substring, so "True Duplicate for denial" counts too) seeds `Reject Shipment`. A rule with no recognized Analysis, and UNIQUE groups under any rule, get no automatic Disposition. This is only a default - the dropdown still shows it as a normal selection, and picking a different option overwrites it exactly as if it had been manually set from the start. See `src/engine/AutoDisposition.ts`.

## Comments

A reviewer can also record one free-text Comment per duplicate group, per rule, from the text box next to Disposition - session-local, never affects classification, and (like Disposition) is written into the exported file's own "Add Comments" column for any record with a non-blank "Audit ID" and an "Audit Exception Status" of Open.

Comments are auto-filled the same way Disposition is, following this client's own established format: `Initials: MMDDYY : Type : Reason` - for example `JDC: 101626 : True Duplicate : Same Invoice No., Client Code, Carrier Code, Invoice Date, and Invoice Amount.` (note the asymmetric spacing: no space before the first colon, a space-colon-space between every segment after it). The pieces:

- **Initials** come from the "Reviewer" field in the header (top right of every page) - a one-time setting, persisted in the browser, that any auditor using this app sets to their own full name (e.g. "Juan Dela Cruz"). Initials are the first letter of each word, uppercased (e.g. "JDC"). Until a reviewer name is set, no comment is auto-filled at all, for any rule.
- **MMDDYY** is today's date (the date the group was validated), with no separators.
- **Type** is "True Duplicate" or "Potential Duplicate", from the same Analysis matching AutoDisposition uses.
- **Reason** is a fixed sentence configured per rule file, via a new recognized `"CommentReason"` field alongside `"level"` and `"Analysis"` in the rule's JSON (matched case-insensitively, exported back out through the Rules Library's "Export as JSON" action same as any other metadata). A rule with no `CommentReason` configured gets no auto-filled comment, same as a rule with no recognized Analysis. The four rule files this app ships with use their own client-confirmed or best-effort reason text - edit the `CommentReason` value directly in a rule's JSON (or re-upload a corrected copy) to change it.

This is only a default - the text box is a normal, freely-editable field, and typing over it (e.g. to add case-specific detail like a payment confirmation or check number) overwrites it exactly as if it had been typed from scratch. See `src/engine/AutoComment.ts`.

