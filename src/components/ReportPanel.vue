<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StatCard from './StatCard.vue'
import { rpc } from '../api/rpc'
import { GetReportReplySchema, GetReportRequestSchema } from '../gen/quizgate_pb'
import type { DailyStat } from '../gen/quizgate_pb'
import { session } from '../store/session'

const props = defineProps<{ childId: string }>()

const days = ref(7)
const stats = ref<DailyStat[]>([])
const loading = ref(false)
const error = ref('')

/** 时长按"分钟"给家长看：毫秒数在这个页面上没有任何可读性。 */
function minutes(ms: bigint): number {
  return Math.round(Number(ms) / 60000)
}

function dayStart(offsetDays: number): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime() - offsetDays * 86_400_000
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const reply = await rpc(
      '/parent/get-report',
      GetReportRequestSchema,
      GetReportReplySchema,
      {
        childId: props.childId,
        // until 在服务端是开区间（occurred_at_ms < until），所以给明天零点而不是今天 23:59:59.999。
        sinceMs: BigInt(dayStart(days.value - 1)),
        untilMs: BigInt(dayStart(0) + 86_400_000),
      },
      session.parentToken,
    )
    // 服务端只按天聚合出"有记录的那些天"，空白天不会补零行；这里只负责把最新的排在前面。
    stats.value = [...reply.stats].sort((a, b) => b.date.localeCompare(a.date))
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

const totals = computed(() => {
  const t = { played: 0, correct: 0, wrong: 0, interceptions: 0, failures: 0 }
  for (const s of stats.value) {
    t.played += minutes(s.playedMs)
    t.correct += s.correctCount
    t.wrong += s.wrongCount
    t.interceptions += s.interceptions
    t.failures += s.interceptionFailures
  }
  return t
})

const accuracy = computed(() => {
  const answered = totals.value.correct + totals.value.wrong
  if (answered === 0) return '—'
  return `${Math.round((totals.value.correct / answered) * 100)}%`
})

const today = computed(() => {
  const key = new Date().toLocaleDateString('sv-SE')
  return stats.value.find((s) => s.date === key)
})
</script>

<template>
  <div class="stack">
    <section class="card">
      <div class="spread head">
        <div>
          <h2 class="t-card">用量</h2>
          <p class="muted">
            娱乐时长、答题数和抢屏失败来自设备上报，服务端出题数单独统计。没有记录的日期不补零；空表不能据此判断设备是否使用过。
          </p>
        </div>
        <div class="row--tight pick">
          <label class="field">
            <span class="field__label">区间</span>
            <select v-model.number="days" class="input" @change="load">
              <option :value="7">近 7 天</option>
              <option :value="14">近 14 天</option>
              <option :value="30">近 30 天</option>
            </select>
          </label>
          <button class="btn btn--ghost reload" :disabled="loading" @click="load">
            {{ loading ? '读取中…' : '刷新' }}
          </button>
        </div>
      </div>

      <p v-if="error" class="alert alert--error msg" role="alert">
        <span aria-hidden="true">✕</span>
        <span>{{ error }}</span>
      </p>

      <template v-else>
        <div class="grid-kpi totals">
          <StatCard
            icon="clock"
            :label="`近 ${days} 天娱乐时长`"
            :value="totals.played"
            :hint="today ? `今天 ${minutes(today.playedMs)} 分钟` : '今天还没有上报'"
            :tone="totals.played > 0 ? 'brand' : 'idle'"
          />
          <StatCard
            icon="gate"
            label="答题"
            :value="`${totals.correct} / ${totals.correct + totals.wrong}`"
            :hint="`对 ${totals.correct} · 错 ${totals.wrong} · 正确率 ${accuracy}`"
            :tone="totals.correct + totals.wrong > 0 ? 'ok' : 'idle'"
          />
          <StatCard
            icon="device"
            label="服务端出题"
            :value="totals.interceptions"
            hint="含换题，本地题不计入"
            :tone="totals.interceptions > 0 ? 'warn' : 'idle'"
          />
          <StatCard
            icon="child"
            label="拦截失败"
            :value="totals.failures"
            hint="设备报告抢屏未成功"
            :tone="totals.failures > 0 ? 'warn' : 'ok'"
          />
        </div>

        <!-- 按天的用量不卡片化（五条标签竖着排看不出趋势），窄屏只收紧内边距；
             真装不下时由这一层横着滚，而不是把数字裁掉——裁掉的数字家长会当成"那天没玩"。 -->
        <div v-if="stats.length > 0" class="scroll">
          <table class="table table--dense">
            <thead>
              <tr>
                <th scope="col">日期</th>
                <th scope="col">娱乐时长</th>
                <th scope="col">对/错</th>
                <th scope="col">服务端出题</th>
                <th scope="col">拦截失败</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in stats" :key="s.date">
                <td><strong>{{ s.date }}</strong></td>
                <td class="num">{{ minutes(s.playedMs) }} 分钟</td>
                <td class="num">{{ s.correctCount }} / {{ s.wrongCount }}</td>
                <td class="num">{{ s.interceptions }}</td>
                <td>
                  <span class="badge" :class="s.interceptionFailures > 0 ? 'badge--warn' : 'badge--idle'">
                    <span class="badge__dot" aria-hidden="true"></span>
                    {{ s.interceptionFailures }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted msg">这个区间还没有任何上报记录。</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.head {
  align-items: flex-start;
}
.head .muted {
  margin-top: var(--sp-1);
  max-width: 60ch;
}
.pick {
  align-items: flex-end;
  flex: none;
}
.reload {
  height: var(--ctl-h);
}
.msg {
  margin-top: var(--sp-4);
}
.totals {
  margin-top: var(--sp-5);
}
/* 表格本身不套内边距（数字要和卡片左边对齐），外面这层只兜窄屏的横向滚动。 */
.scroll {
  margin-top: var(--sp-5);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
</style>
