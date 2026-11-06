<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppMark from './components/AppMark.vue'
import { navItems } from './router'
import { alerts, startPolling, stopPolling } from './store/alerts'
import { session } from './store/session'

const route = useRoute()
const router = useRouter()

// 登录页和注册页自己带品牌区，顶栏再出现一次就成了两个标题抢注意力。
const showBar = computed(() => !route.meta.public && session.signedIn)
const items = computed(() => navItems())

// 红条在告警页自己是重复信息：那一整屏就是它展开的样子。
const showWarn = computed(() => showBar.value && alerts.count > 0 && route.path !== '/alerts')

// 登录期间一直轮询：家长挂着后台，孩子在那头关掉无障碍，
// 不该要他手动刷新才知道。退出登录就停——令牌已经没了，留着只会一直报错。
watch(showBar, (on) => (on ? startPolling() : stopPolling()), { immediate: true })
onUnmounted(stopPolling)

function signOut() {
  session.signOut()
  void router.push('/login')
}
</script>

<template>
  <header v-if="showBar" class="bar">
    <div class="bar__inner">
      <RouterLink to="/" class="brand">
        <AppMark :size="28" />
        <span class="brand__text">
          <strong>quizgate</strong>
          <em>{{ session.isAdmin ? '管理后台' : '家长后台' }}</em>
        </span>
      </RouterLink>
      <nav class="nav" aria-label="主导航">
        <RouterLink
          v-for="item in items"
          :key="item.path"
          :to="item.path"
          class="nav__item"
          :class="{ 'nav__item--on': route.path === item.path }"
        >
          {{ item.title }}
        </RouterLink>
      </nav>
      <div class="row--tight bar__end">
        <button class="btn btn--ghost" @click="signOut">退出</button>
      </div>
    </div>
    <!-- 这一条只有两种颜色的来源，而且分得很清楚：
         红色是设备亲口报回来的"闸门被关了"，琥珀是服务端反推的"这台机器不说话了"。
         后者永远不说"已卸载"，因为那条消息没有发送者。 -->
    <div v-if="showWarn" class="warn" role="status" aria-live="polite">
      <div class="warn__inner">
        <span class="warn__text">
          <template v-if="alerts.items.length > 0">
            <span class="warn__full">{{ alerts.items.length }} 条设备报回来的闸门被关记录</span>
            <span class="warn__short">{{ alerts.items.length }} 条动手记录</span>
          </template>
          <template v-if="alerts.items.length > 0 && alerts.offline.length > 0"> · </template>
          <template v-if="alerts.offline.length > 0">
            <span class="warn__full">{{ alerts.offline.length }} 台设备失联，可能是卸载、关机或断网</span>
            <span class="warn__short">{{ alerts.offline.length }} 台失联</span>
          </template>
        </span>
        <RouterLink class="warn__go" to="/alerts">查看</RouterLink>
      </div>
    </div>
  </header>
  <main class="page">
    <RouterView />
  </main>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: hsl(var(--surface) / 0.86);
  backdrop-filter: saturate(180%) blur(10px);
  border-bottom: 1px solid hsl(var(--line));
}
.bar__inner {
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--sp-3) var(--sp-5);
  display: flex;
  align-items: center;
  gap: var(--sp-5);
}
.brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  color: inherit;
  flex: none;
}
.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.brand__text strong {
  font-size: var(--text-md);
  font-weight: 650;
  letter-spacing: -0.01em;
}
.brand__text em {
  font-style: normal;
  font-size: var(--text-xs);
  color: hsl(var(--muted));
}
.nav {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  margin-right: auto;
  flex-wrap: wrap;
}
.nav__item {
  height: var(--ctl-h-sm);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--sp-3);
  border-radius: var(--r-pill);
  font-size: var(--text-sm);
  font-weight: 550;
  color: hsl(var(--ink-soft));
  transition: background var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
}
@media (hover: hover) {
  .nav__item:hover {
    background: hsl(var(--brand-50));
    color: hsl(var(--brand-700));
  }
}
.nav__item:focus-visible {
  outline: none;
  box-shadow: var(--ring);
}
.nav__item--on {
  background: hsl(var(--brand-100));
  color: hsl(var(--brand-700));
}
.warn {
  border-top: 1px solid hsl(var(--danger-700) / 0.35);
  background: hsl(var(--danger-500));
  color: #fff;
}
.warn__inner {
  max-width: 1080px;
  margin: 0 auto;
  /* 这一条会常驻在顶栏下面：给它和导航一样的左右留白，但行高按一句话来，
     手机上是两行文字加一颗按钮，不该吃掉本该看列表的那半屏。 */
  padding: var(--sp-2) var(--sp-5);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-4);
}
.warn__text {
  font-size: var(--text-sm);
  font-weight: 550;
  line-height: 1.45;
  margin-right: auto;
}
/* 同一句话说两遍：完整版给宽屏，短版给手机——顶栏在手机已经是两行，
   红条再占两行的话，粘性头部会吃掉小一半屏幕，家长就看不到列表了。
   隐藏的那一份同时从读屏队列里消失，不会念两遍。 */
