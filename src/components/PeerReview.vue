<template>
  <div>
    <request-url :url="url" />
    <div v-sticky class="toolbar">
      <refresh-button label="Refresh Reviews" :loading="loading" @click="getReviews()" />
    </div>
    <div v-if='error'>
      <!-- the usual case: the cluster does not use reviews -->
      <div v-if="twoStepOff" class="card card-body text-center empty-state">
        <i class="bi bi-people empty-icon"></i>
        <h5>Peer reviews are off on this Cruise Control</h5>
        <p class="text-muted mb-0">They need <code>two.step.verification.enabled=true</code> in its configuration: then each POST request waits here for a second person's approval.</p>
      </div>
      <exception v-else :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <async-task :asyncData='asyncData'></async-task>
    </div>
    <div v-else-if='!loaded && loading'>
      <loading-state />
    </div>
    <div v-else>
      <table class="table table-sm table-bordered">
        <thead class='thead-light'>
          <tr>
            <th class="select-col" title="Pending reviews can be selected, then approved or discarded"><i class="bi bi-check2-square"></i></th>
            <th>Id</th>
            <th>Submitted</th>
            <th>Status</th>
            <th>Reason</th>
            <th>Request</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if='reviews.length == 0'>
            <td colspan=7 class="text-muted">No reviews yet: a POST request waits here for approval.</td>
          </tr>
          <tr v-for='r in reviews' :key='r.Id' v-else :class="{ 'pick-row': isPending(r), picked: selectedIds.includes(r.Id) }" @click="toggleRow(r, $event)">
            <td class="select-col">
              <input v-if='isPending(r)' type='checkbox' v-model='selectedIds' :value='r.Id' :aria-label="'Select review ' + r.Id">
            </td>
            <td><span class="id-pill">{{ r.Id }}</span></td>
            <td class="text-nowrap" :title="(new Date(parseInt(r.SubmissionTimeMs, 10))).toLocaleString()">{{ r.SubmissionTimeMs | formatLocalTime }}<div class="small text-muted">{{ r.SubmitterAddress }}</div></td>
            <td><span :class='statusLabel(r.Status)'>{{ r.Status }}</span></td>
            <td>{{ r.Reason }}</td>
            <td class="request" :title="r.EndpointWithParams">
              <span v-if="request(r).method" :class="['method', request(r).method === 'POST' ? 'post' : 'get']">{{ request(r).method }}</span>
              <b>{{ request(r).endpoint }}</b>
              <span class="params">{{ request(r).params }}</span>
            </td>
            <td class="text-nowrap">
              <button v-if='r.Status == "APPROVED"' @click.prevent='submitApprovedRequest(r)' class='btn btn-sm btn-primary' title="Send the approved request to Cruise Control"><i class="bi bi-send"></i> Submit</button>
            </td>
          </tr>
        </tbody>
      </table>
      <!-- the selected pending reviews: approve or discard them, with a reason -->
      <div class="card card-body review-actions" v-if='selectedIds.length > 0'>
        <span><b>{{ selectedIds.length }}</b> selected <span class="text-muted">({{ selectedIds.map(i => '#' + i).join(', ') }})</span></span>
        <input type="text" class="form-control form-control-sm reason-input" placeholder="Reason (optional)" v-model='actionReason'>
        <button class='btn btn-sm btn-success' @click.prevent="actionName = 'approve'; doAction()"><i class="bi bi-check2"></i> Approve</button>
        <button class='btn btn-sm btn-outline-danger' @click.prevent="actionName = 'discard'; doAction()"><i class="bi bi-x-lg"></i> Discard</button>
        <a href="#" class="small" @click.prevent="selectedIds = []">clear</a>
      </div>
      <div v-if='posted'>
        <div v-if='!postResponse' class="alert alert-info"><div class="spinner-border spinner-border-sm text-primary mr-2" role="status"></div> Waiting for Response ...</div>
        <exception v-else-if='postError' :exception='postResponse'></exception>
        <div v-else class="alert alert-success alert-dismissible">
          <b>Submitted.</b> <span class="response-value">{{ typeof postResponse === 'string' ? postResponse : JSON.stringify(postResponse) }}</span>
          <button type="button" class="close" title="Clear Response" @click='clearPostResponse'>&times;</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import parse from 'url-parse'
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'

