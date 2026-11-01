<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- An error answer of Cruise Control (or of the browser): what failed, why, an optional hint (the default slot), and
     the details (stack trace, raw answer) behind a toggle, open by default with Preferences "Show Full Stack Traces" -->
<template>
  <div class="error-card" role="alert">
    <div class="error-head">
      <i class="bi bi-exclamation-octagon"></i>
      <b>{{ parsed.title }}</b>
      <span v-if="parsed.kind" class="badge badge-danger">{{ parsed.kind }}</span>
    </div>
    <div class="error-message">{{ parsed.message }}</div>
    <div v-if="$slots.default" class="error-hint"><i class="bi bi-lightbulb"></i><span><slot></slot></span></div>
    <div v-if="parsed.details" class="error-details">
      <a href="#" @click.prevent="open = !open"><i :class="['bi', open ? 'bi-chevron-down' : 'bi-chevron-right']"></i> {{ open ? 'Hide' : 'Show' }} details</a>
      <pre v-if="open"><code>{{ parsed.details }}</code></pre>
    </div>
  </div>
</template>

<script>
// "Error processing GET request '/load' due to: 'com.x.NotEnoughValidWindowsException: There are only 0 ...'."
const CC_ERROR = /^(?:Error processing|Cannot process) (\w+) request '([^']*)' due to: '([\s\S]*)'\.?$/
// "com.x.SomeException: message" -> SomeException, message
const CAUSE = /^(?:[\w$]+\.)*([\w$]+(?:Exception|Error))(?::\s*([\s\S]*))?$/

export default {
  name: 'Exception',
  props: {
    exception: [String, Object, Error]
  },
  data () {
    return {
      open: !!this.$store.state.showFullStackTrace
    }
  },
  computed: {
    parsed () {
      const e = this.exception
      const generic = 'Cruise Control answered with an error'
      if (e instanceof Error) return { title: 'The request failed', message: e.message, details: e.stack }
      if (e && typeof e === 'object' && e.errorMessage) {
        let title = generic
        let message = String(e.errorMessage)
        let kind = ''
        const m = message.match(CC_ERROR)
        if (m) {
          title = m[1] + ' ' + m[2] + ' failed'
          message = m[3]
        }
        const c = message.match(CAUSE)
        if (c) {
          kind = c[1]
          message = c[2] || c[1]
        }
        return { title, kind, message, details: e.stackTrace && e.stackTrace.length ? e.stackTrace : '' }
      }
      if (typeof e === 'string') return { title: generic, message: e }
      return { title: generic, message: 'An unexpected answer: see the details.', details: JSON.stringify(e, null, 2) }
    }
  }
}
</script>
