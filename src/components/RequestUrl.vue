<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<!-- The REST call behind a page (Preferences: "Hide REST URL details" off), with a copy button -->
<template>
  <div v-if="url && !$store.state.hideHelperURL" class="request-line">
    <i class="bi bi-link-45deg"></i>
    <span class="request-line-label">REST call</span>
    <a :href="url" target="_blank" rel="noopener">{{ url }}</a>
    <button type="button" class="btn btn-sm btn-link p-0 ml-auto" :title="copied ? 'Copied' : 'Copy the URL'" @click="copy"><i :class="['bi', copied ? 'bi-check2' : 'bi-clipboard']"></i></button>
  </div>
</template>

<script>
export default {
  name: 'RequestUrl',
  props: {
    url: String
  },
  data () {
    return {
      copied: false
    }
  },
  methods: {
    copy () {
      const done = () => {
        this.copied = true
        setTimeout(() => { this.copied = false }, 1500)
      }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(this.url).then(done, () => {})
    }
  }
}
</script>
