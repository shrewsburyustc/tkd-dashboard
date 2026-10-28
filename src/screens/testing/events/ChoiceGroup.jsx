// ChoiceGroup.jsx — the old address of the "pick one" button row (ChoiceGroup).
// Why it exists: every section uses it, so it moved to src/components/ChoiceGroup.jsx in Dashboard
// core step 1 (rulebook v1.030). This file only keeps the old import path working (no logic
// here); each section switches its imports in its own prompt.
//
//   import ChoiceGroup from '…/components/ChoiceGroup.jsx';   // the new address
export { default } from '../../../components/ChoiceGroup.jsx';
