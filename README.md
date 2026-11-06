# quizgate-console

家长后台：给孩子配规则、传题库（含拍照识题）、看用量报表、收"闸门被人关掉"的告警。
Vue 3 + TypeScript + Vite，**没有组件库**，样式全在 `src/styles/theme.css` 的设计令牌里。

服务端：https://github.com/yaomoshen520/quizgate-server

## 三个角色三套页面

登录返回的令牌 kind 决定能进哪条路由：家长 / 管理员 / 设备。
`src/router.ts` 里的角色守卫**只是体验**——把路由全删掉，家长手写 protobuf 请求照样是 403，
真正的档位与数据范围都在服务端判。

## 传输

和后端之间只有 `X-Quizgate-Token` + protobuf 字节，见 `src/api/rpc.ts`。
类型来自 `src/gen/quizgate_pb.ts`，由 `npm run gen` 从后端那份 `.proto` 生成。

## 命令

```
npm install
npm run dev      # 端口默认 5173；QUIZGATE_DEV_API 指定代理到哪个后端
npm run build    # gen -> vue-tsc --noEmit -> vite build
```

`QUIZGATE_DEV_API` 不设就代理 `http://localhost:8080`。dev server 听的是 `host: true`，
手机连同一个 Wi-Fi 就能输电脑 IP 打开——手机端适配是拿真机测的，不是模拟出来的。

## 两个必须知道的构建约束

1. **`cssTarget` 钉在 `chrome87 / safari14`**。默认目标很新，压完会把 `@media (max-width:720px)`
   写成 `@media (width<=720px)`，老 WebView **整段忽略且不报错**——家长手里那台老安卓看到的就是桌面版布局。
   所以验证移动端样式要 grep 压缩产物里的媒体查询写法，看源码没用。
2. **`build.outDir` 指到后端 classpath 的 `src/main/resources/static`**，同源、无 CORS、
   native 二进制自带前端。因此后端那边把 `static/` 排除了版本库：不许出现两份真。

改过样式之后要重新出包才会进原生二进制；chunk 文件名是内容哈希，所以老的二进制会在新冒烟上
**响亮失败**而不是静默通过——这是特性，别去掩盖它。

## 相对路径（这个仓库目前不能独立构建）

`npm run gen` 是 `cd ../proto && buf generate`，`outDir` 是 `../src/main/resources/static`：
两者都假设这个仓库检出在后端仓库目录里的 `web/`（开发机就是这个布局）。
把它当兄弟目录单独检出时，把这两处改成 `../quizgate-server/proto` 与
`../quizgate-server/src/main/resources/static`，或者直接用已入库的 `src/gen/quizgate_pb.ts`
跑 `npx vue-tsc --noEmit && npx vite build`。

`src/gen/` 是生成物但**入库**：不入库的话单独克隆这个仓库连编译都起不来，
而重新生成又必须先拿到后端那份 `.proto`。

## 窄屏的两条策略，别统一处理

记录类表（孩子列表 / 题库 / 注册码）在窄屏 `display:block` 摊成卡片，列名靠 `td[data-label]::before` 补回来，
并显式写 `role="table/rowgroup/row/cell"`——摊开等于摧毁表格语义。
**报表那张按天的数字表故意不拆**（拆了没法横向比数字），改成紧凑 nowrap + 外层横向滚动。

改窄屏样式只能动 `:root` 的 token：scoped 样式编译成 `.btn--sm[data-v-xxx]`（特异性 0,2,0）会压过
`theme.css` 里的 `.btn`（0,1,0）。另一条硬道理：iOS Safari 在可编辑控件计算字号 <16px 时聚焦会整页推近，
所以移动档 `--text-base` 必须正好 16px。

## 页面上那些"老实文案"

- 设备失联：写的是「失联，可能是卸载、关机或断网」。**卸载这一半服务端结构上收不到**，
  只能反推心跳超时，所以不写"孩子已卸载"。
- 闸门告警列表里的记录是设备亲口报回来的（确切时间 + 确切原因），和上面那条是两种确定性，分开放。
- 报表按天聚合是稀疏的，没上报的日子不补零行——"空表"是正常态。
- `until_ms` 在服务端是**开区间**，要给明天零点。
