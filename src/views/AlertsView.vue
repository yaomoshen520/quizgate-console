<script setup lang="ts">
import { computed } from 'vue'
import { GateEventKind } from '../gen/quizgate_pb'
import { alerts, refreshAlerts } from '../store/alerts'
import { absolute, relative } from '../utils/time'

/**
 * 两档确定性分开摆：上面那一屏是设备亲口说的（它当时还活着，才报得出这句），
 * 下面那一屏是服务端反推的（app 没了就没有代码在跑，"我卸载了"这条消息根本没有发送者）。
 * 混在一张列表里，家长就会把"可能是关机"当成"已经确认卸载"。
 */
const LABELS: Record<GateEventKind, string> = {
  [GateEventKind.GATE_EVENT_UNSPECIFIED]: '未归类',
  [GateEventKind.ACCESSIBILITY_OFF]: '看时长被关',
  [GateEventKind.ACCESSIBILITY_RESTORED]: '看时长恢复',
  [GateEventKind.OVERLAY_OFF]: '答题页盖不住屏幕',
  [GateEventKind.OVERLAY_RESTORED]: '答题页恢复',
  [GateEventKind.NOTIFICATIONS_OFF]: '掉线提示被关',
  [GateEventKind.NOTIFICATIONS_RESTORED]: '掉线提示恢复',
  [GateEventKind.GATE_INTERRUPTED]: '闸门停过一段',
}

/** 恢复类只报平安，红色只留给"这一刻闸门没在拦"。 */
const RESTORED = new Set<GateEventKind>([
  GateEventKind.ACCESSIBILITY_RESTORED,
  GateEventKind.OVERLAY_RESTORED,
  GateEventKind.NOTIFICATIONS_RESTORED,
])

function label(kind: GateEventKind): string {
  return LABELS[kind] ?? LABELS[GateEventKind.GATE_EVENT_UNSPECIFIED]
}

function tone(kind: GateEventKind): string {
  return RESTORED.has(kind) ? 'badge--ok' : 'badge--danger'
}

const offlineMinutes = computed(() => {
  const ms = Number(alerts.offlineAfterMs)
  return ms > 0 ? Math.round(ms / 60_000) : 0
})

const empty = computed(() => alerts.loaded && alerts.items.length === 0 && alerts.offline.length === 0)
</script>

<template>
  <div class="stack">
    <p v-if="alerts.error" class="alert alert--error" role="alert">
      <span aria-hidden="true">✕</span>
      <span>告警没取回来：{{ alerts.error }}</span>
    </p>

    <div class="spread page-head">
      <div>
        <h1 class="t-page">闸门告警</h1>
        <p class="muted">
          孩子对闸门本身做过什么，以及哪些设备已经不再报到了。
        </p>
      </div>
      <button class="btn btn--ghost" @click="refreshAlerts()">重新取一次</button>
    </div>

    <section v-if="alerts.offline.length > 0" class="card card--flush">
      <div class="card__head">
        <h2 class="t-card">失联的设备</h2>
        <span class="muted">服务端按"多久没出现"推出来的，不是设备自报的。</span>
      </div>
      <table class="table table--stack" role="table">
        <thead>
          <tr>
            <th scope="col">孩子</th>
            <th scope="col">最后上报</th>
            <th scope="col"><span class="sr">这台机器</span></th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr v-for="item in alerts.offline" :key="item.childId" role="row">
            <td role="cell" data-label="孩子">
              <span class="who">
                <strong>{{ item.childName }}</strong>
                <span class="mono">id {{ item.childId }}</span>
              </span>
            </td>
            <td role="cell" data-label="最后上报">
              <span class="when">
                {{ relative(item.lastHeartbeatMs) }}
                <span v-if="item.lastHeartbeatMs !== 0n" class="when__abs">
                  {{ absolute(item.lastHeartbeatMs) }}
                </span>
              </span>
            </td>
            <td role="cell" data-label="这台机器">
              <span class="when">
                {{ item.deviceModel || '型号未上报' }}
                <span class="when__abs">
                  {{
                    offlineMinutes > 0
                      ? `超过 ${offlineMinutes} 分钟没上报：失联，可能是卸载、关机或断网`
                      : '失联，可能是卸载、关机或断网'
                  }}
                </span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="card__foot muted">
        「失联」只表示超过约定时间没有收到心跳，可能是卸载、关机或断网，不能据此确定原因。
        请检查设备电量、网络和 App 权限，再确认能否恢复心跳；重新登记也不能证明此前发生过卸载。
      </p>
    </section>

    <section v-if="alerts.items.length > 0" class="card card--flush">
      <div class="card__head">
        <h2 class="t-card">设备报回来的记录</h2>
        <span class="muted">每一条都是孩子手上那台机器自己写的话，服务端只限长、不改写。</span>
      </div>
      <table class="table table--stack" role="table">
        <thead>
          <tr>
            <th scope="col">孩子</th>
            <th scope="col">做了什么</th>
            <th scope="col">时间</th>
            <th scope="col"><span class="sr">设备原文</span></th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr v-for="item in alerts.items" :key="`${item.childId}-${item.occurredAtMs}-${item.kind}`" role="row">
            <td role="cell" data-label="孩子">
              <span class="who">
                <strong>{{ item.childName }}</strong>
                <span class="mono">{{ item.deviceModel || '型号未上报' }}</span>
              </span>
            </td>
            <td role="cell" data-label="做了什么">
              <span class="badge" :class="tone(item.kind)">
                <span class="badge__dot" aria-hidden="true"></span>
                {{ label(item.kind) }}
              </span>
            </td>
            <td role="cell" data-label="时间">
              <span class="when">
                {{ relative(item.occurredAtMs) }}
                <span class="when__abs">{{ absolute(item.occurredAtMs) }}</span>
              </span>
            </td>
            <td role="cell" data-label="设备原文" class="detail">{{ item.detail }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="empty" class="card empty">
      <h2 class="t-card">目前没有任何一条</h2>
      <p class="muted">
        没有设备失联，也没有孩子关掉闸门的记录。这一页是"没消息就是好消息"的那种页面——
        它不显示就代表服务端这段时间没收到过任何一条动手记录。
      </p>
    </section>
  </div>
</template>

<style scoped>
.page-head {
  align-items: flex-start;
}
.page-head .muted {
  margin-top: var(--sp-1);
}
.who {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.who strong {
  font-weight: 600;
}
.who .mono {
  color: hsl(var(--muted));
  font-size: var(--text-xs);
}
.when {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.when__abs {
  color: hsl(var(--muted));
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.detail {
  color: hsl(var(--ink-soft));
  font-size: var(--text-sm);
}
.card__foot {
  padding: var(--sp-4) var(--sp-5);
  border-top: 1px solid hsl(var(--line));
}
</style>
