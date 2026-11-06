<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppMark from '../components/AppMark.vue'
import PasswordField from '../components/PasswordField.vue'
import hero from '../assets/login-hero.jpg'
import { rpc } from '../api/rpc'
import { LoginReplySchema, LoginRequestSchema } from '../gen/quizgate_pb'
import { session } from '../store/session'

const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

const canSubmit = computed(() => !busy.value && username.value !== '' && password.value !== '')

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = ''
  try {
    const reply = await rpc('/parent/login', LoginRequestSchema, LoginReplySchema, {
      username: username.value,
      password: password.value,
    })
    session.signIn(reply.parentToken, reply.children, reply.role)
    void router.push('/')
  } catch (e) {
    // 后端的错误报文本来就是给人看的中文，直接显示，不再自己编一套文案。
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth">
    <section class="auth__aside">
      <div class="auth__brand">
        <AppMark :size="30" />
        <strong>quizgate</strong>
      </div>
      <img class="auth__hero" :src="hero" alt="盾牌形状的闸门里放着课本和时钟，一个孩子从边缘探出头" />
      <div class="auth__pitch">
        <h2>娱乐时长到点，先答题再继续。</h2>
        <ul>
          <li>孩子设备累计娱乐 30 分钟后抢屏出题，判分在服务端完成。</li>
          <li>题库、阈值、每日上限都由这个后台说了算。</li>
          <li>连不上服务端时闸门照常计时——宁可多拦，不可放过。</li>
        </ul>
      </div>
    </section>

    <section class="auth__main">
      <form class="card auth__form" @submit.prevent="submit">
        <h1 class="t-page">登录</h1>
        <p class="muted">家长账号需要管理员发一枚注册码，凭码自助注册。</p>

        <label class="field">
          <span class="field__label">账号</span>
          <input
            v-model="username"
            class="input input--wide"
            autocomplete="username"
            placeholder="家长账号"
            required
          />
        </label>
        <PasswordField
          v-model="password"
          label="密码"
          autocomplete="current-password"
          placeholder="密码"
          required
        />

        <p v-if="error" class="alert alert--error" role="alert">
          <span aria-hidden="true">✕</span>
          <span>{{ error }}</span>
        </p>

        <button class="btn btn--primary btn--block" type="submit" :disabled="!canSubmit">
          <span v-if="busy" class="spinner" aria-hidden="true"></span>
          {{ busy ? '登录中…' : '进入后台' }}
        </button>

        <RouterLink to="/register" class="btn btn--ghost btn--block">有注册码？自助注册</RouterLink>
      </form>
      <p class="auth__foot">令牌只保存在当前标签页，关掉就没了。</p>
    </section>
  </div>
</template>

<style scoped>
.auth {
  display: grid;
  /* 两列定宽后整体居中：说明列 480、表单列 400，比"1fr + 定宽"少了右侧那块说不清的空白。 */
  grid-template-columns: minmax(0, 480px) minmax(0, 400px);
  justify-content: center;
  gap: var(--sp-8);
  align-items: center;
  /* dvh 而不是 vh：手机浏览器的地址栏会伸缩，按 vh 算出来的这个高度比实际可见区高出一截，
     表单就会被顶到要往下滚才能看全。下面那行 100vh 是给不认识 dvh 的老浏览器兜底的，
     顺序不能换——认识的会用新的，不认识的整条丢掉就退回旧算法。 */
  min-height: calc(100vh - var(--sp-6) - var(--sp-8));
  min-height: calc(100dvh - var(--sp-6) - var(--sp-8));
}
.auth__aside {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.auth__brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--text-md);
}
.auth__brand strong {
  font-weight: 650;
  letter-spacing: -0.01em;
}
.auth__hero {
  width: 100%;
  max-width: 340px;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  border-radius: var(--r-xl);
  border: 1px solid hsl(var(--brand-200));
  box-shadow: var(--sh-3);
}
.auth__pitch h2 {
  font-size: var(--text-lg);
  font-weight: 650;
  line-height: var(--leading-tight);
  letter-spacing: -0.01em;
  max-width: 34ch;
}
.auth__pitch ul {
  margin: var(--sp-3) 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.auth__pitch li {
  position: relative;
  padding-left: var(--sp-5);
  font-size: var(--text-sm);
  color: hsl(var(--ink-soft));
  max-width: 42ch;
}
.auth__pitch li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 12px;
  height: 3px;
  border-radius: var(--r-pill);
  background: hsl(var(--brand-300));
}
.auth__main {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.auth__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-6);
  box-shadow: var(--sh-2);
}
.auth__form h1 {
  font-size: var(--text-xl);
}
.auth__form .muted {
  margin-top: calc(-1 * var(--sp-3));
}
.auth__foot {
  font-size: var(--text-xs);
  color: hsl(var(--muted));
  text-align: center;
}
@media (max-width: 900px) {
  .auth {
    grid-template-columns: 1fr;
    gap: var(--sp-6);
  }
  /* 窄屏只收起插画，产品说明留着——家长可能就在手机上打开。
     但表单要排到说明前面：让人先滚到输入框，而不是先读四行介绍。 */
  .auth__hero {
    display: none;
  }
  .auth__main {
    order: 1;
    /* 单列时也要限宽：一个 700px 宽的登录输入框，比它窄一半的版本更难用。 */
    width: min(100%, 420px);
    margin: 0 auto;
  }
  .auth__aside {
    order: 2;
  }
  .auth__pitch h2 {
    font-size: var(--text-md);
  }
}
</style>
