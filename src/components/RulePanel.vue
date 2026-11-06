<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { rpc } from '../api/rpc'
import {
  GetRuleReplySchema,
  GetRuleRequestSchema,
  RuleSnapshotSchema,
  SaveRuleRequestSchema,
} from '../gen/quizgate_pb'
import type { RuleSnapshot } from '../gen/quizgate_pb'
import { session } from '../store/session'

const props = defineProps<{ childId: string }>()

const threshold = ref(0)
const dailyLimit = ref(0)
const grace = ref(0)
const enabled = ref(true)
const packagesText = ref('')

const loadedVersion = ref(0n)
const neverConfigured = computed(() => loadedVersion.value === 0n)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')

/** 监管清单是一行一个包名；顺手吃掉空行和行内空格，免得存进去一个 " com.x " 匹配不到任何应用。 */
const packages = computed(() =>
  packagesText.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== ''),
)

const watchedCount = computed(() => packages.value.length)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const reply = await rpc(
      '/parent/get-rule',
      GetRuleRequestSchema,
      GetRuleReplySchema,
      { childId: props.childId },
      session.parentToken,
    )
    // rule 是 proto3 的 message 字段，可能整个缺席；缺席就明说，别拿一串 0 当"当前的规则"显示给家长。
    if (reply.rule === undefined) {
      error.value = '服务端没带规则回来（get-rule 应答里 rule 字段是空的）'
      return
    }
    fill(reply.rule)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function fill(rule: RuleSnapshot) {
  threshold.value = rule.thresholdMinutes
  dailyLimit.value = rule.dailyLimitMinutes
  grace.value = rule.graceMinutes
  enabled.value = rule.enabled
  packagesText.value = rule.watchedPackages.join('\n')
  loadedVersion.value = rule.version
}

/**
 * 服务端 /save-rule 的应答体就是裸的 RuleSnapshot（不是包一层 Reply），
 * 版本是服务端时钟盖的，这里必须用应答回填，本地拼一个"版本号"会显示出一个库里没有的数。
 *
 * 请求里也别把读到的 version 原样发回去：SaveRuleRequest 没有版本字段，服务端也不看，
 * 它每次都重新盖章。真发一个只会被丢掉，留着反而像是这页能做多版本编辑。
 */
async function save() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const saved = await rpc(
      '/parent/save-rule',
      SaveRuleRequestSchema,
      RuleSnapshotSchema,
      {
        childId: props.childId,
        rule: {
          thresholdMinutes: threshold.value,
          dailyLimitMinutes: dailyLimit.value,
          graceMinutes: grace.value,
          // enabled 是跟着请求裸发的布尔，protobuf 默认值就是 false——这个字段必须显式带上，
          // 否则"我只是改了个分钟数"会把闸门悄悄关掉。
          enabled: enabled.value,
          watchedPackages: packages.value,
        },
      },
      session.parentToken,
    )
    fill(saved)
    notice.value = `已保存，规则版本 ${saved.version}。`
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="card">
    <div class="spread head">
      <div>
        <h2 class="t-card">闸门规则</h2>
        <p class="muted">
          {{
            neverConfigured
              ? '这个孩子还没存过规则，下面显示的是服务端默认值；保存一次才会写进库。'
              : `当前生效的是库里这一份（版本 ${loadedVersion}）。`
          }}
        </p>
      </div>
      <button class="btn btn--ghost" :disabled="loading" @click="load">
        {{ loading ? '读取中…' : '重新读取' }}
      </button>
    </div>

    <p v-if="error" class="alert alert--error" role="alert">
      <span aria-hidden="true">✕</span>
      <span>{{ error }}</span>
    </p>
    <p v-else-if="notice" class="alert alert--ok" role="status">
      <span aria-hidden="true">✓</span>
      <span>{{ notice }}</span>
    </p>

    <div class="grid">
      <label class="field">
        <span class="field__label">玩满多少分钟弹窗</span>
        <input v-model.number="threshold" class="input" type="number" min="1" max="600" />
        <span class="muted hint">连续用娱乐应用达到这个时长就抢屏出题。填 0 会被服务端退回默认 30。</span>
      </label>
      <label class="field">
        <span class="field__label">每日上限（分钟）</span>
        <input v-model.number="dailyLimit" class="input" type="number" min="1" max="1440" />
        <span class="muted hint">当天娱乐时长累计到这里就不再放行新会话。填 0 会被服务端退回 120，不是"不限"。</span>
      </label>
      <label class="field">
        <span class="field__label">答题宽限（分钟）</span>
        <input v-model.number="grace" class="input" type="number" min="0" max="60" />
        <span class="muted hint">答错后隔多久可以再来一次。0 表示答错即锁到明天。</span>
      </label>
      <div class="field">
        <span class="field__label">闸门开关</span>
        <label class="check">
          <input v-model="enabled" type="checkbox" />
          启用
        </label>
        <span class="muted hint">关掉后设备仍会上报用量，只是不再弹窗。这个开关跟着请求一起发，不是只读展示。</span>
      </div>
    </div>

    <label class="field packages">
      <span class="field__label">监管应用清单（一行一个包名，共 {{ watchedCount }} 条）</span>
      <textarea
        v-model="packagesText"
        class="input input--area"
        placeholder="com.android.chrome&#10;tv.danmaku.bili"
        spellcheck="false"
        autocapitalize="off"
      ></textarea>
      <span class="muted hint">
        留空表示按设备内置的那份清单计时。
      </span>
    </label>

    <div class="row row--tight foot">
      <button class="btn btn--primary" :disabled="busy || loading" @click="save">
        <span v-if="busy" class="spinner" aria-hidden="true"></span>
        {{ busy ? '保存中…' : '保存并下发' }}
      </button>
      <p class="muted fine">
        规则写进库、版本由服务端盖章，孩子设备下一次心跳就会发现变了。设备内置清单与每日上限的落地要等 S3，见页顶那条提示。
      </p>
    </div>
  </section>
</template>

<style scoped>
.head {
  align-items: flex-start;
}
.head .muted {
  margin-top: var(--sp-1);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--sp-4);
  margin-top: var(--sp-5);
}
.hint {
  font-size: var(--text-xs);
  line-height: 1.45;
}
.packages {
  margin-top: var(--sp-5);
}
/* 保存按钮和那句说明别排成一行：说明是三行长文，窄屏上会把按钮顶出去。 */
.foot {
  flex-wrap: wrap;
  align-items: flex-start;
  margin-top: var(--sp-5);
}
.fine {
  flex: 1 1 260px;
  font-size: var(--text-xs);
  line-height: 1.45;
}
</style>
