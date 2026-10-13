import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { RecordComparison } from '@/components/RecordComparison'
import { DuplicateDetails } from './DuplicateDetails'
import { DispositionSelect } from './DispositionSelect'
import { CommentsField } from './CommentsField'
import type { Disposition, DuplicateGroup, RuleDefinition, RuleSet } from '@/types'

export interface RuleVerdictTabsProps {
  ruleDefinitions: RuleDefinition[]
  /** The group the user actually clicked in the table. */
  originalGroup: DuplicateGroup
  /** Which rule produced `originalGroup` - its tab starts active and never needs a lookup. */
  originalRuleDefinitionId: string
  /** rowIndex -> the (2+ record) group that row belongs to, per rule definition id. Singleton/UNIQUE rows are absent. */
  groupIndexByRule: Map<string, Map<number, DuplicateGroup>>
  /** The RuleSet actually used for each rule's run (unmapped fields excluded) - always used instead of a RuleDefinition's own ruleSet when coloring a result. */
  effectiveRuleSetByRule: Map<string, RuleSet>
  /** Reviewer dispositions recorded so far, keyed by ruleDefinitionId then groupId. */
  dispositions: Map<string, Map<string, Disposition>>
  onSetDisposition: (ruleDefinitionId: string, groupId: string, disposition: Disposition | null) => void
  /** Reviewer comments recorded so far, keyed by ruleDefinitionId then groupId. */
  comments: Map<string, Map<string, string>>
  onSetComment: (ruleDefinitionId: string, groupId: string, comment: string) => void
}

/** Finds the real group under `ruleDefinitionId` that contains every one of `originalGroup`'s records, if one exists. */
function resolveGroupForRule(
  originalGroup: DuplicateGroup,
  ruleDefinitionId: string,
  groupIndexByRule: Map<string, Map<number, DuplicateGroup>>
): DuplicateGroup | null {
  const index = groupIndexByRule.get(ruleDefinitionId)
  if (!index) return null

  const rowIndices = originalGroup.records.map((r) => r.rowIndex)
  const candidate = index.get(rowIndices[0])
  if (!candidate) return null

  const candidateRows = new Set(candidate.records.map((r) => r.rowIndex))
  return rowIndices.every((ri) => candidateRows.has(ri)) ? candidate : null
}

function RuleVerdictPanel({
  group,
  ruleSet,
  disposition,
  onDispositionChange,
  comment,
  onCommentChange,
}: {
  group: DuplicateGroup
  ruleSet: RuleSet
  disposition: Disposition | null
  onDispositionChange: (disposition: Disposition | null) => void
  comment: string
  onCommentChange: (comment: string) => void
}) {
  return (
    <div className="space-y-4">
      <DuplicateDetails group={group} />
      <DispositionSelect value={disposition} onChange={onDispositionChange} />
      <CommentsField value={comment} onChange={onCommentChange} />
      <div>
        <p className="mb-2 text-sm font-medium">Record Comparison</p>
        <RecordComparison group={group} ruleSet={ruleSet} />
      </div>
    </div>
  )
}

/**
 * One tab per uploaded rule inside the Group Details modal. Every rule ran
 * its own independent duplicate check, so records grouped together under
 * the rule the user clicked in the table are not guaranteed to group the
 * same way under another rule - a different SAME/UNIQUE split could group
 * these same rows together (possibly plus extra ones the first rule didn't
 * pull in), split them apart, or not flag them as a duplicate at all.
 *
 * The originating rule's tab always shows the real, already-computed group
 * exactly as before. Every other tab looks up whether these exact records
 * are ALSO grouped together under that rule's own real results - if so, it
 * shows that rule's own real group (looked up, never recomputed - so it
 * stays perfectly consistent with that rule's own Results tab). If not, it
 * says so plainly and falls back to a plain comparison of the
 * originally-clicked records, colored using the other rule's own field
 * definitions, so the user can see why they weren't grouped together under it.
 */
export function RuleVerdictTabs({
  ruleDefinitions,
  originalGroup,
  originalRuleDefinitionId,
  groupIndexByRule,
  effectiveRuleSetByRule,
  dispositions,
  onSetDisposition,
  comments,
  onSetComment,
}: RuleVerdictTabsProps) {
  const resolvedByRule = useMemo(() => {
    const map = new Map<string, DuplicateGroup | null>()
    for (const def of ruleDefinitions) {
      map.set(
        def.id,
        def.id === originalRuleDefinitionId ? originalGroup : resolveGroupForRule(originalGroup, def.id, groupIndexByRule)
      )
    }
    return map
  }, [ruleDefinitions, originalGroup, originalRuleDefinitionId, groupIndexByRule])

  // Always prefer the RuleSet actually used for that rule's run - falls
  // back to the rule's own ruleSet defensively (should never be needed,
  // since every rule in `ruleDefinitions` has a matching outcome by now).
  const ruleSetFor = (def: RuleDefinition) => effectiveRuleSetByRule.get(def.id) ?? def.ruleSet
  const dispositionFor = (ruleDefinitionId: string, groupId: string): Disposition | null =>
    dispositions.get(ruleDefinitionId)?.get(groupId) ?? null
  const commentFor = (ruleDefinitionId: string, groupId: string): string => comments.get(ruleDefinitionId)?.get(groupId) ?? ''

  if (ruleDefinitions.length <= 1) {
    const def = ruleDefinitions[0]
    if (!def) return null
    return (
      <RuleVerdictPanel
        group={originalGroup}
        ruleSet={ruleSetFor(def)}
        disposition={dispositionFor(def.id, originalGroup.id)}
        onDispositionChange={(disposition) => onSetDisposition(def.id, originalGroup.id, disposition)}
        comment={commentFor(def.id, originalGroup.id)}
        onCommentChange={(comment) => onSetComment(def.id, originalGroup.id, comment)}
      />
    )
  }

  return (
    <Tabs defaultValue={originalRuleDefinitionId}>
      <TabsList>
        {ruleDefinitions.map((def) => (
          <TabsTrigger key={def.id} value={def.id}>
            {def.metadata?.analysis ?? def.fileName}
          </TabsTrigger>
        ))}
      </TabsList>
      {ruleDefinitions.map((def) => {
        const resolved = resolvedByRule.get(def.id) ?? null
        return (
          <TabsContent key={def.id} value={def.id} className="space-y-4">
            {resolved ? (
              <RuleVerdictPanel
                group={resolved}
                ruleSet={ruleSetFor(def)}
                disposition={dispositionFor(def.id, resolved.id)}
                onDispositionChange={(disposition) => onSetDisposition(def.id, resolved.id, disposition)}
                comment={commentFor(def.id, resolved.id)}
                onCommentChange={(comment) => onSetComment(def.id, resolved.id, comment)}
              />
            ) : (
              <>
                <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    These records were not flagged as a duplicate under this rule. The comparison below is colored
                    using this rule&apos;s own SAME/UNIQUE/OPTIONAL fields so you can see why.
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">Record Comparison</p>
                  <RecordComparison group={originalGroup} ruleSet={ruleSetFor(def)} />
                </div>
              </>
            )}
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
