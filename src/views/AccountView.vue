<script setup lang="ts">
import { computed, ref } from 'vue'
import PasswordField from '../components/PasswordField.vue'
import { rpc } from '../api/rpc'
import { ChangePasswordReplySchema, ChangePasswordRequestSchema } from '../gen/quizgate_pb'
import { session } from '../store/session'

const oldPassword = ref('')
const newPassword = ref('')
const confirm = ref('')
const error = ref('')
const done = ref('')
const busy = ref(false)

const passwordBytes = computed(() => new TextEncoder().encode(newPassword.value).length)
const passwordBad = computed(
  () => newPassword.value !== '' && (passwordBytes.value < 8 || passwordBytes.value > 72),
)
const mismatch = computed(() => confirm.value !== '' && confirm.value !== newPassword.value)

const canSubmit = computed(
  () =>
    !busy.value &&
    oldPassword.value !== '' &&
    !passwordBad.value &&
    newPassword.value !== '' &&
    confirm.value === newPassword.value,
)

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = ''
  done.value = ''
  try {
    const reply = await rpc(
      '/parent/change-password',
      ChangePasswordRequestSchema,
      ChangePasswordReplySchema,
      { oldPassword: oldPassword.value, newPassword: newPassword.value },
      session.parentToken,
    )
    // 服务端把这条会话的旧令牌全删了，不换令牌的话下一个请求就是 401。
    session.setToken(reply.parentToken)
    oldPassword.value = ''
    newPassword.value = ''
    confirm.value = ''
    done.value = '口令已更新，这个标签页继续可用；其它地方的会话需要重新登录。'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="stack">
    <div class="spread page-head">
      <div>
        <h1 class="t-page">账号设置</h1>
        <p class="muted">改自己的登录口令。</p>
      </div>
      <span class="badge" :class="session.isAdmin ? 'badge--info' : 'badge--idle'">
        <span class="badge__dot" aria-hidden="true"></span>
        {{ session.isAdmin ? '管理员' : '家长' }}
      </span>
    </div>

    <form class="card settings__form" @submit.prevent="submit">
      <h2 class="t-card">修改口令</h2>

      <PasswordField v-model="oldPassword" label="原口令" autocomplete="current-password" required />
      <PasswordField v-model="newPassword" label="新口令" autocomplete="new-password" required>
        <span class="hint" :class="{ 'hint--bad': passwordBad }">
          当前 {{ passwordBytes }} 字节{{ passwordBad ? '（要 8~72 之间）' : '' }}
        </span>
      </PasswordField>
      <PasswordField v-model="confirm" label="确认新口令" autocomplete="new-password" required>
        <span v-if="mismatch" class="hint hint--bad">两次输入不一样</span>
      </PasswordField>

      <p v-if="error" class="alert alert--error" role="alert">
        <span aria-hidden="true">✕</span>
        <span>{{ error }}</span>
      </p>
      <p v-if="done" class="alert alert--ok" role="status">
        <span aria-hidden="true">✓</span>
        <span>{{ done }}</span>
      </p>

      <button class="btn btn--primary" type="submit" :disabled="!canSubmit">
        <span v-if="busy" class="spinner" aria-hidden="true"></span>
        {{ busy ? '提交中…' : '更新口令' }}
      </button>

      <p class="muted forgot">
        忘了原口令就没有自助找回：让家长找管理员重置。后台不发短信也不发邮件，
        少一条能被人攻破的通道。
      </p>
    </form>
  </div>
</template>

<style scoped>
.page-head {
  align-items: flex-start;
}
.page-head .muted {
  margin-top: var(--sp-1);
}
.settings__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 460px;
}
.forgot {
  padding-top: var(--sp-2);
  border-top: 1px solid hsl(var(--line));
}
.hint {
  font-size: var(--text-xs);
  color: hsl(var(--muted));
}
.hint--bad {
  color: hsl(var(--danger-700));
}
</style>
