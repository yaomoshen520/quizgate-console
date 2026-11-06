<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { rpc } from '../api/rpc'
import {
  CreateInviteReplySchema,
  CreateInviteRequestSchema,
  ListAccountsReplySchema,
  ListAccountsRequestSchema,
  ListInvitesReplySchema,
  ListInvitesRequestSchema,
  ResetPasswordReplySchema,
  ResetPasswordRequestSchema,
} from '../gen/quizgate_pb'
import type { AccountSummary, InviteSummary } from '../gen/quizgate_pb'
import { session } from '../store/session'
import { absolute, relative } from '../utils/time'
import PasswordField from '../components/PasswordField.vue'

const accounts = ref<AccountSummary[]>([])
const invites = ref<InviteSummary[]>([])
const loading = ref(false)
const error = ref('')
const notice = ref('')
const freshCode = ref('')

const targetId = ref('')
const newPassword = ref('')
const busyReset = ref(false)

const usedCount = computed(() => invites.value.filter((i) => i.usedByAccountId !== '').length)
const freeCount = computed(() => invites.value.length - usedCount.value)
const target = computed(() => accounts.value.find((a) => a.accountId === targetId.value))

function listAccounts() {
  return rpc(
    '/admin/list-accounts',
    ListAccountsRequestSchema,
    ListAccountsReplySchema,
    {},
    session.parentToken,
  )
}

function listInvites() {
  return rpc('/admin/list-invites', ListInvitesRequestSchema, ListInvitesReplySchema, {}, session.parentToken)
}