export default {
  name: 'PeerReview',
  props: {
    group: String,
    cluster: String
  },
  data () {
    return {
      loading: false,
      loaded: false,
      error: false,
      errorData: null,
      async: false,
      asyncData: null,
      argsRetryTimer: null,
      asyncRetryTimer: null,
      selectedIds: [],
      actionName: '',
      actionReason: '',
      reviews: [],
      posted: false,
      postError: false,
      postResponse: null
    }
  },
  created () {
    this.argsChanged()
  },
  beforeDestroy () {
    if (this.argsRetryTimer) {
      clearTimeout(this.argsRetryTimer)
    }
    if (this.asyncRetryTimer) {
      clearTimeout(this.asyncRetryTimer)
    }
  },
  watch: {
    group: function (ogroup, ngroup) {
      this.argsChanged()
    },
    cluster: function (ocluster, ncluster) {
      this.argsChanged()
    }
  },
  methods: {
    argsChanged (retries) {
      retries = retries || 0
      const newurl = this.$store.getters.getnewurl(this.group, this.cluster)
      if (!newurl) {
        if (retries < ARGS_RETRY_MAX) {
          this.argsRetryTimer = setTimeout(() => this.argsChanged(retries + 1), ARGS_RETRY_DELAY)
        }
        return
      }
      this.$store.commit('seturl', newurl)
      this.loaded = false
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      this.getReviews()
    },
    getReviews () {
      const vm = this
      vm.loading = true
      vm.selectedIds = []
      fetchCC(vm.url).then((result) => {
        if (result.type === 'empty') {
          vm.loading = false
          vm.error = true
          vm.errorData = 'CruiseControl sent an empty response with ' + result.status + ' status code.'
        } else if (result.type === 'async') {
          vm.loading = false
          vm.async = true
          vm.asyncData = result.data
          if (vm.asyncRetryTimer) clearTimeout(vm.asyncRetryTimer)
          vm.asyncRetryTimer = setTimeout(() => vm.getReviews(), ASYNC_RETRY_DELAY)
        } else if (result.type === 'error') {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.loading = false
          vm.error = true
          vm.errorData = result.data
        } else {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.async = false
          vm.loading = false
          vm.error = false
          vm.errorData = null
          vm.reviews = result.data.RequestInfo || []
          vm.loaded = true
        }
      }).catch((e) => {
        if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
        vm.loading = false
        vm.error = true
        vm.errorData = e.message || e
      })
    },
    doAction () {
      if (!this.actionName) return
      const vm = this
      vm.$http.post(vm.action_url, null, { withCredentials: true }).then((r) => {
        vm.getReviews()
      }).catch((e) => {
        vm.error = true
        vm.errorData = e && e.response ? e.response.data : (e.message || e)
      })
    },
    submitApprovedRequest (r) {
      const action = r.EndpointWithParams
      const absUrl = this.reconstructURL(action, r.Id)
      const vm = this
      vm.posted = true
      vm.postResponse = null
      vm.$http.post(absUrl, null, { withCredentials: true }).then((r) => {
        vm.postError = false
        vm.postResponse = r.data || 'Cruise Control did not send a valid response. Check the server logs.'
        vm.getReviews()
      }, (e) => {
        vm.postError = true
        vm.postResponse = (e && e.response && e.response.data) || e || 'Cruise Control did not send a valid response. Check the server logs.'
        vm.getReviews()
      })
    },
    statusLabel (s) {
      if (s === 'APPROVED') return 'badge badge-success'
      if (s === 'SUBMITTED') return 'badge badge-primary'
      if (s === 'PENDING_REVIEW') return 'badge badge-warning'
      return 'badge badge-secondary'
    },
    isPending (r) {
      return !!(r.Status && r.Status.match(/PENDING_REVIEW/))
    },
    // a click on a pending review's row (but on its controls) selects it
    toggleRow (r, event) {
      if (!this.isPending(r) || event.target.closest('input, a, button')) return
      this.selectedIds = this.selectedIds.includes(r.Id) ? this.selectedIds.filter(x => x !== r.Id) : this.selectedIds.concat([r.Id])
    },
    // "POST /kafkacruisecontrol/rebalance?dryrun=false&json=true" -> POST, rebalance, dryrun=false
    request (r) {
      const m = String(r.EndpointWithParams || '').match(/^(?:(\w+)\s+)?\S*?\/?([\w_]+)(?:\?(.*))?$/)
      if (!m) return { method: '', endpoint: r.EndpointWithParams, params: '' }
      return { method: m[1] || '', endpoint: m[2], params: (m[3] || '').split('&').filter(p => p && p !== 'json=true').join(' · ') }
    },
    reconstructURL (u, id) {
      const url = this.$store.state.url
      const parsed = parse(url + u, true)
      const existing = parsed.query || {}
      existing.review_id = id
      parsed.set('query', existing)
      return parsed.toString()
    },
    clearPostResponse () {
      this.posted = false
      this.postResponse = ''
      this.postError = false
    }
  },
  computed: {
    twoStepOff () {
      return JSON.stringify(this.errorData || '').includes('two.step.verification.enabled')
    },
    action_url () {
      // POST /kafkacruisecontrol/review?
      //    json=[true/false]
      //    &approve=[id1,id2,...]
      //    &discard=[id1,id2,...]
      //    &reason=[reason-for-review]
      const params = {
        json: true,
        reason: this.actionReason
      }
      params[this.actionName] = this.selectedIds
      return this.$helpers.getURL('review', params)
    },
    url () {
      const params = { json: 'true' }
      // Previously this end point is /review with POST method, in later versions its changed to /review_board with GET method
      // See https://github.com/linkedin/cruise-control/blob/3a97169c7a49859cf60675ef37a23e35ed35f30e/docs/wiki/User%20Guide/2-step-verification-for-POST-requests.md
      return this.$helpers.getURL('review_board', params)
    },
    hideHelperURL () {
      return this.$store.state.hideHelperURL
    }
  }
}
</script>

<style scoped>
.select-col { width: 42px; text-align: center; }
.pick-row { cursor: pointer; }
.pick-row.picked, .pick-row.picked:hover { background: var(--primary-soft); }
.review-actions { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 1rem; padding: 10px 14px; border-left: 3px solid var(--primary); }
.reason-input { width: 280px; }
.request { font-size: 0.82rem; word-break: break-all; }
.request b { color: var(--text-strong); font-weight: 600; }
.request .params { margin-left: 6px; color: var(--muted); font-family: var(--mono); font-size: 0.76rem; }
.method { display: inline-block; min-width: 40px; margin-right: 6px; padding: 0 6px; border-radius: 5px; font-family: var(--mono); font-size: 0.7rem; font-weight: 700; text-align: center; }
.method.get { background: var(--info-soft); color: var(--info); }
.method.post { background: var(--warning-soft); color: var(--warning); }
</style>
