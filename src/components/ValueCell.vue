<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- A table value: text (default: value) with its unit dimmed ("1.45 GB", "12.00 %"); what follows the unit stays as
     it is ("7.87 % (broker 2, /d3)"); a value of 0 is dimmed as a whole. The styles are in glass.css. -->
<template>
  <span :class="['value-cell', { zero: isZero }]">{{ parts.number }}{{ parts.unit ? ' ' : '' }}<span v-if="parts.unit" class="value-unit">{{ parts.unit }}</span>{{ parts.rest ? ' ' + parts.rest : '' }}</span>
</template>

<script>
export default {
  name: 'ValueCell',
  props: {
    value: [Number, String],
    text: [Number, String]
  },
  computed: {
    parts () {
      const shown = this.text !== undefined && this.text !== null ? String(this.text) : (this.value === undefined || this.value === null ? '' : String(this.value))
      // number, unit (one word, or "%"), the rest
      const m = shown.trim().match(/^(-?[\d.,]+)\s*([^\s(]*)\s*(.*)$/)
      return m ? { number: m[1], unit: m[2] || '', rest: m[3] || '' } : { number: shown.trim(), unit: '', rest: '' }
    },
    isZero () {
      return this.value !== '' && this.value !== null && this.value !== undefined && Number(this.value) === 0
    }
  }
}
</script>