async function fetchAll() {
  loading.value = true
  error.value = ''
  try {
    const [acc, inv] = await Promise.all([listAccounts(), listInvites()])
    accounts.value = [...acc.accounts]
    invites.value = [...inv.invites]
    if (targetId.value === '' && acc.accounts.length > 0) targetId.value = acc.accounts[0].accountId
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function createInvite() {
  error.value = ''
  notice.value = ''
  try {
    const reply = await rpc(
      '/admin/create-invite',
      CreateInviteRequestSchema,
      CreateInviteReplySchema,
      {},
      session.parentToken,
    )
    freshCode.value = reply.code
    // 台账重新拉一遍：本地拼一条"签发人/签发时间"是猜的，宁可多一次请求。
    invites.value = [...(await listInvites()).invites]
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function resetPassword() {
  if (targetId.value === '' || busyReset.value) return
  busyReset.value = true
  error.value = ''
  notice.value = ''
  try {
    const reply = await rpc(
      '/admin/reset-password',
      ResetPasswordRequestSchema,
      ResetPasswordReplySchema,
      { accountId: targetId.value, newPassword: newPassword.value },
      session.parentToken,
    )
    notice.value = reply.message
    newPassword.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busyReset.value = false
  }
}

onMounted(fetchAll)
</script>

<template>
  <div class="stack">
    <div class="spread page-head">
      <div>
        <h1 class="t-page">管理</h1>
        <p class="muted">注册码与账号。这一档只有管理员令牌进得来，家长的手写请求会被服务端直接拒掉。</p>
      </div>
      <button class="btn btn--ghost" :disabled="loading" @click="fetchAll">
        {{ loading ? '同步中…' : '刷新' }}
      </button>
    </div>

    <p v-if="error" class="alert alert--error" role="alert">
      <span aria-hidden="true">✕</span>
      <span>{{ error }}</span>
    </p>
    <p v-if="notice" class="alert alert--ok" role="status">
      <span aria-hidden="true">✓</span>
      <span>{{ notice }}</span>
    </p>

    <section class="card">
      <div class="spread invite-head">
        <div>
          <h2 class="t-card">注册码</h2>
          <p class="muted">一枚换一个账号，用掉即作废；家长凭码自助注册。</p>
        </div>
        <button class="btn btn--primary" @click="createInvite">生成一枚</button>
      </div>
      <p v-if="freshCode" class="alert alert--ok code-out">
        <span aria-hidden="true">✓</span>
        <span>新码 <strong class="mono">{{ freshCode }}</strong>，发给家长后不可重复使用。</span>
      </p>
      <div class="invite-stats">
        <span class="badge badge--ok">
          <span class="badge__dot" aria-hidden="true"></span>
          未用 {{ freeCount }}
        </span>
        <span class="badge badge--idle">
          <span class="badge__dot" aria-hidden="true"></span>
          已用 {{ usedCount }}
        </span>
      </div>
    </section>

    <section class="card card--flush">
      <div class="card__head">
        <h2 class="t-card">注册码台账</h2>
        <span class="muted">记下谁发的、谁用掉的。</span>
      </div>
      <!-- 窄屏由 .table--stack 换成一张卡一条码；role/data-label 的必要性见 HomeView 同处注释。 -->
      <table v-if="invites.length > 0" class="table table--stack" role="table">
        <thead>
          <tr>
            <th scope="col">码</th>
            <th scope="col">状态</th>
            <th scope="col">使用者</th>
            <th scope="col">签发时间</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr v-for="invite in invites" :key="invite.code" role="row">
            <td role="cell"><span class="mono">{{ invite.code }}</span></td>
            <td role="cell" data-label="状态">
              <span class="badge" :class="invite.usedByAccountId === '' ? 'badge--ok' : 'badge--idle'">
                <span class="badge__dot" aria-hidden="true"></span>
                {{ invite.usedByAccountId === '' ? '未用' : '已用' }}
              </span>
            </td>
            <td role="cell" data-label="使用者">
              <span v-if="invite.usedByAccountId === ''" class="muted">—</span>
              <span v-else class="mono">账号 id {{ invite.usedByAccountId }}</span>
            </td>
            <td role="cell" data-label="签发时间">
              <span class="when">
                {{ relative(invite.createdAtMs) }}
                <span class="when__abs">{{ absolute(invite.createdAtMs) }}</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted table-empty">还没有发过注册码。</p>
    </section>

    <section class="card card--flush">
      <div class="card__head">
        <h2 class="t-card">账号</h2>
        <span class="muted">注册出来的账号只会是家长，档位由服务端写死。</span>
      </div>
      <table class="table table--stack" role="table">
        <thead>
          <tr>
            <th scope="col">账号</th>
            <th scope="col">档位</th>
            <th scope="col">孩子</th>
            <th scope="col">id</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr v-for="acc in accounts" :key="acc.accountId" role="row">
            <td role="cell">
              <div class="row">
                <span class="avatar" aria-hidden="true">{{ acc.displayName.slice(0, 1) }}</span>
                <span class="who-cell">
                  <strong>{{ acc.displayName }}</strong>
                  <span class="mono">{{ acc.username }}</span>
                </span>
              </div>
            </td>
            <td role="cell" data-label="档位">
              <span class="badge" :class="acc.role === 'ADMIN' ? 'badge--info' : 'badge--idle'">
                <span class="badge__dot" aria-hidden="true"></span>
                {{ acc.role === 'ADMIN' ? '管理员' : '家长' }}
              </span>
            </td>
            <td role="cell" data-label="孩子" class="num">{{ acc.childCount }}</td>
            <td role="cell" data-label="id"><span class="mono">{{ acc.accountId }}</span></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="card reset">
      <h2 class="t-card">重置口令</h2>
      <p class="muted">忘了原口令的家长由这里重置——后台不发短信、不发邮件，也就没有那条能被攻破的找回通道。</p>
      <div class="reset__row">
        <label class="field">
          <span class="field__label">账号</span>
          <select v-model="targetId" class="input">
            <option v-for="acc in accounts" :key="acc.accountId" :value="acc.accountId">
              {{ acc.displayName }}（{{ acc.username }}）
            </option>
          </select>
        </label>
        <PasswordField
          v-model="newPassword"
          label="新口令"
          autocomplete="new-password"
          placeholder="8~72 字节"
        />
        <div class="row--tight reset__go">
          <button class="btn btn--primary" :disabled="targetId === '' || newPassword === '' || busyReset" @click="resetPassword">
            {{ busyReset ? '提交中…' : '重置' }}
          </button>
        </div>
      </div>
      <p v-if="target" class="muted">
        重置会作废 {{ target.displayName }} 的全部登录令牌，他那边需要重新登录；孩子设备上的令牌不受影响，闸门照常计时。
        如果重置的正是你自己，这个页面的会话也一起作废，下一个请求就会让你重新登录。
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
.invite-head {
  align-items: flex-start;
}
.code-out,
.invite-stats {
  margin-top: var(--sp-4);
}
/* 这串码要复制给家长：整段可选，字距拉开免得 8 位混在一起看不清。 */
.code-out strong {
  user-select: all;
  letter-spacing: 0.08em;
  font-size: var(--text-md);
}
.invite-stats {
  display: flex;
  gap: var(--sp-2);
}
.table-empty {
  padding: var(--sp-5);
}
.when,
.who-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.who-cell strong {
  font-weight: 600;
}
.who-cell .mono,
.when__abs {
  color: hsl(var(--muted));
  font-size: var(--text-xs);
}
.reset__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: var(--sp-4);
  align-items: end;
  margin-top: var(--sp-4);
}
.reset .muted {
  margin-top: var(--sp-2);
}
@media (max-width: 720px) {
  /* 选账号、填新口令、按重置：三列并排在手机上会让下拉框只剩一半宽，账号名被截成「小明爸…」。 */
  .reset__row {
    grid-template-columns: minmax(0, 1fr);
  }
  .reset__go .btn {
    width: 100%;
  }
}
</style>
