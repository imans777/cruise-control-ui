<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- One figure of a stats row (inside a .stat-grid): an icon, a label, the value (or the default slot) and an optional
     line below it (sub, or the sub slot). tone (primary, success, warning, danger, info) colors the accent; warning and
     danger also color the value. The styles are in glass.css. -->
<template>
  <div :class="['stat-tile', tone ? 'tone-' + tone : null, { wide }]">
    <div class="stat-label">
      <span v-if="icon" class="stat-icon"><i :class="['bi', icon]"></i></span>
      {{ label }}
    </div>
    <div class="stat-value"><slot>{{ value }}</slot></div>
    <div v-if="$scopedSlots.sub || sub" class="stat-sub"><slot name="sub">{{ sub }}</slot></div>
  </div>
</template>

<script>
export default {
  name: 'StatTile',
  props: {
    label: String,
    value: [String, Number],
    sub: String,
    icon: String,
    tone: String,
    wide: Boolean
  }
}
</script>
