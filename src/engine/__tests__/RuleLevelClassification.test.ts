import { describe, it, expect } from 'vitest'
import { classifyRuleLevel } from '../RuleLevelClassification'

describe('classifyRuleLevel', () => {
  it('classifies an Invoice-level label', () => {
    expect(classifyRuleLevel('Invoice_level')).toBe('invoice')
  })

  it('classifies a Shipment-level label', () => {
    expect(classifyRuleLevel('Shipment_level')).toBe('shipment')
  })

  it('classifies a Charge-level label', () => {
    expect(classifyRuleLevel('Charge_level')).toBe('charge')
  })

  it('matches case/punctuation-insensitively', () => {
    expect(classifyRuleLevel('SHIPMENT-LEVEL')).toBe('shipment')
    expect(classifyRuleLevel('charge level')).toBe('charge')
  })

  it('matches a custom label with extra text, like this project\'s own relabeled Profile 5/6 rules', () => {
    expect(classifyRuleLevel('Invoice_level (Profile 6)')).toBe('invoice')
    expect(classifyRuleLevel('Invoice_level (Profile 5)')).toBe('invoice')
  })

  it('returns null for undefined, blank, or unrecognized level text', () => {
    expect(classifyRuleLevel(undefined)).toBeNull()
    expect(classifyRuleLevel('')).toBeNull()
    expect(classifyRuleLevel('   ')).toBeNull()
    expect(classifyRuleLevel('Profile 6')).toBeNull()
  })

  it('prefers "invoice" when a label somehow contains more than one keyword', () => {
    expect(classifyRuleLevel('Invoice and Shipment level')).toBe('invoice')
  })
})
