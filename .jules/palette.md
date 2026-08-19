## 2025-05-18 - Canvas Game UI Inventory Modal Accessibility
**Learning:** Custom canvas/WebGL game UIs often render React modal overlays without standard ARIA dialog attributes (`role="dialog"`, `aria-modal="true"`) or `aria-label` descriptors on item grid slots, leaving screen reader users without context for grid interactions.
**Action:** Always wrap game overlay panels with proper ARIA dialog semantics, descriptive slot `aria-label`s (including item name and stack count), and explicit `focus-visible` outline rings for keyboard accessibility.
