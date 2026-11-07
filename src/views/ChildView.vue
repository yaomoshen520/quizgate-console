<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RulePanel from '../components/RulePanel.vue'
import BankPanel from '../components/BankPanel.vue'
import ReportPanel from '../components/ReportPanel.vue'
import { rpc } from '../api/rpc'
import { ListChildrenReplySchema, ListChildrenRequestSchema } from '../gen/quizgate_pb'
import { session } from '../store/session'
import { absolute, relative } from '../utils/time'

const TABS = [
  { key: 'rule', label: '闸门规则' },
  { key: 'bank', label: '题库' },
  { key: 'report', label: '用量报表' },
] as const

type TabKey = (typeof TABS)[number]['key']

const route = useRoute()
const router = useRouter()

const childId = computed(() => String(route.params.id ?? ''))
const child = computed(() => session.children.find((c) => c.childId === childId.value))
const retrying = ref(false)
const loadError = ref('')

/**
 * 令牌活得过页面刷新，session 里的孩子列表活不过：直接敲 /#/child/2 进来时数组是空的。
 * 所以找不到就用令牌重取一次，而不是把"这个孩子不存在"当结论。
 */
async function ensureLoaded() {
  if (child.value !== undefined || childId.value === '') return
  retrying.value = true
  loadError.value = ''
  try {
    const reply = await rpc(
      '/parent/list-children',
      ListChildrenRequestSchema,
      ListChildrenReplySchema,
      {},
      session.parentToken,
    )
    session.children = [...reply.children]
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    retrying.value = false
  }
}

onMounted(ensureLoaded)

const tab = computed<TabKey>(() => {
  const asked = String(route.query.tab ?? '')
  return TABS.some((t) => t.key === asked) ? (asked as TabKey) : 'rule'
})

function select(key: TabKey) {
  void router.replace({ path: `/child/${childId.value}`, query: { tab: key } })
}

const apiLevelText = computed(() => {
  const level = child.value?.androidApiLevel ?? 0
  // 0 是"这台设备登记得早，没存等级"，不是"Android API 0"。
  return level > 0 ? `Android API ${level}` : '系统版本未上报'
})
</script>

<template>
  <div class="stack">
    <RouterLink to="/" class="back">← 返回概览</RouterLink>

    <p v-if="loadError" class="alert alert--error" role="alert">
      <span aria-hidden="true">✕</span>
      <span>孩子信息没取回来：{{ loadError }}</span>
    </p>

    <template v-if="child">
      <section class="card child-card">
        <div class="row child-head">
          <span class="avatar avatar--lg" aria-hidden="true">{{ child.displayName.slice(0, 1) }}</span>
          <div class="who">
            <h1 class="t-page">{{ child.displayName }}</h1>
            <p class="muted">{{ child.grade }} 年级 · id {{ child.childId }}</p>
          </div>
          <div class="row--tight child-state">
            <span class="badge" :class="child.deviceBound ? 'badge--ok' : 'badge--idle'">
              <span class="badge__dot" aria-hidden="true"></span>
              {{ child.deviceBound ? '已绑定设备' : '未绑定设备' }}
            </span>
            <span v-if="child.deviceModel" class="badge badge--info">
              <span class="badge__dot" aria-hidden="true"></span>
              {{ child.deviceModel }}
            </span>
            <span v-if="child.deviceBound" class="badge badge--idle">
              <span class="badge__dot" aria-hidden="true"></span>
              {{ apiLevelText }}
            </span>
          </div>
        </div>
        <p class="muted last-seen">
          最近上报：{{ relative(child.lastHeartbeatMs) }}
          <span v-if="child.lastHeartbeatMs !== 0n" class="mono tiny">{{ absolute(child.lastHeartbeatMs) }}</span>
          <span v-else>——这台设备一次都还没报过，下面的配置要先存到服务器。</span>
        </p>
      </section>

      <p class="alert alert--info link-note">
        <span aria-hidden="true">i</span>
        <span>
          孩子设备已支持联网取题、判分和上报用量，断网时使用本地题目。连续娱乐时长阈值需在孩子端实验台开启「跟随服务端阈值」后才会同步。
          每日上限、闸门开关、监管清单和离开应用宽限目前只保存在服务端，尚未用于控制孩子设备。
        </span>
      </p>

      <nav class="tabs" aria-label="这个孩子的设置">
        <button
          v-for="item in TABS"
          :key="item.key"
          class="tabs__item"
          :class="{ 'tabs__item--on': tab === item.key }"
          :aria-current="tab === item.key ? 'page' : undefined"
          @click="select(item.key)"
        >
          {{ item.label }}
        </button>
      </nav>

      <RulePanel v-if="tab === 'rule'" :child-id="child.childId" />
      <BankPanel v-else-if="tab === 'bank'" :child-id="child.childId" :grade="child.grade" />
      <ReportPanel v-else :child-id="child.childId" />
    </template>

    <section v-else class="card not-found">
      <p class="muted">
        <template v-if="retrying">正在取这个账号下的孩子…</template>
        <template v-else-if="loadError">暂时读不到 {{ childId }} 号孩子，稍后重试或回概览页。</template>
        <template v-else>
          这个账号下没有 id 为 <strong class="mono">{{ childId }}</strong> 的孩子。
          别人家的孩子编号是猜不出内容的——服务端按账号过滤，越界编号到这里就是一句空。
        </template>
      </p>
      <button v-if="!retrying" class="btn btn--ghost" @click="ensureLoaded">重新读取</button>
    </section>
  </div>
</template>

<style scoped>
.back {
  font-size: var(--text-sm);
  color: hsl(var(--muted));
  width: fit-content;
}
.back:hover {
  color: hsl(var(--brand-700));
}
.child-head {
  align-items: flex-start;
  flex-wrap: wrap;
}
.avatar--lg {
  width: 48px;
  height: 48px;
  font-size: var(--text-lg);
}
.who {
  min-width: 0;
}
.who p {
  margin-top: 2px;
  font-size: var(--text-sm);
}
.child-state {
  margin-left: auto;
  flex-wrap: wrap;
}
.last-seen {
  margin-top: var(--sp-4);
  font-size: var(--text-sm);
}
.tiny {
  font-size: var(--text-xs);
  color: hsl(var(--muted));
  margin-left: var(--sp-2);
}
.link-note {
  font-size: var(--text-sm);
}
/* 读不到孩子这张卡：文案是主角，按钮跟在下面居中，不用 .empty（那是给插画留的位）。 */
.not-found {
  display: grid;
  justify-items: center;
  gap: var(--sp-4);
  padding: var(--sp-6) var(--sp-5);
  text-align: center;
}
@media (max-width: 720px) {
  /* 徽章那排换行以后，margin-left:auto 会让第二行也从中间开始——它只在"和标题同一行"时才是右对齐。 */
  .child-state {
    margin-left: 0;
  }
}
</style>
