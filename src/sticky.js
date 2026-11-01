// Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information.
// v-sticky: the tools of a panel (refresh, filter ...) float at the top of the window while the panel -- the element's
// parent -- is in view, below the floating tools of the panels around it. The parent gets --sticky-top: where the next
// floating thing goes, so the table headers inside float below the tools (glass.css). .is-stuck while it floats.

const bars = new Set()
let frame = null

// where the floating tools of the enclosing panels end
function outerTop (el) {
  const outer = el.parentElement && el.parentElement.parentElement
  return outer ? parseFloat(getComputedStyle(outer).getPropertyValue('--sticky-top')) || 0 : 0
}

function layout () {
  frame = null
  // the outer bars first (document order): an inner one floats below them
  Array.from(bars)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
    .forEach((el) => {
      const panel = el.parentElement
      if (!panel) return
      const top = outerTop(el)
      el.style.top = top + 'px'
      panel.style.setProperty('--sticky-top', (top + el.offsetHeight) + 'px')
      el.classList.toggle('is-stuck', el.offsetHeight > 0 && el.getBoundingClientRect().top <= top + 0.5 && panel.getBoundingClientRect().top < top - 0.5)
    })
}

function schedule () {
  if (!frame) frame = window.requestAnimationFrame(layout)
}

window.addEventListener('scroll', schedule, { passive: true })
window.addEventListener('resize', schedule)

export default {
  inserted (el) {
    el.classList.add('sticky-bar')
    bars.add(el)
    if (window.ResizeObserver) {
      el._stickyObserver = new ResizeObserver(schedule)
      el._stickyObserver.observe(el)
    }
    schedule()
  },
  componentUpdated: schedule,
  unbind (el) {
    bars.delete(el)
    if (el._stickyObserver) el._stickyObserver.disconnect()
    if (el.parentElement) el.parentElement.style.removeProperty('--sticky-top')
    schedule()
  }
}
