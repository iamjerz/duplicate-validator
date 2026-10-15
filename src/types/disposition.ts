/**
 * The reviewer actions a user can record against one duplicate group, under
 * one specific rule. Purely a session-local label (see
 * ValidationSessionContext's `dispositions`) - it never changes how a group
 * is classified (DUPLICATE/POTENTIAL_DUPLICATE/UNIQUE) or any KPI count, and
 * it's kept entirely separate from the computed Explanation.
 *
 * Every flagged group is now pre-filled with a default Disposition the
 * moment a validation run completes, based on which rule produced it (see
 * AutoDisposition.ts): a rule whose Analysis is "Potential Duplicate" seeds
 * 'Carrier Review', and a rule whose Analysis is "True Duplicate" (e.g.
 * "True Duplicate for denial") seeds 'Reject Shipment'. This is only a
 * default - DispositionSelect still lets a reviewer change it to any other
 * option afterward, same as a manually-picked one.
 */
export const DISPOSITION_OPTIONS = [
  'Carrier Review',
  'Client Review',
  'Continue Processing',
  'Reject Charge',
  'Reject Invoice',
  'Reject Shipment',
  'Trax Review',
] as const

export type Disposition = (typeof DISPOSITION_OPTIONS)[number]
