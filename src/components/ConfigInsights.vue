<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <h4 class="page-title"><i class="bi bi-file-earmark-spreadsheet"></i> config.csv Insights</h4>
    <p class="small text-muted">The Cruise Control instances of <code>config.csv</code>, and how this UI reaches them.</p>
    <table class='table table-sm table-bordered'>
      <thead class="thead-light">
        <tr>
          <th>Group</th>
          <th>Instance</th>
          <th>CC API URL</th>
          <th title="The URL the browser calls">Absolute URL <i class="bi bi-question-circle help-icon"></i></th>
          <th title="Served from the same origin as this UI">Same Origin <i class="bi bi-question-circle help-icon"></i></th>
          <th title="A Cruise Control on another origin needs CORS enabled">CORS Needed <i class="bi bi-question-circle help-icon"></i></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if='records.length === 0'>
          <td colspan=6 class="text-muted">No records in <code>config.csv</code></td>
        </tr>
        <tr v-for='r in records' :key='r[3]' v-else>
          <td>{{ r[0] }}</td>
          <td>{{ r[1] }}</td>
          <td><code>{{ r[2] }}</code></td>
          <td><code>{{ r[3] }}</code></td>
          <td><boolean-el :label='r[5]'></boolean-el></td>
          <td><span :class="['badge', !r[5] ? 'badge-warning' : 'badge-light']">{{ !r[5] ? 'yes' : 'no' }}</span></td>
        </tr>
      </tbody>
    </table>
    <div class="alert alert-warning" v-if='corsRequired'>
      <b><i class="bi bi-exclamation-triangle"></i> CORS needed.</b> One or more URLs of <code>config.csv</code> are on another origin: enable CORS on those Cruise Control servers.
    </div>
    <p class="small text-muted" v-else><i class="bi bi-check-circle text-success"></i> Every URL is served from this UI's origin (<code>{{ origin }}</code>): no CORS setup needed.</p>
  </div>
</template>

<script>
import BooleanEL from '@/components/BooleanEL'
const Url = require('url-parse')
export default {
  name: 'ConfigInsights',
  components: {
    'boolean-el': BooleanEL
  },
  computed: {
    origin () {
      return Url('/').href
    },
    records () {
      const r = []
      Object.keys(this.$store.state.config).forEach((name) => {
        Object.keys(this.$store.state.config[name]).forEach((place) => {
          const url = this.$store.state.config[name][place]
          const origin = Url('/')
          const ccUrl = Url(url)
          let match = 0
          const props = ['protocol', 'hostname', 'port']
          props.forEach((k) => {
            if (origin[k] === ccUrl[k]) {
              match++
            }
          })
          r.push([name, place, url, ccUrl.href, origin, match === 3])
        })
      })
      return r
    },
    corsRequired () {
      let c = 0
      this.records.forEach((r) => {
        if (r[5]) {
          c++
        }
      })
      return !(this.records.length === c)
    }
  }
}
</script>
