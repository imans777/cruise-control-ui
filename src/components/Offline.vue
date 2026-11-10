<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div class="alert alert-warning" v-if='!isOnline()'>
    <i class="bi bi-wifi-off mr-1"></i> <b>Offline.</b> The pages show the last data loaded; they update once the network is back.
  </div>
</template>

<script>
export default {
  name: 'Offline',
  methods: {
    setOnline () {
      this.$store.commit('setonline', true)
    },
    setOffline () {
      this.$store.commit('setonline', false)
    },
    isOnline () {
      return this.$store.state.online
    }
  },
  created () {
    const vm = this
    window.addEventListener('online', vm.setOnline)
    window.addEventListener('offline', vm.setOffline)
  },
  beforeDestroy () {
    const vm = this
    window.removeEventListener('online', vm.setOnline)
    window.removeEventListener('offline', vm.setOffline)
  }
}
</script>
