<!-- Copyright 2017-2019 LinkedIn Corp. Licensed under the BSD 2-Clause License (the "License"). See License in the project root for license information. -->
<template>
  <div>
    <div v-sticky class="toolbar">
      <refresh-button label="Refresh Broker Details" :loading="loading" @click="getKafkaState()" />
    </div>
    <div v-if='!loading && !detectedUserTaskId' class='alert alert-danger'>
      <strong>User-Task-ID</strong> header is not found in the response from the server. If you are using <a target=_blank href='https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS'>CORS</a>, please add necessary configuration to your Cruise Control as described <a target=_blank href='https://github.com/linkedin/cruise-control-ui/wiki/CORS-Method'>in this wiki.</a>
    </div>
    <div v-if='error'>
      <exception :exception='errorData'></exception>
    </div>
    <div v-else-if='async'>
      <async-task :asyncData='asyncData'>
        <button v-if='showAsyncRefreshButton' class="btn btn-sm btn-outline-secondary" @click='getKafkaState()'><i class="bi bi-arrow-clockwise"></i> Check now</button>
      </async-task>
    </div>
    <div v-else-if="!loaded && loading">
      <loading-state />
    </div>
    <div v-else-if='loaded'>
      <!-- 1. pick an action -->
      <div class="action-picker">
        <div v-for="g in actionGroups" :key="g.label" class="action-group">
          <div class="group-label">{{ g.label }}</div>
          <div class="action-cards">
            <button v-for="a in g.actions" :key="a.key" type="button" :class="['action-card', { active: activeCard === a.key }]" @click="chooseAction(a.key)">
              <i :class="['bi', a.icon]"></i>
              <span class="action-text"><b>{{ a.title }}</b><small>{{ a.blurb }}</small></span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. the guided panel of the chosen action: targets, options, review -->
      <div v-if="currentCard" :class="['card', 'action-panel', 'tone-' + currentCard.tone]">
        <div class="card-header">
          <i :class="['bi', currentCard.icon, 'mr-2']"></i>{{ currentCard.title }}
          <div class="panel-desc">{{ currentCard.description }}</div>
        </div>
        <div class="card-body">
          <div v-if="fixContext && fixContext.action === activeCard" class="alert alert-info small fix-note">
            <i class="bi bi-tools"></i> From Cluster Load, <b>Fix "{{ fixContext.limit }}"</b><template v-if="fixContext.brokers.length"> for broker{{ fixContext.brokers.length > 1 ? 's' : '' }} {{ fixContext.brokers.join(', ') }}</template>:
            the dry run below shows what it would do; review it, then Execute.
          </div>
          <section v-if="targetMode" class="step">
            <h6 :class="['collapse-title', 'targets-title', { open: targetsOpen }]" role="button" :aria-expanded="targetsOpen ? 'true' : 'false'" :title="targetsOpen ? 'Fold the table (the selection stays)' : 'Show the table'" @click="targetsOpen = !targetsOpen">
              <i class="bi bi-chevron-right chev"></i><span class="step-no">1</span> Targets <small class="text-muted font-weight-normal">{{ targetHint }}</small>
            </h6>
            <div v-sticky class="form-inline mb-2 targets-bar">
              <input v-if="targetsOpen" type="text" class="form-control form-control-sm filter-input" v-model="adminFilterText" placeholder="Filter: broker ids (e.g. 1, 3) or host / rack" title="Comma- or space-separated: a number matches the broker ids containing it and the rack equal to it, any other text a part of the host or rack">
              <div v-if="actionName === 'demote'" class="btn-group btn-group-sm ml-3" role="group" aria-label="Demote">
                <button type="button" :class="['btn', enableLogDirSelection ? 'btn-outline-secondary' : 'btn-primary']" @click="setLogDirSelection(false)">Brokers</button>
                <button type="button" :class="['btn', enableLogDirSelection ? 'btn-primary' : 'btn-outline-secondary']" @click="setLogDirSelection(true)">Disks</button>
              </div>
              <span :class="['small', 'selection', { 'ml-3': targetsOpen || actionName === 'demote' }]">
                <template v-if="enableLogDirSelection">Selected disks: <b>{{ brokerIdAndLogDirs.length ? brokerIdAndLogDirs.join(', ') : 'none' }}</b></template>
                <template v-else>Selected brokers: <b>{{ selectedBrokers.length ? selectedBrokers.join(', ') : 'none' }}</b></template>
                <a v-if="selectedBrokers.length || brokerIdAndLogDirs.length" href="#" class="ml-2" @click.prevent="selectedBrokers = []; selectedLogDirs = {}">clear</a>
                <a v-if="!targetsOpen" href="#" class="ml-2" @click.prevent="targetsOpen = true">show the table</a>
              </span>
            </div>
      <table v-if="targetsOpen" class="table table-sm table-bordered">
        <thead class="thead-light">
          <tr>
            <th @click='sortAdmin("bid")' style="cursor:pointer">Broker</th>
            <th @click='sortAdmin("host")' style="cursor:pointer">Host</th>
            <th @click='sortAdmin("rack")' style="cursor:pointer">Rack</th>
            <th @click='sortAdmin("state")' style="cursor:pointer">State</th>
            <th @click='sortAdmin("replicas")' style="cursor:pointer">#Replicas</th>
            <th @click='sortAdmin("leaders")' style="cursor:pointer">#Leaders</th>
            <th @click='sortAdmin("outofsync")' style="cursor:pointer">#Out of Sync Replicas</th>
            <template v-if='KafkaBrokerState.OfflineReplicaCountByBrokerId'>
              <!-- kafka 2.0 bits -->
              <th>#Offline Replicas</th>
              <th>#Online LogDirs</th>
              <th>#Offline LogDirs</th>
            </template>
            <th v-if="!enableLogDirSelection" class="select-col">
              <label class="mb-0" title="Select all the brokers shown"><input type="checkbox" :checked="filteredAdminBrokers.length > 0 && filteredAdminBrokers.every(r => selectedBrokers.includes(r.bid))" @change="selectedBrokers=$event.target.checked?filteredAdminBrokers.map(r=>r.bid):[]; selectedLogDirs={}"> All</label>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for='row in filteredAdminBrokers' :key='row.bid' :class="{ 'pick-row': !enableLogDirSelection, picked: !enableLogDirSelection && selectedBrokers.includes(row.bid) }" @click="toggleBrokerRow(row.bid, $event)">
            <td><span :class="['id-pill', { hit: adminFilter.hitId(row.bid) }]">{{ row.bid }}</span></td>
            <td><hit-text :text="row.host" :filter="adminFilter" /></td>
            <td><hit-text v-if="row.rack" :text="row.rack" :filter="adminFilter" rack /><template v-else>N/A</template></td>
            <td><broker-state :state='row.state'></broker-state></td>
            <td><value-cell :value="row.replicas" /></td>
            <td :class='!row.leaders ? "table-danger" : null'><value-cell :value="row.leaders" /></td>
            <td :class='row.outofsync > 0 ? "table-danger" : "muted-zero"'>{{ row.outofsync }}</td>
            <template v-if='KafkaBrokerState.OfflineReplicaCountByBrokerId'>
              <td :class='row.offlineReplicas ? "table-danger" : null'>
                {{ row.offlineReplicas }}
              </td>
              <td>
                <template v-if="enableLogDirSelection">
                  <label v-for="logdir in (KafkaBrokerState.OnlineLogDirsByBrokerId[row.bid] || [])" :key="logdir" :class="['logdir-check', { picked: selectedLogDirs[`${row.bid}-${logdir}`] }]">
                    <input type="checkbox" v-model="selectedLogDirs[`${row.bid}-${logdir}`]" @change="selectedBrokers=[]">
                    <code>{{ logdir }}</code>
                  </label>
                  <span v-if="!(KafkaBrokerState.OnlineLogDirsByBrokerId[row.bid] || []).length">-</span>
                </template>
                <template v-else>{{ row.onlineLogDirs }}</template>
              </td>
              <td :class='row.offlineLogDirs > 0 ? "table-danger" : null'>
                <template v-if="enableLogDirSelection">
                  <div v-for="logdir in (KafkaBrokerState.OfflineLogDirsByBrokerId[row.bid] || [])" :key="logdir">
                    <code>{{ logdir }}</code>
                  </div>
                  <span v-if="!(KafkaBrokerState.OfflineLogDirsByBrokerId[row.bid] || []).length">-</span>
                </template>
                <template v-else>{{ row.offlineLogDirs }}</template>
              </td>
            </template>
            <td v-if="!enableLogDirSelection" class="select-col">
              <input type="checkbox" v-model="selectedBrokers" :value='row.bid' @change="selectedLogDirs={}"/>
            </td>
          </tr>
        </tbody>
      </table>

          </section>

          <section class="step">
            <h6>
              <span class="step-no">{{ targetMode ? 2 : 1 }}</span> Options
              <small class="text-muted font-weight-normal">(empty = Cruise Control's defaults)</small>
              <span v-if="optionGroups.length || optionsSetCount" class="float-right small font-weight-normal">
                <template v-if="optionGroups.length"><a href="#" @click.prevent="setAllGroups(true)">expand all</a> &middot; <a href="#" @click.prevent="setAllGroups(false)">collapse all</a></template>
                <template v-if="optionsSetCount"><template v-if="optionGroups.length"> &middot; </template><a href="#" @click.prevent="resetOptions">reset to defaults</a></template>
              </span>
            </h6>

            <!-- required: Topic Configuration -->
            <div class="form-row mb-2" v-if="actionName === 'topic_configuration'">
              <div class="col-md-4">
                <label class="form-label">Topic Regex <span class="text-danger">*</span></label>
                <topic-input v-model='topic_regex' placeholder='e.g. orders|payments' />
              </div>
              <div class="col-md-3">
                <label class="form-label">Replication Factor <span class="text-danger">*</span></label>
                <input class="form-control form-control-sm" type='number' min=1 v-model='replication_factor' placeholder='e.g. 3'>
              </div>
            </div>

            <!-- Preferred Leader Election -->
            <div class="form-row" v-if="actionName === 'ple'">
              <div class="col-md-4">
                <label class="form-label">Concurrent Leader Movements</label>
                <input type="number" class="form-control form-control-sm" v-model='concurrent_leader_movements' placeholder='(CC Default)'>
              </div>
            </div>

            <!-- Demote brokers / disks -->
            <div class="form-row" v-if="actionName === 'demote'">
              <div class="col-md-3">
                <label class="form-label">Concurrent Leader Movements</label>
                <input type="number" class="form-control form-control-sm" v-model='concurrent_leader_movements' placeholder='(CC Default)'>
              </div>
              <div class="col-md-3">
                <label class="form-label">Replication Throttle</label>
                <throttle-input v-model='replication_throttle' />
              </div>
              <div class="col-md-3">
                <label class="form-label" title="Applied only when executing (ignored by a dry run)">Replica Movement Strategies <i class="bi bi-question-circle help-icon"></i></label>
                <strategy-picker v-model='replica_movement_strategies' />
              </div>
              <div class="col-md-3 pt-4">
                <label class="chip-check"><input type="checkbox" v-model='disallow_capacity_estimation'> Disallow Capacity Estimation</label>
              </div>
            </div>
            <div v-if="actionName === 'demote'" class="opt-sub demote-partitions">
              <div class="opt-sub-title"><i class="bi bi-diagram-3"></i> Partitions</div>
              <div class="chip-row mb-2">
                <label class="chip-check" title="skip_urp_demotion=false. Cruise Control skips every under-replicated partition by default. With this, such a partition is demoted to an in-sync replica on another broker; one without an in-sync replica there keeps its leader."><input type="checkbox" v-model='demote_urp'> Demote Under-Replicated Partitions <i class="bi bi-question-circle help-icon"></i></label>
                <label class="chip-check" title="exclude_follower_demotion=false: the followers on the selected brokers or disks also move to the end of their replica lists, so they are not preferred later. Their leaders stay."><input type="checkbox" v-model='demote_followers'> Demote Followers Too <i class="bi bi-question-circle help-icon"></i></label>
              </div>
              <div class="form-row">
                <div class="col-md-5">
                  <label class="form-label">Excluded Topics <b title="These topics keep their leadership and replica order (regex). Mutually exclusive with Included Topics."><i class="bi bi-question-circle help-icon"></i></b></label>
                  <topic-input v-model='excluded_topics' placeholder='(none)' :disabled='!!included_topics' />
                </div>
                <div class="col-md-5">
                  <label class="form-label">Included Topics <b title="Only these topics are demoted (full-match regex); the others keep their leadership and replica order. Mutually exclusive with Excluded Topics."><i class="bi bi-question-circle help-icon"></i></b></label>
                  <topic-input v-model='included_topics' placeholder='(all)' :disabled='!!excluded_topics' />
                </div>
              </div>
            </div>

            <!-- Remove disks -->
            <div v-if="actionName === 'remove_disks'" class="chip-row">
              <label class="chip-check"><input type="checkbox" v-model='disallow_capacity_estimation'> Disallow Capacity Estimation</label>
              <label class="chip-check" title="Returns the proposed replica movements (with their logdirs) and the load before the disk removal"><input type="checkbox" v-model='remove_disks_verbose'> Verbose <i class="bi bi-question-circle help-icon"></i></label>
            </div>

            <!-- Settings (admin): what has no other place -->
            <div v-if="actionName === 'admin'">
              <p class="small text-muted mb-2">These switches outlive executions: they stay as set until changed again or until Cruise Control restarts.
                Only what you change is sent.
                <a href="#" @click.prevent="showSettingsHelp = !showSettingsHelp">{{ showSettingsHelp ? 'Hide' : 'Where are the other settings?' }}</a></p>
              <ul v-if="showSettingsHelp" class="small text-muted settings-help">
                <li>Self-healing: the Anomaly Detector page.</li>
                <li>The throttles and concurrency of an ongoing execution: "Throttles, Concurrency &amp; Live Controls" on the Executor page.</li>
                <li>The concurrency of an execution you are about to start: that action's own options. An execution starts from its own request (or the config), whatever was set here before.</li>
              </ul>
              <div class="opt-sub">
                <div class="opt-sub-title"><i class="bi bi-sliders2"></i> Adjusters</div>
                <div class="setting-row">
                  <label title="replication_throttle_adjustment: global switch of the concurrency adjuster's replication throttle adjustment (a restart reverts it to the config). Turning it off keeps the throttle at its last value for the rest of the execution. CC does not report its current value; the response shows before/after.">Replication Throttle Adjustment <i class="bi bi-question-circle help-icon"></i></label>
                  <segmented-control v-model="replication_throttle_adjustment" :options="triState" aria-label="Replication Throttle Adjustment" />
                </div>
                <div class="setting-row" v-for="t in concurrencyTypes" :key="'cadj-' + t">
                  <label :title="'enable_concurrency_adjuster_for / disable_concurrency_adjuster_for=' + t">Concurrency Adjuster: {{ adjusterLabels[t] }} <i class="bi bi-question-circle help-icon"></i></label>
                  <segmented-control :value="adjusterFor(t)" :options="triState" :aria-label="'Concurrency adjuster for ' + t" @input="setAdjusterFor(t, $event)" />
                </div>
                <div class="setting-row">
                  <label title="min_isr_based_concurrency_adjustment">Min ISR Based Concurrency Adjustment <i class="bi bi-question-circle help-icon"></i></label>
                  <segmented-control v-model="min_isr_based_concurrency_adjustment" :options="triState" aria-label="Min ISR Based Concurrency Adjustment" />
                </div>
              </div>
              <div class="opt-sub">
                <div class="opt-sub-title"><i class="bi bi-clock-history"></i> Recently Removed / Demoted Brokers</div>
                <p class="small text-muted mb-2">Cruise Control keeps replicas off recently removed brokers and leadership off recently demoted ones; drop a broker from its list to make it eligible again.</p>
                <div class="setting-row">
                  <label title="drop_recently_removed_brokers">Drop Recently Removed Brokers</label>
                  <div>
                    <div v-if="recentBrokers.removed.length" class="chip-row mb-1">
                      <label v-for="b in recentBrokers.removed" :key="'rr-' + b" class="chip-check"><input type="checkbox" :checked="idList(drop_recently_removed_brokers).includes(String(b))" @change="drop_recently_removed_brokers = toggleId(drop_recently_removed_brokers, b)"> Broker {{ b }}</label>
                    </div>
                    <div v-else-if="recentBrokers.loaded" class="small text-muted mb-1">No recently removed brokers right now.</div>
                    <input type="text" class="form-control form-control-sm" v-model='drop_recently_removed_brokers' placeholder='Broker ids, comma-separated'>
                  </div>
                </div>
                <div class="setting-row">
                  <label title="drop_recently_demoted_brokers">Drop Recently Demoted Brokers</label>
                  <div>
                    <div v-if="recentBrokers.demoted.length" class="chip-row mb-1">
                      <label v-for="b in recentBrokers.demoted" :key="'rd-' + b" class="chip-check"><input type="checkbox" :checked="idList(drop_recently_demoted_brokers).includes(String(b))" @change="drop_recently_demoted_brokers = toggleId(drop_recently_demoted_brokers, b)"> Broker {{ b }}</label>
                    </div>
                    <div v-else-if="recentBrokers.loaded" class="small text-muted mb-1">No recently demoted brokers right now.</div>
                    <input type="text" class="form-control form-control-sm" v-model='drop_recently_demoted_brokers' placeholder='Broker ids, comma-separated'>
                  </div>
                </div>
              </div>
            </div>

            <!-- goal-based actions: the options in collapsible groups -->
            <div v-for="grp in optionGroups" :key="grp.key" class="opt-group">
              <button type="button" :class="['opt-head', { open: openGroups[grp.key] }]" :aria-expanded="openGroups[grp.key] ? 'true' : 'false'" @click="openGroups[grp.key] = !openGroups[grp.key]">
                <span class="opt-icon"><i :class="['bi', grp.icon]"></i></span>
                <span class="opt-title">{{ grp.title }}</span>
                <span v-if="groupSetCount(grp.key)" class="badge badge-primary">{{ groupSetCount(grp.key) }} set</span>
                <small class="text-muted">{{ grp.hint }}</small>
                <i class="bi bi-chevron-right chevron"></i>
              </button>
              <div v-show="openGroups[grp.key]" class="opt-body">
                <template v-if="grp.key === 'goals'">
                  <div class="chip-row mb-3">
                    <label class="chip-check"><input type="checkbox" v-model='skip_hard_goal_check' :disabled='disable_skip_hard_goal_check && actionName !== "topic_configuration"'> Skip Hard Goal Check</label>
                    <label class="chip-check" v-if='supports("use_ready_default_goals")'><input type="checkbox" v-model='use_ready_default_goals' :disabled='disable_use_ready_default_goals'> Use Ready Default Goals</label>
                    <label class="chip-check" v-if='supports("kafka_assigner")'><input type="checkbox" v-model='kafka_assigner' :disabled='disable_kafka_assigner'> Kafka Assigner Mode</label>
                  </div>
                  <div>
                    <h6>Choose Goals <small class="text-muted">({{ actionMeta.goalGroup === 3 ? 'intra-broker goals; none = intra.broker.goals' : 'none = CC default goals' }})</small></h6>
                    <goal-picker v-model="goals1" :goals="actionGoals" :disabled="disable_goals1" />
                  </div>
                </template>
                <template v-if="grp.key === 'movement'">
                  <div class="form-row">
                    <div class="col-md-4 mb-2" v-if='supports("concurrent_partition_movements_per_broker")'>
                      <label class="form-label">Concurrent Partition Movements Per Broker</label>
                      <input class="form-control form-control-sm" type='number' min=0 v-model='concurrent_partition_movements_per_broker' placeholder='(CC Default)'>
                    </div>
                    <div class="col-md-4 mb-2" v-if='supports("max_partition_movements_in_cluster")'>
                      <label class="form-label" title="max_partition_movements_in_cluster: the cap on inter-broker partition movements in progress at once in the whole cluster">Max Partition Movements In Cluster <i class="bi bi-question-circle help-icon"></i></label>
                      <input class="form-control form-control-sm" type='number' min=1 v-model='max_partition_movements_in_cluster' placeholder='(CC Default)'>
                    </div>
                    <div class="col-md-4 mb-2" v-if='supports("concurrent_intra_broker_partition_movements") && actionName !== "rebalance"'>
                      <label class="form-label">Concurrent Intra Broker Partition Movements</label>
                      <input class="form-control form-control-sm" type='number' min=0 v-model='concurrent_intra_broker_partition_movements' placeholder='(CC Default)'>
                    </div>
                    <div class="col-md-4 mb-2" v-if='supports("concurrent_leader_movements")'>
                      <label class="form-label">Concurrent Leader Movements</label>
                      <input class="form-control form-control-sm" type='number' min=0 v-model='concurrent_leader_movements' placeholder='(CC Default)'>
                    </div>
                    <div class="col-md-4 mb-2" v-if='supports("replication_throttle")'>
                      <label class="form-label">Replication Throttle</label>
                      <throttle-input v-model='replication_throttle' />
                    </div>
                    <div class="col-md-4 mb-2" v-if='supports("log_dir_throttle") && actionName !== "rebalance"'>
                      <label class="form-label" title="log_dir_throttle: upper bound on the bandwidth used to move replicas between the disks of a broker. Falls back to default.log.dir.throttle; without either, log-dir moves are unthrottled.">Log Dir Throttle <i class="bi bi-question-circle help-icon"></i></label>
                      <throttle-input v-model='log_dir_throttle' :min='1' />
                    </div>
                    <div class="col-md-8 mb-2" v-if='supports("replica_movement_strategies")'>
                      <label class="form-label" title="Applied only when executing (ignored by a dry run). The first strategy decides the order, the next ones break ties.">Replica Movement Strategies <i class="bi bi-question-circle help-icon"></i></label>
                      <strategy-picker v-model='replica_movement_strategies' />
                    </div>
                  </div>
                  <div class="chip-row" v-if='supports("throttle_added_broker") || supports("throttle_removed_broker")'>
                    <label class="chip-check" v-if='supports("throttle_added_broker")'><input type="checkbox" v-model='throttle_added_broker'> Throttle Added Broker</label>
                    <label class="chip-check" v-if='supports("throttle_removed_broker")'><input type="checkbox" v-model='throttle_removed_broker'> Throttle Removed Broker</label>
                  </div>
                </template>
                <template v-if="grp.key === 'others'">
                  <div v-if='supports("destination_broker_ids") || supports("rebalance_disk_broker_by_broker")' class="opt-sub">
                    <div class="opt-sub-title"><i class="bi bi-signpost-split"></i> Destinations &amp; Scope</div>
                    <!-- the table picks the brokers an action acts on (for Rebalance Broker Disks: the brokers whose disks are
                         rebalanced); this picker the brokers replicas may move to -->
                    <div class="form-row" v-if='supports("destination_broker_ids") && actionName !== "rebalance_disk"'>
                      <label class="col-sm-12" :title='actionName === "remove" ? "destination_broker_ids: the brokers the replicas of the removed brokers may move to (none = any other broker). The brokers being removed are not offered." : "destination_broker_ids: the brokers replicas may move to (none = any broker)"'>Destination Brokers <i class="bi bi-question-circle help-icon"></i></label>
                      <div class="col-md-8">
                        <broker-picker v-model="destination_broker_ids" :brokers="pickerBrokers" :exclude="actionName === 'remove' ? selectedBrokers : []" empty-text="none: any broker" />
                      </div>
                    </div>
                    <div class="chip-row mt-2" v-if='supports("rebalance_disk_broker_by_broker") && actionName !== "rebalance"'>
                      <label class="chip-check" title="rebalance_disk_broker_by_broker: finish moving replicas between the disks of a broker before starting on the next broker"><input type="checkbox" v-model='rebalance_disk_broker_by_broker'> One Broker At A Time <i class="bi bi-question-circle help-icon"></i></label>
                    </div>
                    <p v-if='actionName === "rebalance_disk"' class="small text-muted mt-2 mb-0">
                      <template v-if="selectedBrokers.length"><b>Limited to the {{ selectedBrokers.length }} selected broker{{ selectedBrokers.length > 1 ? 's' : '' }}</b> (destination_broker_ids={{ selectedBrokers.join(', ') }}): only their disks are rebalanced and the disk statistics cover them only.</template>
                      <template v-else>Select brokers in the table above to limit the disk rebalance to them (none = every broker).</template>
                    </p>
                    <div v-if="actionName === 'rebalance_disk' && offlineDirBrokersInScope.length" class="alert alert-warning small mt-2 mb-0 offline-dir-note">
                      <i class="bi bi-exclamation-triangle"></i>
                      <b>Offline log dirs</b> on {{ offlineDirBrokersInScope.length > 1 ? 'brokers' : 'broker' }}
                      <span v-for="b in offlineDirBrokersInScope" :key="'od-' + b.id" class="offline-dir-broker">{{ b.id }} (<code>{{ b.logdirs.join(', ') }}</code>)</span>:
                      Kafka refuses every move between the disks of such a broker, so if the disk rebalance moves replicas between their disks, Cruise Control refuses to execute it. A dry run is not affected.
                      Replace the disk, or remove it from <code>log.dirs</code> and restart the broker; or leave the broker out by selecting the others.
                    </div>
                  </div>
                  <div v-if='supports("excluded_topics") || supports("included_topics")' class="opt-sub">
                    <div class="opt-sub-title"><i class="bi bi-collection"></i> Topics</div>
                    <div class="form-row">
                      <div class="col-md-5">
                        <label class="form-label">Excluded Topics <b title="Excluded Topics takes Regular Expression. Mutually exclusive with Included Topics."><i class="bi bi-question-circle help-icon"></i></b></label>
                        <topic-input v-model='excluded_topics' placeholder='(CC Default)' :disabled='!!included_topics' />
                      </div>
                      <div class="col-md-5">
                        <label class="form-label">Included Topics <b title="Only these topics may move (full-match regex). Overrides the configured topic exclusion, so __.* topics can be included explicitly. Mutually exclusive with Excluded Topics."><i class="bi bi-question-circle help-icon"></i></b></label>
                        <topic-input v-model='included_topics' placeholder='(none)' :disabled='!!excluded_topics' />
                      </div>
                    </div>
                  </div>
                  <div class="opt-sub">
                    <div class="opt-sub-title"><i class="bi bi-cpu"></i> Load Model &amp; Checks</div>
                    <div class="form-row align-items-end">
                      <div class="col-md-4 mb-2">
                        <label class="form-label">Use Data From</label>
                        <select v-model=data_from class="form-control form-control-sm">
                          <option value=''>(CC Default)</option>
                          <option value='valid_windows'>Valid Windows</option>
                          <option value='valid_partitions'>Valid Partitions</option>
                        </select>
                      </div>
                      <div class="col-md-8 mb-2 chip-row">
                        <label class="chip-check"><input type="checkbox" v-model='disallow_capacity_estimation'> Disallow Capacity Estimation</label>
                        <label class="chip-check" v-if='supports("skip_rack_awareness_check")'><input type="checkbox" v-model='skip_rack_awareness_check'> Skip Rack Awareness Check</label>
                      </div>
                    </div>
                  </div>
                </template>
                <!-- Rebalance Cluster only: a disk rebalance queued after it (queue_rebalance_disk) and what applies to it -->
                <template v-if="grp.key === 'queue'">
                  <div class="chip-row">
                    <label class="chip-check" title="queue_rebalance_disk: once the moves of this rebalance are done, rebalance the disks within the brokers (as Rebalance Broker Disks does), under the same user task. Execute only: a dry run has no execution to queue it after."><input type="checkbox" v-model='queue_rebalance_disk'> Rebalance the disks once the moves are done <i class="bi bi-question-circle help-icon"></i></label>
                    <label class="chip-check" v-if='supports("rebalance_disk_broker_by_broker")' title="rebalance_disk_broker_by_broker: finish moving replicas between the disks of a broker before starting on the next broker"><input type="checkbox" v-model='rebalance_disk_broker_by_broker'> One Broker At A Time <i class="bi bi-question-circle help-icon"></i></label>
                  </div>
                  <template v-if="queue_rebalance_disk">
                    <div class="form-row mt-3">
                      <div class="col-md-4 mb-2">
                        <label class="form-label">Concurrent Intra Broker Partition Movements</label>
                        <input class="form-control form-control-sm" type='number' min=0 v-model='concurrent_intra_broker_partition_movements' placeholder='(CC Default)'>
                      </div>
                      <div class="col-md-4 mb-2">
                        <label class="form-label" title="log_dir_throttle: upper bound on the bandwidth used to move replicas between the disks of a broker. Falls back to default.log.dir.throttle; without either, log-dir moves are unthrottled.">Log Dir Throttle <i class="bi bi-question-circle help-icon"></i></label>
                        <throttle-input v-model='log_dir_throttle' :min='1' />
                      </div>
                    </div>
                    <ul class="small text-muted mt-1 mb-0 queue-notes">
                      <li>After the moves between brokers, Cruise Control computes the disk rebalance from a fresh model and executes it under the same user task, with <code>intra.broker.goals</code> (the goals above apply to the rebalance only).</li>
                      <li><b>Destination Brokers (under Others) limit both:</b> replicas move only to them, and only their disks are rebalanced{{ destination_broker_ids.length ? '' : ' (none picked: every broker)' }}. Excluded / Included Topics apply to both too.</li>
                      <li>A dry run cannot preview the disk rebalance (run Rebalance Broker Disks for that): only Execute sends <code>queue_rebalance_disk</code>.</li>
                    </ul>
                    <div v-if="offlineDirBrokersInScope.length" class="alert alert-warning small mt-2 mb-0 offline-dir-note">
                      <i class="bi bi-exclamation-triangle"></i>
                      <b>Offline log dirs</b> on {{ offlineDirBrokersInScope.length > 1 ? 'brokers' : 'broker' }}
                      <span v-for="b in offlineDirBrokersInScope" :key="'odq-' + b.id" class="offline-dir-broker">{{ b.id }} (<code>{{ b.logdirs.join(', ') }}</code>)</span>:
                      Kafka refuses every move between the disks of such a broker, so if the queued disk rebalance moves replicas between their disks, Cruise Control refuses to execute it after the rebalance, and the user task ends with an error. A dry run is not affected.
                      Replace the disk, or remove it from <code>log.dirs</code> and restart the broker.
                    </div>
                  </template>
                </template>
              </div>
            </div>
          </section>

          <section class="step mb-0">
            <h6><span class="step-no">{{ targetMode ? 3 : 2 }}</span> Review <small class="text-muted font-weight-normal">{{ actionName === 'admin' ? 'the request Apply sends' : 'the request (Execute sends the same with dryrun=false)' }}</small></h6>
            <div class="request-box">
              <pre class="request"><code>{{ actionURL.replace(/&/g, "\n  &") }}</code></pre>
              <button type="button" class="btn btn-sm btn-outline-secondary copy-btn" :title="copied ? 'Copied' : 'Copy the request URL'" @click="copyURL"><i :class="['bi', copied ? 'bi-check2' : 'bi-clipboard']"></i> {{ copied ? 'Copied' : 'Copy' }}</button>
            </div>
            <div v-if="Object.keys(executeOnlyParams).length" class="small text-muted mb-2"><i class="bi bi-info-circle"></i> Execute also sends <code>{{ Object.keys(executeOnlyParams).map(k => k + '=' + executeOnlyParams[k]).join('&') }}</code>: Cruise Control refuses {{ Object.keys(executeOnlyParams).length > 1 ? 'them' : 'it' }} on a dry run.</div>
            <div v-if="missing" class="small text-warning mb-2"><i class="bi bi-exclamation-circle"></i> {{ missing }}</div>
            <div class="d-flex align-items-center flex-wrap run-buttons">
              <template v-if="actionName !== 'admin'">
                <button class="btn btn-primary" :disabled="!!missing || requestBusy" @click="runDry"><span v-if="requestBusy && postedDryRun" class="spinner-border spinner-border-sm"></span><i v-else class="bi bi-eye"></i> Dry Run</button>
                <button :class="['btn', 'ml-2', currentCard.tone === 'danger' ? 'btn-danger' : 'btn-warning']" :disabled="!!missing || requestBusy" @click="confirmExecute = true"><i class="bi bi-play-fill"></i> Execute…</button>
              </template>
              <button v-else class="btn btn-primary" :disabled="requestBusy" @click="actionBroker"><span v-if="requestBusy" class="spinner-border spinner-border-sm"></span><i v-else class="bi bi-check2"></i> Apply</button>
              <span v-if="requestBusy" class="small text-muted ml-3">Waiting for Cruise Control…</span>
            </div>
            <div v-if="confirmExecute" class="alert alert-danger mt-3 mb-0 confirm-execute">
              <b><i class="bi bi-exclamation-triangle"></i> Execute "{{ currentCard.title }}" for real?</b>
              Cruise Control starts changing the cluster right away; follow or stop it on the Executor page.
              <div class="mt-2">
                <button class="btn btn-danger btn-sm" @click="executeNow">Execute now</button>
                <button class="btn btn-outline-secondary btn-sm ml-1" @click="confirmExecute = false">Cancel</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <!-- 3. the response of the last request -->
      <div v-if='posted' ref="result" :class="['card', 'result-card', 'mt-3', { error: postError }]">
        <div class="card-header result-head">
          <span><i :class="['bi', 'mr-2', postError ? 'bi-x-octagon text-danger' : requestBusy ? 'bi-hourglass-split' : 'bi-check2-circle text-success']"></i>{{ postedTitle }}</span>
          <span :class="['badge', postedDryRun ? 'badge-info' : 'badge-warning']">{{ actionName === 'admin' ? 'applied' : postedDryRun ? 'dry run' : 'executed' }}</span>
          <span v-if="postedAt" class="small text-muted font-weight-normal">{{ postedAt }}</span>
          <span class="ml-auto">
            <button v-if="postResponse && !postAsync" class="btn btn-sm btn-outline-secondary" @click="showRawResponse = !showRawResponse">{{ showRawResponse ? 'Hide' : 'Show' }} Raw Response</button>
            <button v-if="postResponse && !postAsync" class="btn btn-sm btn-secondary ml-1" @click='clearPostResponse'>Clear Response</button>
          </span>
        </div>
        <div class="card-body">
          <div v-if='postAsync'>
            <async-task :asyncData='postResponse' :task-id="postTaskId">
              <button class="btn btn-sm btn-outline-secondary" :title="'Polled every ' + asyncRetrySeconds + 's'" @click='pollPost()'><i class="bi bi-arrow-clockwise"></i> Check now</button>
              <button class="btn btn-sm btn-outline-secondary" @click='clearPostResponse'>Stop waiting</button>
            </async-task>
          </div>
          <div v-else-if='postResponse'>
            <pre v-if="showRawResponse" class="bg-light p-2 border" style="max-height:400px;overflow:auto;white-space:pre-wrap"><code>{{ typeof postResponse === 'string' ? postResponse : JSON.stringify(postResponse, null, 2) }}</code></pre>
            <div v-if='postError'>
              <exception :exception='postResponse'></exception>
            </div>
            <div v-else>
              <div class="alert alert-success">Action submitted successfully.
                <template v-if="!postedDryRun && actionName !== 'admin'"> Follow or stop the execution on the <router-link :to="executorRoute">Executor page</router-link>.</template>
              </div>
              <div v-if="refusedDiskMoveBrokers.length" class="alert alert-danger refused-note">
                <b><i class="bi bi-x-octagon"></i> Execute would be refused:</b> these proposals move replicas between the disks of
                <span v-for="b in refusedDiskMoveBrokers" :key="'rf-' + b.id" class="offline-dir-broker">broker {{ b.id }} ({{ b.moves }} move{{ b.moves > 1 ? 's' : '' }}; offline: <code>{{ b.logdirs.join(', ') }}</code>)</span>,
                and Kafka refuses every move between the disks of a broker with an offline log dir.
                Replace the disk, or remove it from <code>log.dirs</code> and restart the broker, then run it again.
                <div v-if="postedAction === 'rebalance_disk' && actionName === 'rebalance_disk'" class="mt-2">
                  <button class="btn btn-sm btn-outline-secondary" @click="leaveOutBrokers(refusedDiskMoveBrokers.map(b => b.id))">Leave {{ refusedDiskMoveBrokers.length > 1 ? 'them' : 'it' }} out</button>
                  <small class="ml-2">selects every other broker in the table; then Dry Run again</small>
                </div>
              </div>
              <optimization-result v-if="dataParsed" :result="postResponse" :brokers="postedScope" />
              <div v-else-if='typeof postResponse === "object"'>
                <h6>Response Summary</h6>
                <table class="table table-sm table-bordered">
                  <thead class="thead-light">
                    <tr>
                      <th>Key</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(val, key) in flatSummary" :key="key">
                      <td>{{ key }}</td>
                      <td class="response-value">{{ val }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div class='alert alert-info mb-0' v-else>
            <div class="spinner-border spinner-border-sm text-primary mr-2" role="status"></div> Waiting for Response ...
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { parseFilter, matchesFilter } from '@/brokerFilter'
// Disable this due to https://github.com/linkedin/cruise-control-ui/issues/40
// import xssFilters from 'xss-filters'
import goals from '@/goals'
import BrokerState from '@/components/BrokerState'
import OptimizationResult from '@/components/OptimizationResult'
import ThrottleInput from '@/components/ThrottleInput'
import BrokerPicker from '@/components/BrokerPicker'
import StrategyPicker from '@/components/StrategyPicker'
import SegmentedControl from '@/components/SegmentedControl'
import GoalPicker from '@/components/GoalPicker'
import { CONCURRENCY_TYPES } from '@/ccOptions'
import { ASYNC_RETRY_DELAY, ARGS_RETRY_MAX, ARGS_RETRY_DELAY } from '@/constants'
import fetchCC from '@/fetchCC'
const sortBy = require('lodash.sortby')

// The goal-based actions. params lists the request parameters each one supports (see the endpoints' OpenAPI spec), so
// that a form shows, and a request carries, only parameters the endpoint accepts.
const OPTIMIZATION_PARAMS = ['goals', 'skip_hard_goal_check', 'use_ready_default_goals', 'allow_capacity_estimation', 'data_from',
  'excluded_topics', 'included_topics', 'concurrent_partition_movements_per_broker', 'max_partition_movements_in_cluster',
  'concurrent_leader_movements', 'replication_throttle', 'replica_movement_strategies']
// the parameters a rebalance passes on to the disk rebalance queued after it (queue_rebalance_disk): offered only while the
// queue is on
const QUEUED_DISK_PARAMS = ['rebalance_disk_broker_by_broker', 'concurrent_intra_broker_partition_movements', 'log_dir_throttle']
// The action cards, by group. key: the action (demote_disks = demote with log dirs as targets); tone: the panel's accent
const ACTION_GROUPS = [
  {
    label: 'Cluster',
    actions: [
      { key: 'rebalance', icon: 'bi-shuffle', title: 'Rebalance Cluster', blurb: 'Even out the load of the brokers', tone: 'primary', description: 'Move replicas and leadership between brokers until the goals are met.' },
      { key: 'rebalance_disk', icon: 'bi-device-hdd', title: 'Rebalance Broker Disks', blurb: 'Even out the disks inside brokers', tone: 'primary', description: 'Only rebalance replicas between disks in an intra-broker manner.' }
    ]
  },
  {
    label: 'Brokers',
    actions: [
      { key: 'add', icon: 'bi-plus-circle', title: 'Add Brokers', blurb: 'Move replicas onto new brokers', tone: 'success', description: 'Choose new brokers which can accept replicas. Replicas will only be moved from the existing brokers to the provided new brokers.' },
      { key: 'remove', icon: 'bi-dash-circle', title: 'Remove Brokers', blurb: 'Move every replica off brokers', tone: 'danger', description: 'Select brokers to decomission and remove them from replicas. This only moves partitions from the brokers to be removed. Ignores excluded topics.' },
      { key: 'demote', icon: 'bi-arrow-down-circle', title: 'Demote Brokers', blurb: 'Move leadership off brokers', tone: 'warning', description: 'Moves the leadership off the brokers to in-sync replicas on other brokers; no data moves. Under-replicated partitions are skipped unless you demote them in the options.' }
    ]
  },
  {
    label: 'Disks',
    actions: [
      { key: 'remove_disks', icon: 'bi-x-octagon', title: 'Remove Disks', blurb: "Move their replicas to the same broker's other disks", tone: 'danger', description: 'Moves every replica off the selected disks to the other disks of the same broker. Online log dirs only; for offline ones use "Fix Offline Replicas".' },
      { key: 'demote_disks', icon: 'bi-arrow-down-square', title: 'Demote Disks', blurb: 'Move their leadership to other brokers', tone: 'warning', description: 'Moves the leadership of the replicas on the selected disks to their replicas on other brokers; no data moves. Online log dirs only; under-replicated partitions are skipped unless you demote them in the options.' }
    ]
  },
  {
    label: 'Topics',
    actions: [
      { key: 'topic_configuration', icon: 'bi-files', title: 'Replication Factor', blurb: "Change topics' replication factor", tone: 'primary', description: 'Use this for changing replication factor of a topic.' },
      { key: 'fix_offline_replicas', icon: 'bi-bandaid', title: 'Fix Offline Replicas', blurb: 'Move offline replicas off dead brokers or disks', tone: 'primary', description: 'This moves all the offline replicas from dead disks/brokers.' }
    ]
  },
  {
    label: 'Leadership',
    actions: [
      { key: 'ple', icon: 'bi-star', title: 'Preferred Leader Election', blurb: 'Elect the preferred leaders', tone: 'primary', description: 'Elect preferred leaders.' }
    ]
  },
  {
    label: 'Settings',
    actions: [
      { key: 'admin', icon: 'bi-gear', title: 'Adjusters & Recent Brokers', blurb: 'Switches that outlive executions', tone: 'primary', description: 'The adjusters, and the recently removed / demoted brokers.' }
    ]
  }
]
const ACTION_CARDS = ACTION_GROUPS.reduce((all, g) => all.concat(g.actions), [])

// the option groups of the goal-based actions, and the parameters behind each (for "N set")
const OPTION_GROUPS = [
  { key: 'goals', icon: 'bi-bullseye', title: 'Goals', hint: 'which goals, in which order', params: ['goals', 'skip_hard_goal_check', 'use_ready_default_goals', 'kafka_assigner'] },
  { key: 'movement', icon: 'bi-speedometer', title: 'Throttles & Adjustments', hint: 'how fast, how many at once, in which order', params: ['concurrent_partition_movements_per_broker', 'max_partition_movements_in_cluster', 'concurrent_intra_broker_partition_movements', 'concurrent_leader_movements', 'replication_throttle', 'log_dir_throttle', 'replica_movement_strategies', 'throttle_added_broker', 'throttle_removed_broker'] },
  { key: 'others', icon: 'bi-sliders', title: 'Others', hint: 'destinations, topics, load model and checks', params: ['destination_broker_ids', 'rebalance_disk_broker_by_broker', 'excluded_topics', 'included_topics', 'data_from', 'allow_capacity_estimation', 'skip_rack_awareness_check'] }
]

// Rebalance Cluster only: the disk rebalance queued after it, with the parameters it passes on (shown there, not in the groups above)
OPTION_GROUPS.push({ key: 'queue', icon: 'bi-device-hdd', title: 'Then Rebalance Broker Disks', hint: 'once the moves are done (Execute only)', params: ['queue_rebalance_disk'].concat(QUEUED_DISK_PARAMS) })

const OPTIMIZATION_ACTIONS = {
  rebalance: {
    endpoint: 'rebalance',
    title: 'Rebalance Cluster Flags',
    alertClass: 'alert-info',
    button: 'Execute Rebalance',
    goalGroup: 1,
    params: OPTIMIZATION_PARAMS.concat(['kafka_assigner', 'destination_broker_ids', 'queue_rebalance_disk'], QUEUED_DISK_PARAMS)
  },
  rebalance_disk: {
    endpoint: 'rebalance',
    title: 'Rebalance Broker Disks Flags',
    alertClass: 'alert-primary',
    description: 'Only rebalance replicas between disks in an intra-broker manner.',
    button: 'Run Broker Disk Rebalance',
    goalGroup: 3,
    params: ['goals', 'skip_hard_goal_check', 'allow_capacity_estimation', 'data_from', 'excluded_topics', 'included_topics',
      'destination_broker_ids', 'rebalance_disk_broker_by_broker', 'concurrent_intra_broker_partition_movements', 'log_dir_throttle']
  },
  add: {
    endpoint: 'add_broker',
    title: 'Add Broker Flags',
    alertClass: 'alert-success',
    description: 'Choose new brokers which can accept replicas. Replicas will only be moved from the existing brokers to the provided new brokers.',
    button: 'Add Brokers',
    withBrokers: true,
    goalGroup: 1,
    params: OPTIMIZATION_PARAMS.concat(['kafka_assigner', 'throttle_added_broker'])
  },
  remove: {
    endpoint: 'remove_broker',
    title: 'Remove Broker Flags',
    alertClass: 'alert-danger',
    description: 'Select brokers to decomission and remove them from replicas. This only moves partitions from the brokers to be removed. Ignores excluded topics.',
    button: 'Remove Brokers',
    withBrokers: true,
    goalGroup: 1,
    params: OPTIMIZATION_PARAMS.concat(['kafka_assigner', 'throttle_removed_broker', 'destination_broker_ids'])
  },
  fix_offline_replicas: {
    endpoint: 'fix_offline_replicas',
    title: 'Fix Offline Replicas Flags',
    alertClass: 'alert-info',
    description: 'This moves all the offline replicas from dead disks/brokers',
    button: 'Fix Offline Replicas',
    goalGroup: 1,
    params: OPTIMIZATION_PARAMS
  },
  topic_configuration: {
    endpoint: 'topic_configuration',
    title: 'Topic Configuration Flags',
    alertClass: 'alert-success',
    description: 'Use this for changing replication factor of a topic',
    button: 'Change Replication Factor',
    goalGroup: 1,
    // no excluded/included topics: the goals move only the new replicas of the changed topics, so excluding another topic
    // changes nothing, and excluding a changed one only keeps its new replicas where they were first placed
    params: OPTIMIZATION_PARAMS.filter(p => p !== 'excluded_topics' && p !== 'included_topics').concat(['skip_rack_awareness_check'])
  }
}

function isSet (v) {
  return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
}

export default {
  name: 'AdminBroker',
  props: {
    group: String,
    cluster: String
  },
  components: {
    BrokerState,
    OptimizationResult,
    ThrottleInput,
    BrokerPicker,
    StrategyPicker,
    SegmentedControl,
    GoalPicker
  },
  data () {
    return {
      sortColumn: 'Broker', // column on which data needs to be sorted
      loading: false, // true if the data is being fetched now
      loaded: false, // true if data is fetched at-least once
      error: false, // in case server sent non 200 OK Response
      errorData: null, // complete error data
      async: false,
      asyncData: null,
      argsRetryTimer: null,
      asyncRetryTimer: null,
      selectedBrokers: [],
      // This is the response from the CC
      KafkaBrokerState: {
        OfflineLogDirsByBrokerId: {},
        ReplicaCountByBrokerId: {},
        OutOfSyncCountByBrokerId: {},
        OnlineLogDirsByBrokerId: {},
        LeaderCountByBrokerId: {},
        OfflineReplicaCountByBrokerId: {}
      },
      brokerDetails: {}, // host, rack, state per broker from /load endpoint
      enableLogDirSelection: false,
      selectedLogDirs: {},
      adminFilterText: '',
      adminSortColumn: 'bid', // column to sort admin broker table
      allGoals: goals, // goals from configuration
      concurrencyTypes: CONCURRENCY_TYPES,
      /*
       * x                              Goals   Disallow-Capacity-Estimation   Skip-Hard-Goal-Check   Use-Ready-Default-Goals   Kafka-Assigner-Mode   Module
       * Goals                          1       1                              1                      0                         0                     Analyzer
       * Disallow-Capacity-Estimation   1       1                              1                      1                         1                     Capacity-Resolver
       * Skip-Hard-Goal-Check           1       1                              1                      1                         0                     Analyzer
       * Use-Ready-Default-Goals        0       1                              1                      1                         0                     Analyzer
       * Kafka-Assigner-Mode            0       1                              0                      0                         1                     Analyzer
       */
      // disable user flags
      disable_goals1: false,
      disable_skip_hard_goal_check: false,
      disable_use_ready_default_goals: false,
      disable_kafka_assigner: false,
      // user flags
      actionGroups: ACTION_GROUPS,
      openGroups: { goals: false, movement: false, others: false, queue: false }, // option groups shown
      confirmExecute: false, // the Execute confirmation is shown
      showSettingsHelp: false,
      triState: [{ value: '', label: 'Unchanged' }, { value: 'true', label: 'Enable' }, { value: 'false', label: 'Disable' }],
      adjusterLabels: { INTER_BROKER_REPLICA: 'Inter-broker replicas', LEADERSHIP_CLUSTER: 'Leadership, cluster', LEADERSHIP_BROKER: 'Leadership, per broker' },
      recentBrokers: { loaded: false, removed: [], demoted: [] }, // the executor's recently removed / demoted brokers, for Settings
      goals1: [], // goals of the chosen action (inter-broker goals, or intra-broker goals for rebalance_disk)
      skip_hard_goal_check: false, // Check CC Documentation
      use_ready_default_goals: false, // Check CC Documentation
      disallow_capacity_estimation: false, // Check CC Documentation
      demote_urp: false, // demote_broker: skip_urp_demotion=false
      demote_followers: false, // demote_broker: exclude_follower_demotion=false
      kafka_assigner: false, // Check CC Documentation
      data_from: '', // Check CC Documentation
      excluded_topics: '', // Check CC Documentation
      included_topics: '', // mutually exclusive with excluded_topics
      concurrent_partition_movements_per_broker: null, // Check CC Documentation
      max_partition_movements_in_cluster: null,
      concurrent_leader_movements: null, // Check CC Documentation
      replication_throttle: null, // bytes/s
      log_dir_throttle: null, // bytes/s, rebalance_disk only
      replica_movement_strategies: [], // in chain order
      destination_broker_ids: [], // the destination picker (Rebalance Broker Disks uses the brokers selected in the table)
      rebalance_disk_broker_by_broker: false,
      queue_rebalance_disk: false, // rebalance only: rebalance the disks once its execution completes (dryrun=false only)
      throttle_removed_broker: false, // Check CC Documentation
      throttle_added_broker: false, // Check CC Documentation
      skip_rack_awareness_check: false, // Used for some APIs
      topic_regex: '', // Used for topic_configuration
      replication_factor: null, // Used for topic_configuration
      remove_disks_verbose: true,
      // admin flags
      concurrent_intra_broker_partition_movements: null,
      drop_recently_removed_brokers: null,
      drop_recently_demoted_brokers: null,
      disable_concurrency_adjuster_for: [],
      enable_concurrency_adjuster_for: [],
      min_isr_based_concurrency_adjustment: '', // '' = unchanged, 'true', 'false'
      replication_throttle_adjustment: '', // '' = unchanged, 'true', 'false'
      // workflow
      actionName: '', // the chosen action (none until a card is picked)
      dryrun: true, // part of URL
      posted: false, // true if a POST method is made
      posturl: null, // POST url (also polled while the response is async)
      postResponse: {}, // POST response from server
      postAsync: false, // true while CC is still computing the POST (202 with a User-Task-ID)
      postTaskId: null,
      postRetryTimer: null,
      asyncRetrySeconds: ASYNC_RETRY_DELAY / 1000,
      detectedUserTaskId: false, // true in case the response has user-task-id
      postError: false, // true if the POST response is an error
      showRawResponse: false, // toggle raw JSON response view
      postedTitle: '', // the action of the last request, its kind and time (the result card's header)
      postedDryRun: true,
      postedAction: '', // the action of the last request
      postedScope: null, // the brokers a disk rebalance was limited to, or whose disks Remove Disks empties (the others' load does not change)
      targetsOpen: true, // the Targets table is shown (it folds: long on a big cluster)
      fixContext: null, // opened by Cluster Load's "Fix" (?fix=action&brokers=ids&limit=label): { action, limit, brokers }
      postedAt: '',
      copied: false, // the request URL was just copied
      showAsyncRefreshButton: false, // show refresh button during async state
      dataParsed: false
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
    if (this.postRetryTimer) {
      clearTimeout(this.postRetryTimer)
    }
  },
  computed: {
    disableGoals () {
      return this.kafka_assigner || this.use_ready_default_goals
    },
    // the card of the chosen action (demote with log dirs is its own card)
    activeCard () {
      return this.actionName === 'demote' && this.enableLogDirSelection ? 'demote_disks' : this.actionName
    },
    currentCard () {
      return ACTION_CARDS.find(c => c.key === this.activeCard) || null
    },
    // what the targets step selects: brokers, disks, or nothing (the action needs no targets)
    targetMode () {
      if (['add', 'remove', 'rebalance_disk'].includes(this.actionName)) return 'brokers'
      if (this.actionName === 'demote') return this.enableLogDirSelection ? 'disks' : 'brokers'
      if (this.actionName === 'remove_disks') return 'disks'
      return null
    },
    targetHint () {
      return {
        add: 'the new brokers that receive replicas',
        remove: 'the brokers to decommission',
        rebalance_disk: 'optional: the brokers whose disks are rebalanced (none = every broker)',
        demote: this.enableLogDirSelection ? 'the disks whose leadership moves to other brokers (online log dirs only)' : 'the brokers to move leadership off',
        remove_disks: "the disks to empty into their broker's other disks (online log dirs only)"
      }[this.actionName] || ''
    },
    // the option groups of a goal-based action, those with at least one parameter its endpoint accepts
    optionGroups () {
      if (!this.actionMeta) return []
      return OPTION_GROUPS.filter(g => g.key === 'queue' ? this.supports('queue_rebalance_disk') : g.params.some(p => this.supports(p)))
    },
    optionsSetCount () {
      return OPTION_GROUPS.reduce((n, g) => n + this.groupSetCount(g.key), 0) +
        (['ple', 'demote'].includes(this.actionName) && isSet(this.concurrent_leader_movements) ? 1 : 0) +
        (this.actionName === 'demote' ? [this.demote_urp, this.demote_followers, this.excluded_topics, this.included_topics].filter(isSet).length : 0)
    },
    // a request is out (or CC is still computing it): no second one
    requestBusy () {
      return this.posted && (this.postAsync || !this.postResponse)
    },
    executorRoute () {
      return '/' + this.group + '/' + this.cluster + '/state/executor'
    },
    // why the request cannot be sent yet
    missing () {
      const a = this.actionName
      if ((a === 'add' || a === 'remove') && !this.selectedBrokers.length) return 'Select the brokers in the table.'
      if (a === 'demote' && !this.selectedBrokers.length && !this.brokerIdAndLogDirs.length) return this.enableLogDirSelection ? 'Select the disks in the table.' : 'Select the brokers in the table.'
      if (a === 'remove_disks' && !this.brokerIdAndLogDirs.length) return 'Select the disks in the table.'
      if (a === 'topic_configuration' && (!this.topic_regex || !this.replication_factor)) return 'Topic Regex and Replication Factor are required.'
      return ''
    },
    actionMeta () {
      return OPTIMIZATION_ACTIONS[this.actionName] || null
    },
    actionGoals () {
      const group = this.actionMeta ? this.actionMeta.goalGroup : 1
      return this.allGoals.goals.filter(g => !g.skip && g.group === group)
    },
    // the brokers the destination picker offers
    pickerBrokers () {
      return this.sortedAdminBrokers.map(r => ({ id: r.bid, host: r.host, rack: r.rack })).sort((a, b) => a.id - b.id)
    },
    sortedAdminBrokers () {
      const vm = this
      const rows = Object.keys(vm.KafkaBrokerState.ReplicaCountByBrokerId).map(function (bid) {
        const d = vm.brokerDetails[bid]
        return {
          bid: parseInt(bid, 10),
          host: d ? d.Host : '',
          rack: d && d.Rack && d.Rack !== d.Host ? d.Rack : '',
          state: d ? d.BrokerState : '',
          replicas: vm.KafkaBrokerState.ReplicaCountByBrokerId[bid] || 0,
          leaders: vm.KafkaBrokerState.LeaderCountByBrokerId[bid] || 0,
          outofsync: vm.KafkaBrokerState.OutOfSyncCountByBrokerId[bid] || 0,
          offlineReplicas: vm.KafkaBrokerState.OfflineReplicaCountByBrokerId ? (vm.KafkaBrokerState.OfflineReplicaCountByBrokerId[bid] || 0) : 0,
          onlineLogDirs: vm.KafkaBrokerState.OnlineLogDirsByBrokerId && vm.KafkaBrokerState.OnlineLogDirsByBrokerId[bid] ? vm.KafkaBrokerState.OnlineLogDirsByBrokerId[bid].length : 0,
          offlineLogDirs: vm.KafkaBrokerState.OfflineLogDirsByBrokerId && vm.KafkaBrokerState.OfflineLogDirsByBrokerId[bid] ? vm.KafkaBrokerState.OfflineLogDirsByBrokerId[bid].length : 0,
          OnlineLogDirsByBrokerId: vm.KafkaBrokerState.OnlineLogDirsByBrokerId,
          OfflineLogDirsByBrokerId: vm.KafkaBrokerState.OfflineLogDirsByBrokerId
        }
      })
      return sortBy(rows, vm.adminSortColumn)
    },
    adminFilter () {
      return parseFilter(this.adminFilterText)
    },
    filteredAdminBrokers () {
      return this.sortedAdminBrokers.filter(b => matchesFilter(this.adminFilter, [b.bid], [b.host], [b.rack]))
    },
    brokerIdAndLogDirs (n) {
      return Object.keys(this.selectedLogDirs).filter(k => this.selectedLogDirs[k])
    },
    // the brokers with offline logdirs, [{ id, logdirs }]: Kafka refuses every move between the disks of such a broker, so
    // CC refuses to execute proposals that move replicas between their disks (dry runs are not checked)
    offlineDirBrokers () {
      const byBroker = this.KafkaBrokerState.OfflineLogDirsByBrokerId || {}
      return Object.keys(byBroker).filter(b => (byBroker[b] || []).length)
        .map(b => ({ id: parseInt(b, 10), logdirs: byBroker[b] })).sort((a, b) => a.id - b.id)
    },
    // those whose disks the request may rebalance: the selected brokers (Rebalance Broker Disks) or the destination brokers
    // (a rebalance with a queued disk rebalance); none picked = every broker
    offlineDirBrokersInScope () {
      let scope
      if (this.actionName === 'rebalance_disk') scope = this.selectedBrokers
      else if (this.actionName === 'rebalance' && this.queue_rebalance_disk) scope = this.destination_broker_ids
      else return []
      return this.offlineDirBrokers.filter(b => !scope.length || scope.includes(b.id))
    },
    // after a dry run: the brokers with offline logdirs whose disks its proposals move replicas between, [{ id, logdirs,
    // moves }]; executing these proposals is refused
    refusedDiskMoveBrokers () {
      const r = this.postResponse
      if (!this.postedDryRun || this.postError || !r || !Array.isArray(r.proposals)) return []
      const moves = {}
      r.proposals.forEach(p => {
        const before = p.oldReplicaLogdirs || {}
        const after = p.newReplicaLogdirs || {}
        Object.keys(after).forEach(b => {
          if (before[b] && before[b] !== after[b]) moves[b] = (moves[b] || 0) + 1
        })
      })
      return this.offlineDirBrokers.filter(b => moves[b.id]).map(b => Object.assign({ moves: moves[b.id] }, b))
    },
    // the parameters only Execute sends: CC refuses queue_rebalance_disk on a dry run (there is no execution to queue after),
    // and with it rebalance_disk_broker_by_broker, which then belongs to the queued disk rebalance
    executeOnlyParams () {
      if (this.actionName !== 'rebalance' || !this.queue_rebalance_disk) return {}
      const params = { queue_rebalance_disk: true }
      if (this.rebalance_disk_broker_by_broker) params.rebalance_disk_broker_by_broker = true
      return params
    },
    flatSummary () {
      if (!this.postResponse || typeof this.postResponse !== 'object') return {}
      const result = {}
      const skip = ['loadBeforeOptimization', 'loadAfterOptimization', 'goalSummary', 'goals', 'summary', 'proposals']
      Object.keys(this.postResponse).forEach(key => {
        if (skip.indexOf(key) !== -1) return
        const val = this.postResponse[key]
        if (val === null || val === undefined || val === '') return
        result[key] = typeof val === 'object' ? JSON.stringify(val) : String(val).trim()
      })
      return result
    },
    adminParams () {
      const vm = this
      const params = {}
      const set = (key, value) => { if (isSet(value)) params[key] = value }
      set('drop_recently_removed_brokers', vm.drop_recently_removed_brokers)
      set('drop_recently_demoted_brokers', vm.drop_recently_demoted_brokers)
      set('disable_concurrency_adjuster_for', vm.disable_concurrency_adjuster_for)
      set('enable_concurrency_adjuster_for', vm.enable_concurrency_adjuster_for)
      set('min_isr_based_concurrency_adjustment', vm.min_isr_based_concurrency_adjustment)
      set('replication_throttle_adjustment', vm.replication_throttle_adjustment)
      return params
    },
    actionURL () {
      const vm = this
      const action = vm.actionName
      if (action === 'admin') {
        // POST /kafkacruisecontrol/admin
        return vm.$helpers.getURL('admin', vm.adminParams)
      }
      const params = { dryrun: vm.dryrun }
      const set = (key, value) => { if (isSet(value)) params[key] = value }
      if (action === 'ple') {
        params.verbose = true
        if (vm.concurrent_leader_movements > 0) {
          params.concurrent_leader_movements = vm.concurrent_leader_movements
        }
        params.goals = 'PreferredLeaderElectionGoal'
        return vm.$helpers.getURL('rebalance', params)
      }
      if (action === 'demote') {
        // POST /kafkacruisecontrol/demote_broker
        params.verbose = true
        if (vm.selectedBrokers.length > 0) {
          params.brokerid = vm.selectedBrokers
        } else if (vm.brokerIdAndLogDirs.length > 0) {
          params.brokerid_and_logdirs = vm.brokerIdAndLogDirs.join(',')
        }
        if (vm.disallow_capacity_estimation) params.allow_capacity_estimation = false
        set('concurrent_leader_movements', vm.concurrent_leader_movements)
        set('replication_throttle', vm.replication_throttle)
        set('replica_movement_strategies', vm.replica_movement_strategies)
        if (vm.demote_urp) params.skip_urp_demotion = false
        if (vm.demote_followers) params.exclude_follower_demotion = false
        set('excluded_topics', vm.excluded_topics)
        set('included_topics', vm.included_topics)
        return vm.$helpers.getURL('demote_broker', params)
      }
      if (action === 'remove_disks') {
        // POST /kafkacruisecontrol/remove_disks
        params.brokerid_and_logdirs = vm.brokerIdAndLogDirs.join(',')
        if (vm.remove_disks_verbose) params.verbose = true
        if (vm.disallow_capacity_estimation) params.allow_capacity_estimation = false
        return vm.$helpers.getURL('remove_disks', params)
      }
      const meta = vm.actionMeta
      if (!meta) return ''
      // POST /kafkacruisecontrol/{rebalance,add_broker,remove_broker,fix_offline_replicas,topic_configuration}
      params.verbose = true
      const supports = (p) => vm.supports(p)
      if (action === 'rebalance_disk') params.rebalance_disk = true
      if (action === 'topic_configuration') {
        params.topic = vm.topic_regex
        params.replication_factor = vm.replication_factor
      }
      if (meta.withBrokers) params.brokerid = vm.selectedBrokers
      // goals run in the order they were ticked (their priority)
      if (supports('goals')) set('goals', vm.goals1.filter(g => vm.actionGoals.some(x => x.goal === g)))
      if (supports('skip_hard_goal_check') && vm.skip_hard_goal_check) params.skip_hard_goal_check = true
      if (supports('skip_rack_awareness_check') && vm.skip_rack_awareness_check) params.skip_rack_awareness_check = true
      if (supports('use_ready_default_goals') && vm.use_ready_default_goals) params.use_ready_default_goals = true
      if (supports('allow_capacity_estimation') && vm.disallow_capacity_estimation) params.allow_capacity_estimation = false
      if (supports('kafka_assigner') && vm.kafka_assigner) params.kafka_assigner = true
      if (supports('throttle_added_broker') && vm.throttle_added_broker) params.throttle_added_broker = true
      if (supports('throttle_removed_broker') && vm.throttle_removed_broker) params.throttle_removed_broker = true
      if (supports('rebalance_disk_broker_by_broker') && vm.rebalance_disk_broker_by_broker) params.rebalance_disk_broker_by_broker = true
      if (supports('data_from')) set('data_from', vm.data_from)
      // Disable this due to https://github.com/linkedin/cruise-control-ui/issues/40
      // params.excluded_topics = xssFilters.uriQueryInDoubleQuotedAttr(vm.excluded_topics)
      if (supports('excluded_topics')) set('excluded_topics', vm.excluded_topics)
      if (supports('included_topics')) set('included_topics', vm.included_topics)
      if (supports('concurrent_partition_movements_per_broker')) set('concurrent_partition_movements_per_broker', vm.concurrent_partition_movements_per_broker)
      if (supports('max_partition_movements_in_cluster')) set('max_partition_movements_in_cluster', vm.max_partition_movements_in_cluster)
      if (supports('concurrent_intra_broker_partition_movements')) set('concurrent_intra_broker_partition_movements', vm.concurrent_intra_broker_partition_movements)
      if (supports('concurrent_leader_movements')) set('concurrent_leader_movements', vm.concurrent_leader_movements)
      if (supports('replication_throttle')) set('replication_throttle', vm.replication_throttle)
      if (supports('log_dir_throttle')) set('log_dir_throttle', vm.log_dir_throttle)
      if (supports('replica_movement_strategies')) set('replica_movement_strategies', vm.replica_movement_strategies)
      if (supports('destination_broker_ids')) {
        // Rebalance Broker Disks: the brokers selected in the table; the other actions: the destination picker
        const ids = action === 'rebalance_disk' ? vm.selectedBrokers : vm.destination_broker_ids
        if (ids.length) params.destination_broker_ids = ids.join(',')
      }
      Object.keys(vm.executeOnlyParams).forEach(k => { delete params[k] })
      if (!vm.dryrun) Object.assign(params, vm.executeOnlyParams)
      return vm.$helpers.getURL(meta.endpoint, params)
    }
  },
  watch: {
    goals1: function (n, o) {
      this.disable_use_ready_default_goals = n.length > 0
      this.disable_kafka_assigner = n.length > 0
    },
    skip_hard_goal_check: function (n, o) {
      // console.log(n, o)
      if (n) {
        this.disable_kafka_assigner = true
      } else {
        this.disable_kafka_assigner = false
      }
    },
    use_ready_default_goals: function (n, o) {
      if (n) {
        this.goals1 = []
      }
      this.disable_goals1 = n
    },
    kafka_assigner: function (n, o) {
      if (n) {
        this.goals1 = []
        this.disable_goals1 = true
        this.disable_skip_hard_goal_check = true
        this.disable_use_ready_default_goals = true
      } else {
        this.disable_goals1 = false
        this.disable_skip_hard_goal_check = false
        this.disable_use_ready_default_goals = false
      }
    },
    actionName: function (n, o) {
      this.confirmExecute = false
      if (n === 'admin') this.getRecentBrokers()
      // the intra-broker goals of rebalance_disk are not accepted by the other actions, and vice versa
      const group = (action) => OPTIMIZATION_ACTIONS[action] ? OPTIMIZATION_ACTIONS[action].goalGroup : null
      if (group(n) !== group(o)) {
        this.goals1 = []
      }
    },
    group: function (ogroup, ngroup) {
      this.argsChanged()
    },
    cluster: function (ocluster, ncluster) {
      this.argsChanged()
    }
  },
  methods: {
    sortAdmin (col) {
      this.adminSortColumn = col
    },
    // whether the chosen goal-based action's endpoint accepts this request parameter
    supports (param) {
      if (this.actionName === 'rebalance' && QUEUED_DISK_PARAMS.includes(param) && !this.queue_rebalance_disk) return false
      return !!this.actionMeta && this.actionMeta.params.includes(param)
    },
    // pick an action: its targets are brokers or disks (demote_disks = demote with disks). The targets of another action
    // mean something else (a disk-rebalance scope is not a broker to remove), so they are dropped.
    chooseAction (key) {
      if (this.fixContext && key !== this.fixContext.action) this.fixContext = null
      this.targetsOpen = true
      if (key !== this.activeCard) {
        this.selectedBrokers = []
        this.selectedLogDirs = {}
      }
      const disks = key === 'remove_disks' || key === 'demote_disks'
      this.actionName = key === 'demote_disks' ? 'demote' : key
      this.setLogDirSelection(disks)
    },
    setLogDirSelection (disks) {
      if (this.enableLogDirSelection !== disks) {
        this.selectedBrokers = []
        this.selectedLogDirs = {}
      }
      this.enableLogDirSelection = disks
    },
    // a concurrency type's adjuster: 'true' (in enable_concurrency_adjuster_for), 'false' (in disable_...) or '' (not sent)
    adjusterFor (t) {
      return this.enable_concurrency_adjuster_for.includes(t) ? 'true' : this.disable_concurrency_adjuster_for.includes(t) ? 'false' : ''
    },
    setAdjusterFor (t, v) {
      this.enable_concurrency_adjuster_for = this.enable_concurrency_adjuster_for.filter(x => x !== t).concat(v === 'true' ? [t] : [])
      this.disable_concurrency_adjuster_for = this.disable_concurrency_adjuster_for.filter(x => x !== t).concat(v === 'false' ? [t] : [])
    },
    // the ids of a comma-separated list, and the list with one id added or removed
    idList (text) {
      return String(text || '').split(/[\s,]+/).filter(x => x)
    },
    toggleId (text, id) {
      const ids = this.idList(text)
      return (ids.includes(String(id)) ? ids.filter(x => x !== String(id)) : ids.concat([String(id)])).join(',')
    },
    // the recently removed / demoted brokers, from the executor state: Settings offers them to drop
    getRecentBrokers () {
      const vm = this
      fetchCC(vm.$helpers.getURL('state', { substates: 'executor' })).then((result) => {
        const e = result.type === 'success' && result.data && result.data.ExecutorState
        if (e) vm.recentBrokers = { loaded: true, removed: e.recentlyRemovedBrokers || [], demoted: e.recentlyDemotedBrokers || [] }
      }).catch(() => {
        // the text fields still work
      })
    },
    // a click anywhere on a broker row (but on its controls) selects or unselects the broker
    toggleBrokerRow (bid, event) {
      if (this.enableLogDirSelection || event.target.closest('input, a, button, label')) return
      this.selectedBrokers = this.selectedBrokers.includes(bid) ? this.selectedBrokers.filter(b => b !== bid) : [...this.selectedBrokers, bid]
      this.selectedLogDirs = {}
    },
    // Cluster Load's "Fix" (?fix=action&brokers=ids&limit=label): that action, its brokers selected, and a dry run at once. The
    // query is dropped once applied, so that a reload does not run it again.
    applyFixQuery () {
      const q = this.$route.query
      if (!q.fix) return
      this.$router.replace({ name: this.$route.name, params: this.$route.params, query: {} })
      if (!ACTION_CARDS.some(c => c.key === q.fix)) return
      const known = new Set(this.sortedAdminBrokers.map(r => r.bid))
      const ids = String(q.brokers || '').split(',').filter(x => x !== '').map(Number).filter(id => known.has(id))
      this.chooseAction(q.fix)
      this.targetsOpen = false
      if (this.targetMode === 'brokers') this.selectedBrokers = ids
      this.fixContext = { action: q.fix, limit: String(q.limit || ''), brokers: this.targetMode === 'brokers' ? ids : [] }
      this.$nextTick(() => { if (!this.missing) this.runDry() })
    },
    // the brokers whose load the request can change, when not every broker's: those a disk rebalance is limited to, or whose
    // disks Remove Disks empties (null: every broker)
    postScope () {
      if (this.actionName === 'rebalance_disk' && this.selectedBrokers.length) return this.selectedBrokers.slice()
      if (this.actionName === 'remove_disks') return Array.from(new Set(this.brokerIdAndLogDirs.map(k => Number(k.split('-')[0]))))
      return null
    },
    // Rebalance Broker Disks without these brokers: the selection becomes the other brokers (none selected = every broker)
    leaveOutBrokers (ids) {
      const scope = this.selectedBrokers.length ? this.selectedBrokers : this.sortedAdminBrokers.map(r => r.bid)
      this.selectedBrokers = scope.filter(b => !ids.includes(b))
      this.selectedLogDirs = {}
    },
    setAllGroups (open) {
      Object.keys(this.openGroups).forEach(k => { this.openGroups[k] = open })
    },
    // how many parameters of an option group are set (to something else than Cruise Control's default)
    groupSetCount (key) {
      const g = OPTION_GROUPS.find(x => x.key === key)
      const value = {
        goals: this.goals1.length ? this.goals1 : null,
        allow_capacity_estimation: this.disallow_capacity_estimation || null,
        destination_broker_ids: this.destination_broker_ids.length ? this.destination_broker_ids : null,
        replica_movement_strategies: this.replica_movement_strategies.length ? this.replica_movement_strategies : null
      }
      if (key === 'queue' && !this.supports('queue_rebalance_disk')) return 0
      // a rebalance shows (and counts) its disk-phase parameters in the queue group only
      const own = (p) => key === 'queue' || this.actionName !== 'rebalance' || !QUEUED_DISK_PARAMS.includes(p)
      return g.params.filter(p => this.supports(p) && own(p)).filter(p => {
        const v = p in value ? value[p] : this[p]
        return v !== null && v !== undefined && v !== '' && v !== false
      }).length
    },
    // back to Cruise Control's defaults
    resetOptions () {
      this.goals1 = []
      this.disallow_capacity_estimation = false
      this.demote_urp = false
      this.demote_followers = false
      this.skip_hard_goal_check = false
      this.use_ready_default_goals = false
      this.kafka_assigner = false
      this.data_from = ''
      this.excluded_topics = ''
      this.included_topics = ''
      this.concurrent_partition_movements_per_broker = null
      this.destination_broker_ids = []
      this.max_partition_movements_in_cluster = null
      this.concurrent_intra_broker_partition_movements = null
      this.concurrent_leader_movements = null
      this.replication_throttle = null
      this.log_dir_throttle = null
      this.replica_movement_strategies = []
      this.rebalance_disk_broker_by_broker = false
      this.queue_rebalance_disk = false
      this.skip_rack_awareness_check = false
      this.throttle_added_broker = false
      this.throttle_removed_broker = false
    },
    runDry () {
      this.confirmExecute = false
      this.dryrun = true
      this.actionBroker()
    },
    // the same request with dryrun=false, after the confirmation; the preview goes back to the dry run
    executeNow () {
      this.confirmExecute = false
      this.dryrun = false
      this.actionBroker()
      this.dryrun = true
    },
    clearPostResponse () {
      if (this.postRetryTimer) {
        clearTimeout(this.postRetryTimer)
        this.postRetryTimer = null
      }
      this.posted = false
      this.posturl = null
      this.postResponse = ''
      this.postAsync = false
      this.postTaskId = null
      this.postError = false
      this.showRawResponse = false
      this.dataParsed = false
    },
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
      this.clearPostResponse()
      if (this.asyncRetryTimer) {
        clearTimeout(this.asyncRetryTimer)
        this.asyncRetryTimer = null
      }
      this.getKafkaState()
      this.getBrokerDetails()
    },
    actionBroker () {
      this.clearPostResponse()
      this.posted = true
      this.posturl = this.actionURL
      this.postedTitle = this.currentCard ? this.currentCard.title : this.actionName
      this.postedDryRun = this.actionName === 'admin' || this.dryrun
      this.postedAction = this.actionName
      this.postedScope = this.postScope()
      this.postedAt = new Date().toLocaleTimeString()
      this.post()
      this.scrollToResult()
    },
    // bring the result card into view (it is below the panel)
    scrollToResult () {
      this.$nextTick(() => {
        const el = this.$refs.result
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    copyURL () {
      const done = () => {
        this.copied = true
        setTimeout(() => { this.copied = false }, 1500)
      }
      const text = this.actionURL
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, () => {})
        return
      }
      // http on another host: no clipboard API
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        if (document.execCommand('copy')) done()
      } finally {
        document.body.removeChild(ta)
      }
    },
    // Poll a POST that CC answered with 202 (still computing): the same request with the User-Task-ID CC gave for it.
    pollPost () {
      if (this.postRetryTimer) {
        clearTimeout(this.postRetryTimer)
        this.postRetryTimer = null
      }
      if (this.posturl && this.postTaskId) {
        this.post(this.postTaskId)
      }
    },
    post (taskId) {
      const vm = this
      const url = vm.posturl
      const config = { withCredentials: true }
      // A User-Task-ID header only polls the task CC created for this very request; a new POST must not carry one
      // (CC rejects a stale task ID with an "Unexpected header" error).
      if (taskId) {
        config.headers = { 'User-Task-ID': taskId }
      }
      this.$http.post(url, null, config).then((r) => {
        if (vm.posturl !== url) return // cleared or replaced meanwhile
        vm.detectedUserTaskId = Object.prototype.hasOwnProperty.call(r.headers, 'user-task-id')
        vm.posted = true
        vm.postError = false
        const data = r.data
        vm.postResponse = data
        if (r.status === 202 && vm.detectedUserTaskId) {
          vm.postAsync = true
          vm.postTaskId = r.headers['user-task-id']
          vm.postRetryTimer = setTimeout(() => vm.pollPost(), ASYNC_RETRY_DELAY)
          return
        }
        vm.postAsync = false
        const summary = (data && data.summary) || data
        vm.dataParsed = !!(summary && typeof summary === 'object' && (summary.numReplicaMovements != null || summary.numLeaderMovements != null || summary.numIntraBrokerReplicaMovements != null))
        vm.scrollToResult()
      }, (e) => {
        if (vm.posturl !== url) return
        vm.posted = true
        vm.postAsync = false
        vm.postError = true
        vm.postResponse = (e && e.response ? e.response.data : e) || 'The request failed'
        vm.scrollToResult()
      })
    },
    getBrokerDetails () {
      const vm = this
      const url = vm.$helpers.getURL('load', { allow_capacity_estimation: true })
      fetchCC(url).then((result) => {
        if (result.type === 'success' && result.data && result.data.brokers) {
          const details = {}
          result.data.brokers.forEach(function (b) {
            details[String(b.Broker)] = b
          })
          vm.brokerDetails = details
        }
      }).catch(() => {
        // silently ignore - broker details are supplementary
      })
    },
    getKafkaState () {
      const vm = this
      vm.error = false
      vm.async = false
      vm.loading = true
      const url = vm.$helpers.getURL('kafka_cluster_state')
      fetchCC(url).then((result) => {
        vm.detectedUserTaskId = result.headers.has('user-task-id')
        if (result.type === 'error') {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.loading = false
          vm.loaded = false
          vm.error = true
          vm.errorData = result.data || result.status
        } else if (result.type === 'empty') {
          vm.loading = false
          vm.error = true
          vm.errorData = 'CruiseControl sent an empty response with 200-OK status code. Please file a bug here https://github.com/linkedin/cruise-control/issues'
        } else if (result.type === 'async') {
          vm.loading = false
          vm.async = true
          vm.asyncData = result.data
          vm.showAsyncRefreshButton = true
          if (vm.asyncRetryTimer) clearTimeout(vm.asyncRetryTimer)
          vm.asyncRetryTimer = setTimeout(() => vm.getKafkaState(), ASYNC_RETRY_DELAY)
        } else {
          if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
          vm.async = false
          vm.error = false
          vm.errorData = null
          vm.loading = false
          vm.loaded = true
          vm.showAsyncRefreshButton = false
          const data = result.data
          vm.KafkaBrokerState.ReplicaCountByBrokerId = data.KafkaBrokerState.ReplicaCountByBrokerId
          vm.KafkaBrokerState.OutOfSyncCountByBrokerId = data.KafkaBrokerState.OutOfSyncCountByBrokerId
          vm.KafkaBrokerState.LeaderCountByBrokerId = data.KafkaBrokerState.LeaderCountByBrokerId
          try {
            vm.KafkaBrokerState.OfflineReplicaCountByBrokerId = data.KafkaBrokerState.OfflineReplicaCountByBrokerId
            // whole new maps: keys added to the old ones would not be reactive (nor would a refresh drop a recovered disk)
            const sorted = (byBroker) => Object.keys(byBroker).reduce((m, b) => { m[b] = byBroker[b].slice().sort(); return m }, {})
            vm.KafkaBrokerState.OfflineLogDirsByBrokerId = sorted(data.KafkaBrokerState.OfflineLogDirsByBrokerId)
            vm.KafkaBrokerState.OnlineLogDirsByBrokerId = sorted(data.KafkaBrokerState.OnlineLogDirsByBrokerId)
          } catch (e) {
            // Kafka 2.0 features not available
          }
          vm.applyFixQuery()
        }
      }).catch((e) => {
        if (vm.asyncRetryTimer) { clearTimeout(vm.asyncRetryTimer); vm.asyncRetryTimer = null }
        vm.loading = false
        vm.error = true
        vm.errorData = e
      })
    }
  }
}
</script>

<style scoped>
.pointer { cursor: pointer; }
.response-value { white-space: pre-wrap; }
.filter-input { min-width: 300px; }
.action-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); gap: 14px 16px; margin-bottom: 18px; }
.group-label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); margin: 0 0 7px 4px; }
.action-cards { display: flex; flex-direction: column; gap: 8px; }
.action-card {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 10px 13px;
  border-radius: 12px; background: var(--glass); border: 1px solid var(--glass-border); color: var(--text);
  -webkit-backdrop-filter: blur(var(--blur)); backdrop-filter: blur(var(--blur));
  transition: background 0.15s, border-color 0.15s, transform 0.1s, box-shadow 0.15s; cursor: pointer;
}
.action-card i { font-size: 1.25rem; color: var(--primary); width: 26px; text-align: center; flex: none; }
.action-text { display: flex; flex-direction: column; line-height: 1.25; }
.action-text b { font-weight: 600; color: var(--text-strong); }
.action-text small { color: var(--muted); }
.action-card:hover { background: var(--glass-strong); transform: translateY(-1px); }
.action-card:focus { outline: none; box-shadow: 0 0 0 3px var(--primary-soft); }
.action-card.active { border-color: var(--primary); background: var(--primary-soft); box-shadow: 0 0 0 1px var(--primary), 0 8px 24px rgba(99, 102, 241, 0.25); }
.action-panel { border-left: 3px solid var(--primary); }
.action-panel.tone-danger { border-left-color: var(--danger); }
.action-panel.tone-warning { border-left-color: var(--warning); }
.action-panel.tone-success { border-left-color: var(--success); }
.action-panel .card-header { font-size: 1.05rem; }
.panel-desc { font-weight: 400; color: var(--muted); font-size: 0.85rem; margin-top: 3px; }
.step { padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid var(--line); }
.step > h6 { margin-bottom: 12px; }
.step-no { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; align-items: center; justify-content: center; background: var(--primary-soft); color: var(--primary); font-size: 0.75rem; font-weight: 700; margin-right: 6px; }
.targets-bar .selection { color: var(--muted); }
.opt-group { border: 1px solid var(--line); border-radius: 12px; margin-bottom: 10px; background: var(--row-alt); }
.opt-head { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: transparent; border: 0; color: var(--text-strong); padding: 11px 14px; font-weight: 600; border-radius: 12px; }
.opt-head:hover { background: var(--row-hover); }
.opt-head:focus { outline: none; box-shadow: inset 0 0 0 2px var(--primary-soft); }
.opt-head .opt-title { font-size: 0.95rem; }
.opt-head small { font-weight: 400; }
.opt-icon { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 9px; background: var(--primary-soft); color: var(--primary); }
.opt-head .chevron { margin-left: auto; color: var(--muted); transition: transform 0.15s; }
.opt-head.open .chevron { transform: rotate(90deg); }
.opt-body { padding: 8px 18px 16px; }
.opt-sub + .opt-sub { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--line); }
.opt-sub-title { display: flex; align-items: center; gap: 7px; margin-bottom: 9px; color: var(--muted); font-size: 0.72rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.select-col { width: 72px; text-align: center; white-space: nowrap; }
.select-col label { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.pick-row { cursor: pointer; }
.pick-row.picked, .pick-row.picked:hover { background: var(--primary-soft); }
.logdir-check { display: flex; align-items: center; gap: 8px; margin: 2px 0; padding: 3px 8px; border-radius: 7px; cursor: pointer; }
.logdir-check:hover { background: var(--row-hover); }
.logdir-check.picked { background: var(--primary-soft); }
pre.request { background: rgba(0, 0, 0, 0.28); border: 1px solid var(--line); border-radius: 10px; padding: 10px 13px; color: var(--text); font-size: 0.8rem; white-space: pre-wrap; word-break: break-all; margin-bottom: 10px; }
html[data-theme="light"] pre.request { background: rgba(30, 41, 99, 0.05); }
pre.request code { color: inherit; }
.confirm-execute { border-left: 3px solid var(--danger); }
.request-box { position: relative; }
.request-box .copy-btn { position: absolute; top: 7px; right: 7px; padding: 1px 9px; font-size: 0.75rem; }
.run-buttons .spinner-border-sm { width: 0.9rem; height: 0.9rem; border-width: 0.15em; vertical-align: -2px; }
.result-card { scroll-margin-top: 90px; border-left: 3px solid var(--success); }
.result-card.error { border-left-color: var(--danger); }
.result-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.setting-row { display: grid; grid-template-columns: minmax(240px, 1fr) 2fr; gap: 6px 16px; align-items: center; padding: 7px 0; }
.setting-row + .setting-row { border-top: 1px solid var(--line-faint); }
.setting-row > label { margin: 0; }
.setting-row > div > .form-control { max-width: 420px; }
.settings-help { margin: -2px 0 10px; padding-left: 18px; }
.queue-notes { padding-left: 18px; }
.fix-note { margin-bottom: 14px; }
.queue-notes li + li { margin-top: 3px; }
.offline-dir-broker + .offline-dir-broker::before { content: ', '; }
</style>
