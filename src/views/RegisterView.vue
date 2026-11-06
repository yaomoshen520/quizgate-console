<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppMark from '../components/AppMark.vue'
import PasswordField from '../components/PasswordField.vue'
import { rpc } from '../api/rpc'
import { RegisterReplySchema, RegisterRequestSchema } from '../gen/quizgate_pb'
import { session } from '../store/session'

const router = useRouter()
const inviteCode = ref('')
const username = ref('')
const displayName = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)

/** 服务端按 UTF-8 字节限长（BCrypt 只看前 72 字节），这里提前算一遍，省一次往返。 */
const passwordBytes = computed(() => new TextEncoder().encode(password.value).length)
const passwordBad = computed(() => password.value !== '' && (passwordBytes.value < 8 || passwordBytes.value > 72))
const mismatch = computed(() => confirm.value !== '' && confirm.value !== password.value)

const canSubmit = computed(
  () =>
    !busy.value &&
    inviteCode.value.trim() !== '' &&
    username.value.trim() !== '' &&
    !passwordBad.value &&
    password.value !== '' &&
    confirm.value === password.value,
)

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = ''
  try {
    const reply = await rpc('/parent/register', RegisterRequestSchema, RegisterReplySchema, {
      inviteCode: inviteCode.value,
      username: username.value,
      password: password.value,
      displayName: displayName.value,
    })
    // 注册只回令牌，不回孩子列表：新账号本来就没有孩子，进去后由概览页引导建第一个档案。
    session.signIn(reply.parentToken, [], 'PARENT')
    void router.push('/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="signup">
    <div class="signup__brand">
      <AppMark :size="26" />
      <strong>quizgate</strong>
      <RouterLink to="/login" class="signup__back">返回登录</RouterLink>
    </div>

    <form class="card signup__form" @submit.prevent="submit">
      <h1 class="t-page">注册家长账号</h1>
      <p class="muted">
        后台不开放无码注册：一枚注册码只能换一个账号，用掉就作废。码找管理员要。
      </p>

      <label class="field">
        <span class="field__label">注册码</span>
        <input
          v-model="inviteCode"
          class="input input--wide"
          autocomplete="off"
          placeholder="8 位码，大小写都行"
          required
        />
      </label>
      <label class="field">
        <span class="field__label">账号</span>
        <input
          v-model="username"
          class="input input--wide"
          autocomplete="username"
          placeholder="登录用的名字，1~64 个字符"
          required
        />
      </label>
      <label class="field">
        <span class="field__label">昵称（选填）</span>
        <input
          v-model="displayName"
          class="input input--wide"
          autocomplete="nickname"
          placeholder="后台里显示给你看的，比如「小明爸爸」"
        />
      </label>
      <PasswordField v-model="password" label="密码" autocomplete="new-password" placeholder="至少 8 个字符" required>
        <span class="hint" :class="{ 'hint--bad': passwordBad }">
          当前 {{ passwordBytes }} 字节{{ passwordBad ? '（要 8~72 之间）' : '' }}
        </span>
      </PasswordField>
      <PasswordField v-model="confirm" label="确认密码" autocomplete="new-password" placeholder="再输一遍" required>
        <span v-if="mismatch" class="hint hint--bad">两次输入不一样</span>
      </PasswordField>

      <p v-if="error" class="alert alert--error" role="alert">
        <span aria-hidden="true">✕</span>
        <span>{{ error }}</span>
      </p>

      <button class="btn btn--primary btn--block" type="submit" :disabled="!canSubmit">
        <span v-if="busy" class="spinner" aria-hidden="true"></span>
        {{ busy ? '注册中…' : '注册并进入后台' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.signup {
  max-width: 420px;
  margin: 0 auto;
  padding: var(--sp-7) var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.signup__brand {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--text-md);
}
.signup__brand strong {
  font-weight: 650;
  letter-spacing: -0.01em;
}
.signup__back {
  margin-left: auto;
  font-size: var(--text-sm);
}
.signup__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-6);
  box-shadow: var(--sh-2);
}
.signup__form .muted {
  margin-top: calc(-1 * var(--sp-2));
}
.hint {
  font-size: var(--text-xs);
  color: hsl(var(--muted));
}
.hint--bad {
  color: hsl(var(--danger-700));
}
</style>
