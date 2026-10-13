/**
 * The reviewer actions a user can record against one duplicate group, under
 * one specific rule. Purely a session-local label (see
 * ValidationSessionContext's `dispositions`) - it never changes how a group
 * is classified (DUPLICATE/POTENTIAL_DUPLICATE/UNIQUE) or any KPI count, and
 * it's kept entirely separate from the computed Explanation.
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
