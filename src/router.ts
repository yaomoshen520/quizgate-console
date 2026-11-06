import { createRouter, createWebHashHistory } from 'vue-router'
import { session } from './store/session'

const PARENT = 'PARENT'
const ADMIN = 'ADMIN'

declare module 'vue-router' {
  interface RouteMeta {
    /** 无需登录即可访问（登录页、注册页）。 */
    public?: boolean
    /** 允许进入这个角色；服务端不认这个，见下面守卫的注释。 */
    roles?: string[]
    title?: string
    /** 是否出现在顶栏导航里。 */
    nav?: boolean
  }
}

export const router = createRouter({
  // hash 模式：深链不需要服务端 fallback，静态放行清单也就能只写那四个路径。
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      component: () => import('./views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/register',
      component: () => import('./views/RegisterView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('./views/HomeView.vue'),
      meta: { roles: [PARENT, ADMIN], title: '概览', nav: true },
    },
    {
      path: '/alerts',
      component: () => import('./views/AlertsView.vue'),
      meta: { roles: [PARENT, ADMIN], title: '告警', nav: true },
    },
    {
      path: '/account',
      component: () => import('./views/AccountView.vue'),
      meta: { roles: [PARENT, ADMIN], title: '账号设置', nav: true },
    },
    // 单个孩子的设置：规则/题库/报表在同一路由下用 ?tab= 切，不进顶栏——顶栏是账号级的，这一页是孩子级的。
    {
      path: '/child/:id',
      component: () => import('./views/ChildView.vue'),
      meta: { roles: [PARENT, ADMIN], title: '孩子设置' },
    },
    // 只有 ADMIN 进得来。家长看不见这条路由不是因为他被挡住了，是因为没人给他入口。
    {
      path: '/admin',
      component: () => import('./views/AdminView.vue'),
      meta: { roles: [ADMIN], title: '管理', nav: true },
    },
  ],
})

/**
 * 前端守卫只是体验，真门在别处：/api/admin/** 在 SecurityFilterChain 上挂 hasRole("ADMIN")，
 * 令牌档位由服务端签发的 kind 决定。把上面的路由全删掉，家长手写 protobuf 请求照样是 403。
 */
router.beforeEach((to) => {
  if (to.meta.public) return session.signedIn ? '/' : true
  if (!session.signedIn) return '/login'
  const roles = to.meta.roles ?? []
  return roles.includes(session.role) ? true : '/'
})

/** 顶栏导航按角色过滤，管理员比家长多一档。 */
export function navItems(): { path: string; title: string }[] {
  return router
    .getRoutes()
    .filter((r) => r.meta.nav === true)
    .filter((r) => (r.meta.roles ?? []).includes(session.role))
    .map((r) => ({ path: r.path, title: r.meta.title ?? '' }))
    .sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path)))
}
