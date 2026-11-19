// Widgets: the pictures a `layout` scene places in its parts. A widget is render(fields, w) -> html, where w gives the
// box it must fit ({ width, height }), the time its part enters, and the same cue and animation helpers a scene gets
// (selectors are scoped to the part). A widget whose height does not follow from the box calls w.fit(height).
import figure from './figure.mjs'
import units from './units.mjs'
import slots from './slots.mjs'
import meter from './meter.mjs'

export default { figure, units, slots, meter }