.warn__short {
  display: none;
}
/* 描边而不是实心白底：红条上再放一颗实心按钮，两个高对比抢同一块地方，反而看不出哪个是能点的。 */
.warn__go {
  height: var(--ctl-h-sm);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--sp-4);
  border: 1px solid rgb(255 255 255 / 0.7);
  border-radius: var(--r-pill);
  font-size: var(--text-sm);
  font-weight: 600;
  color: #fff;
  flex: none;
}
@media (hover: hover) {
  .warn__go:hover {
    background: rgb(255 255 255 / 0.14);
  }
}
.warn__go:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(255 255 255 / 0.45);
}
.page {
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--sp-6) var(--sp-5) var(--sp-8);
  /* 全面屏的手势条压在内容上：底部留出一截安全区，最后一颗按钮才不会被"Home"那根线盖住。
     要拿到这个值，index.html 的 viewport 必须写 viewport-fit=cover，否则它恒等于 0。 */
  padding-bottom: calc(var(--sp-8) + env(safe-area-inset-bottom));
}
@media (max-width: 720px) {
  .bar__inner {
    gap: var(--sp-3);
    /* 顶栏在手机上是两行（品牌+退出 / 导航），44 高的胶囊已经把这一条撑到 96px；
       上下留白收到 8，粘性头部才不至于吃掉屏幕的六分之一。 */
    padding-block: var(--sp-2);
    /* 每行前面留一条不带 max() 的：不认识 max() 的老浏览器整条丢掉就变成贴边，
       兜底那行让它退回普通内边距。 */
    padding-left: var(--sp-3);
    padding-left: max(var(--sp-3), env(safe-area-inset-left));
    padding-right: var(--sp-3);
    padding-right: max(var(--sp-3), env(safe-area-inset-right));
    /* 手机上顶栏走两行：品牌 + 退出在上，导航整行在下。
       四个胶囊和标题挤在同一行时，导航会在最右边断成半个词，比两行难看得多。 */
    flex-wrap: wrap;
    row-gap: var(--sp-2);
  }
  .brand__text em {
    display: none;
  }
  .bar__end {
    margin-left: auto;
  }
  .nav {
    order: 3;
    flex: 1 1 100%;
    margin-right: 0;
    gap: var(--sp-2);
    /* 胶囊换行时那 44px 高的行要留出行距。 */
    row-gap: var(--sp-2);
  }
  .page {
    padding-left: var(--sp-4);
    padding-left: max(var(--sp-4), env(safe-area-inset-left));
    padding-right: var(--sp-4);
    padding-right: max(var(--sp-4), env(safe-area-inset-right));
  }
  .warn__inner {
    padding: var(--sp-2) var(--sp-4);
    padding-left: max(var(--sp-4), env(safe-area-inset-left));
    padding-right: max(var(--sp-4), env(safe-area-inset-right));
  }
  .warn__full {
    display: none;
  }
  .warn__short {
    display: inline;
  }
}
</style>
