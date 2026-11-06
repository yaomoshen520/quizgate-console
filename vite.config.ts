import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 这个文件只在 Node 里跑，给 process 一个最小声明就够了——为了读一个变量去装 @types/node
// 会把整个前端工程的类型环境换掉，不值。
declare const process: { env: Record<string, string | undefined> }

// 产物直接落到后端 classpath 的 static 下：同源、无 CORS，native 二进制自带前端。
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: '../src/main/resources/static',
    emptyOutDir: true,
    // 必须钉住：默认的 cssTarget 很新，压完会把 @media (max-width:720px) 写成 @media (width<=720px)。
    // 范围语法要 Chrome 109 / Safari 16.4 才认识，认不了的浏览器是「整段忽略」而不是报错——
    // 也就是说家长手里那台老安卓打开的就是桌面版布局，而且一句错都不给。
    cssTarget: ['chrome87', 'safari14'],
  },
  server: {
    // 手机要能在局域网里打开这个页面：只听 localhost 的话，手机输不进来的就是那台电脑的 IP。
    host: true,
    // 8080 常被老的 native 二进制占着，那个版本没有 scan-bank 这一批新接口；
    // 用环境变量把代理指向另一个端口，就不用为了点一次 UI 去停别人正在用的进程。
    proxy: {
      '/api': process.env.QUIZGATE_DEV_API ?? 'http://localhost:8080',
    },
  },
})
