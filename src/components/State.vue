<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <nav class="pill-tabs sub">
      <router-link exact class="pill" :to='{"name": "page.state.executor", params: { group: group, cluster: cluster } }'><i class="bi bi-play-circle"></i> Executor</router-link>
      <router-link exact class="pill" :to='{"name": "page.state.monitor", params: { group: group, cluster: cluster } }'><i class="bi bi-eye"></i> Monitor</router-link>
      <router-link exact class="pill" :to='{"name": "page.state.analyzer", params: { group: group, cluster: cluster } }'><i class="bi bi-cpu"></i> Analyzer</router-link>
      <router-link exact class="pill" :to='{"name": "page.state.anomaly_detector", params: { group: group, cluster: cluster } }'><i class="bi bi-exclamation-triangle"></i> Anomaly Detector</router-link>
    </nav>
    <router-view></router-view>
  </div>
</template>

<script>
export default {
  name: 'State',
  props: {
    group: String,
    cluster: String
  }
}
</script>
