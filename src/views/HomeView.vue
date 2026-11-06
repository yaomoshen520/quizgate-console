<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StatCard from '../components/StatCard.vue'
import emptyArt from '../assets/empty-state.png'
import { rpc } from '../api/rpc'
import {
  CreateChildReplySchema,
  CreateChildRequestSchema,
  ListChildrenReplySchema,
  ListChildrenRequestSchema,
} from '../gen/quizgate_pb'
import { session } from '../store/session'
import { absolute, relative } from '../utils/time'

const bound = computed(() => session.children.filter((c) => c.deviceBound).length)
const pending = computed(() => session.children.length - bound.value)

/** 最近一次任何设备上报：没上报过的孩子不参与，否则永远是"从未"。 */
const lastReport = computed(() => {
  const stamps = session.children.map((c) => c.lastHeartbeatMs).filter((ms) => ms !== 0n)
  if (stamps.length === 0) return null
  return stamps.reduce((a, b) => (a > b ? a : b))
})

// 列表要在每次进入这一页时重新取：令牌能活过刷新，登录那一次应答里的孩子可活不过。
const loaded = ref(false)
const loadError = ref('')

async function refresh() {
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
    loaded.value = true
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

onMounted(refresh)

const adding = ref(false)
const childName = ref('')
const childGrade = ref(3)
const addError = ref('')
const busy = ref(false)

async function addChild() {
  if (busy.value || childName.value.trim() === '') return
  busy.value = true
  addError.value = ''
  try {
    const reply = await rpc(
      '/parent/create-child',
      CreateChildRequestSchema,
      CreateChildReplySchema,
      { displayName: childName.value, grade: childGrade.value },
      session.parentToken,
    )
    // 服务端没有 list-children，直接把刚建好的那条追加进会话，省一次重新登录。
    if (reply.child !== undefined) session.children.push(reply.child)
    childName.value = ''
    adding.value = false
  } catch (e) {
    addError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function initial(name: string): string {
  return name.trim().slice(0, 1) || '?'
}
</script>

<template>
  <div class="stack">
    <p v-if="loadError" class="alert alert--error" role="alert">
      <span aria-hidden="true">✕</span>
      <span>孩子列表没取回来：{{ loadError }}</span>
    </p>

    <div class="spread page-head">
      <div>
        <h1 class="t-page">概览</h1>
        <p class="muted">
          {{
            session.isAdmin
              ? '管理员视角：所有账号的孩子都列在这里，不只你自己名下的。'
              : '这个账号下的孩子、设备绑定情况与最近上报。'
          }}
        </p>
      </div>
      <button class="btn btn--primary" @click="adding = !adding">
        {{ adding ? '收起' : '＋ 添加孩子' }}
      </button>
    </div>

    <form v-if="adding" class="card add-child" @submit.prevent="addChild">
      <label class="field">
        <span class="field__label">孩子昵称</span>
        <input
          v-model="childName"
          class="input"
          placeholder="比如「小满」"
          maxlength="64"
          required
        />
      </label>
      <label class="field">
        <span class="field__label">年级</span>
        <select v-model.number="childGrade" class="input">
          <option v-for="g in 9" :key="g" :value="g">{{ g }} 年级</option>
        </select>
      </label>
      <div class="add-child__go">
        <button class="btn btn--primary" type="submit" :disabled="busy || childName.trim() === ''">
          <span v-if="busy" class="spinner" aria-hidden="true"></span>
          {{ busy ? '创建中…' : '创建' }}
        </button>
      </div>
      <p class="muted add-child__note">
        创建时会自动带上默认闸门规则，不会让孩子设备裸奔；阈值、每日上限要在规则页调整（页面还没上线）。
        <template v-if="session.isAdmin">
          管理员建的档案挂在管理员账号名下——要给某位家长建，让那位家长自己登录后建，设备绑定码才归他认领。
        </template>
      </p>
      <p v-if="addError" class="alert alert--error" role="alert">
        <span aria-hidden="true">✕</span>
        <span>{{ addError }}</span>
      </p>
    </form>

    <div v-if="session.children.length > 0" class="grid-kpi">
      <StatCard icon="child" label="孩子" :value="session.children.length" hint="个档案" />
      <StatCard
        icon="device"
        label="已绑定设备"
        :value="bound"
        :hint="pending > 0 ? `${pending} 个待绑定` : '全部完成'"
        :tone="pending > 0 ? 'warn' : 'ok'"
      />
      <StatCard
        icon="clock"
        label="最近上报"
        :value="lastReport ? relative(lastReport) : '—'"
        :hint="lastReport ? absolute(lastReport) : '还没有设备上报过'"
        :tone="lastReport ? 'ok' : 'idle'"
      />
    </div>

    <section v-if="session.children.length > 0" class="card card--flush">
      <div class="card__head">
        <h2 class="t-card">孩子</h2>
        <span class="muted">点「设置」配闸门规则、传题目、看用量。</span>
      </div>
      <!-- 窄屏这一张表会由 .table--stack 换成"一个孩子一张卡"（见 theme.css）。
           role 是跟着这个变化写的：display 一改，浏览器就不再把它当表格语义，
           显式标出来读屏才还会说"第 2 行，共 5 行"。data-label 是那张卡里每行的列名，漏一个就没名字。 -->
      <table class="table table--stack" role="table">
        <thead>
          <tr>
            <th scope="col">昵称</th>
            <th scope="col">年级</th>
            <th scope="col">设备</th>
            <th scope="col">最后上报</th>
            <th scope="col"><span class="sr">操作</span></th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr v-for="child in session.children" :key="child.childId" role="row">
            <td role="cell">
              <div class="row">
                <span class="avatar" aria-hidden="true">{{ initial(child.displayName) }}</span>
                <span class="who-cell">
                  <strong>{{ child.displayName }}</strong>
                  <span class="mono">id {{ child.childId }}</span>
                </span>
              </div>
            </td>
            <td role="cell" data-label="年级">{{ child.grade }} 年级</td>
            <td role="cell" data-label="设备">
              <span v-if="child.deviceBound" class="when">
                {{ child.deviceModel || '已绑定' }}
                <span class="when__abs">
                  {{ child.androidApiLevel > 0 ? `Android API ${child.androidApiLevel}` : '系统版本未上报' }}
                </span>
              </span>
              <span v-else class="badge badge--idle">
                <span class="badge__dot" aria-hidden="true"></span>
                未绑定
              </span>
            </td>
            <td role="cell" data-label="最后上报">
              <span class="when">
                {{ relative(child.lastHeartbeatMs) }}
                <span v-if="child.lastHeartbeatMs !== 0n" class="when__abs">
                  {{ absolute(child.lastHeartbeatMs) }}
                </span>
              </span>
            </td>
            <td role="cell" data-label="操作">
              <RouterLink class="btn btn--ghost cell-btn" :to="`/child/${child.childId}`">设置</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-else-if="loaded" class="card empty">
      <img :src="emptyArt" alt="" />
      <h2 class="t-card">这个账号下还没有孩子档案</h2>
      <p class="muted">
        先点上面的「添加孩子」建第一个档案，再到孩子设备上装机拿绑定码认领。没有档案的孩子，闸门不会计时。
      </p>
      <button class="btn btn--primary" @click="adding = true">添加孩子</button>
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
/* 建档案这张卡：昵称占余下宽度，年级只要 160px，说明和报错横跨整行。 */
.add-child {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px auto;
  align-items: end;
  gap: var(--sp-4);
}
.add-child__go {
  display: flex;
}
.add-child__note,
.add-child .alert {
  grid-column: 1 / -1;
}
.add-child .alert {
  margin-top: calc(-1 * var(--sp-2));
}
.who-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.who-cell strong {
  font-weight: 600;
}
.who-cell .mono {
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
/* 表格里的那颗按钮要比常规矮一档，不然一行的高度被它撑开了。 */
.cell-btn {
  height: var(--ctl-h-sm);
  padding: 0 var(--sp-3);
  font-size: var(--text-sm);
}
@media (max-width: 720px) {
  /* 三列的建档案表单在 390px 里会把昵称输入框挤成一个条：改成昵称整行、年级和按钮并排。 */
  .add-child {
    grid-template-columns: minmax(0, 1fr) 120px;
  }
  .add-child__go {
    grid-column: 1 / -1;
  }
  .add-child__go .btn {
    width: 100%;
  }
}
</style>
