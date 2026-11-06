<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- A page waiting for its first answer from Cruise Control -->
<template>
  <div class="loading-state" role="status">
    <span class="spinner-border text-primary"></span>
    <span>{{ label }}</span>
  </div>
</template>

<script>
export default {
  name: 'LoadingState',
  props: {
    label: { type: String, default: 'Loading ...' }
  }
}
</script>
