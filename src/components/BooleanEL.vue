<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <!-- true / "ready...": a green badge; anything else: the value, muted (it was left blank) -->
  <span :class='className'>{{ label === undefined || label === null || label === '' ? '—' : String(label) }}</span>
</template>

<script>
export default {
  name: 'BooleanEL',
  props: {
    label: [Boolean, String]
  },
  computed: {
    isTrue () {
      return this.label === true || (typeof this.label === 'string' && /^ready/i.test(this.label))
    },
    className () {
      return this.isTrue ? 'badge badge-success' : 'badge badge-light'
    }
  }
}
</script>
