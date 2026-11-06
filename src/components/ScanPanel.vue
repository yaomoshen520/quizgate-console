<script setup lang="ts">
import { computed, ref } from 'vue'
import { rpc } from '../api/rpc'
import {
  CheckVerdict,
  ScanBankReplySchema,
  ScanBankRequestSchema,
  Subject,
  VerifyQuestionReplySchema,
  VerifyQuestionRequestSchema,
} from '../gen/quizgate_pb'
import type { QuestionDraft, ScanBankReply } from '../gen/quizgate_pb'
import { session } from '../store/session'

const props = defineProps<{ childId: string }>();
const emit = defineEmits<{ scanned: [] }>()

/** 服务端 quizgate.extractor.max-image-bytes 的同一道线，这里先自己量一次，省一次注定失败的上传。 */
const MAX_BYTES = 4 * 1024 * 1024
/** 长边压到 1600 像素：手机拍的整页卷子在这个尺寸下字迹仍然清晰，字节数却小一个量级。 */
const LONG_EDGE = 1600

const source = ref<{ name: string; raw: number } | null>(null)
const payload = ref<Uint8Array | null>(null)
const preview = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const bankName = ref('')
const busy = ref(false)
const fail = ref('')
const reply = ref<ScanBankReply | null>(null)

const ready = computed(() => payload.value !== null && !busy.value)
const sentBytes = computed(() => payload.value?.length ?? 0)

const subjectNames: Record<number, string> = {
  [Subject.MATH]: '数学',
  [Subject.CHINESE]: '语文',
  [Subject.ENGLISH]: '英语',
}

function kb(bytes: number): string {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${bytes} B`
}

/**
 * 浏览器里压成 JPEG 再发。
 * 服务端只收 image/jpeg|png，而且原图一寸都不许落库——所以压缩必须发生在客户端，
 * 否则一张 5 MB 的手机原片连门都进不来。底色先铺白，PNG 的透明区在 JPEG 下会变黑。
 */
async function compress(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('这张图片读不出来，换一个文件试试'))
      el.src = url
    })
    const scale = Math.min(1, LONG_EDGE / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('这个浏览器不支持图片压缩')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error('压缩失败了，原图太大或者浏览器不给写')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 这张图作废：清掉待发报文，回到「还没选文件」的样子。
 * 家长刚看到一条拒绝文案，底下却还留着上一张图的缩略图并且能点识别——那就是在发一张他没选的图。
 */
function discard() {
  payload.value = null
  source.value = null
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
  // 原生 input 里还留着那个不合规的文件名：屏幕阅读器会照着它念，和「重新选一张」的界面自相矛盾。
  if (fileInput.value) fileInput.value.value = ''
}

async function accept(file: File | undefined) {
  fail.value = ''
  reply.value = null
  if (!file) return
  if (!/^image\/(jpeg|png)$/.test(file.type)) {
    fail.value = `只收照片（jpg 或 png），你选的是 ${file.type || '未知类型'}`
    discard()
    return
  }
  try {
    const blob = await compress(file)
    if (blob.size > MAX_BYTES) {
      fail.value = `压完还是 ${kb(blob.size)}，超过 ${kb(MAX_BYTES)} 的上限，换一张拍近一点的`
      discard()
      return
    }
    payload.value = new Uint8Array(await blob.arrayBuffer())
    source.value = { name: file.name, raw: file.size }
    if (preview.value) URL.revokeObjectURL(preview.value)
    preview.value = URL.createObjectURL(blob)
  } catch (e) {
    fail.value = e instanceof Error ? e.message : String(e)
    discard()
  }
}

async function scan() {
  if (!payload.value || busy.value) return
  busy.value = true
  fail.value = ''
  try {
    reply.value = await rpc(
      '/parent/scan-bank',
      ScanBankRequestSchema,
      ScanBankReplySchema,
      { childId: props.childId, image: payload.value, imageMime: 'image/jpeg', bankName: bankName.value.trim() },
      session.parentToken,
    )
    // 识别出来的题当场就落库了（未核对状态），家长这边的列表得跟着变，否则回显是旧的。
    emit('scanned')
  } catch (e) {
    fail.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function verdictOf(value: CheckVerdict): { label: string; tone: string } {
  if (value === CheckVerdict.CHECK_CONFIRMED) return { label: '服务端已验算', tone: 'badge--ok' }
  if (value === CheckVerdict.CHECK_MISMATCH) return { label: '和卷面算不拢', tone: 'badge--danger' }
  return { label: '要你人工看', tone: 'badge--warn' }
}

/**
 * 在这里点的核对要当场改这里的样子。
 * reply 是一次识别应答的快照，不会跟着库里那格 verified 变；只刷下面那张表的话，
 * 家长刚点过「核对通过」的这一条还是写着"待你核对"，看着就是没生效。
 * 只记点成功的那些——失败的这次不动，宁可让家长再点一遍。
 */
const overridden = ref<Record<string, boolean>>({})
const rowBusy = ref('')

async function verify(questionId: string, verified: boolean) {
  if (rowBusy.value) return
  rowBusy.value = questionId
  fail.value = ''
  try {
    await rpc(
      '/parent/verify-question',
      VerifyQuestionRequestSchema,
      VerifyQuestionReplySchema,
      { questionId, verified },
      session.parentToken,
    )
    overridden.value[questionId] = verified
    // 下面那张表读的是库，必须跟着重读，否则两块显示的是同一道题的两个状态。
    emit('scanned')
  } catch (e) {
    fail.value = e instanceof Error ? e.message : String(e)
  } finally {
    rowBusy.value = ''
  }
}

/**
 * draft 在 protobuf 里是个可缺省的消息字段，模板里不想到处写 `?.`，在这里摊平一次。
 * 服务端每识别出一道都会填 draft，缺了就只能说明报文本身不对——那种行宁可丢掉也不给家长看半道题。
 */
const rows = computed(() => {
  const out: {
    questionId: string
    verdict: CheckVerdict
    checkNote: string
    verified: boolean
    draft: QuestionDraft
  }[] = []
  for (const q of reply.value?.questions ?? []) {
    if (q.draft) {
      out.push({
        questionId: q.questionId,
        verdict: q.verdict,
        checkNote: q.checkNote,
        verified: overridden.value[q.questionId] ?? q.verified,
        draft: q.draft,
      })
    }
  }
  return out
})
</script>

<template>
  <section class="card">
    <div class="spread head">
      <div>
        <h2 class="t-card">拍一张卷子</h2>
        <p class="muted">识别出来的题当场入库，但<b>孩子暂时抽不到</b>——服务端自己算不拢答案的那些，要你在下面点一次「核对通过」才放行。</p>
      </div>
    </div>

    <div class="drop" @dragover.prevent @drop.prevent="accept($event.dataTransfer?.files[0])">
      <input id="scan-file" ref="fileInput" class="file" type="file" accept="image/jpeg,image/png" aria-label="卷子的照片" @change="accept(($event.target as HTMLInputElement).files?.[0])" />
      <div class="field">
        <span class="field__label">卷子的照片</span>
        <span v-if="source" class="picked">
          <img class="thumb" :src="preview" alt="压缩后将要发出去的图" />
          <span class="two">
            <strong>{{ source.name }}</strong>
            <span class="mono tiny">原图 {{ kb(source.raw) }} → 发出去 {{ kb(sentBytes) }}（长边 ≤{{ LONG_EDGE }}）</span>
          </span>
        </span>
        <label v-else class="btn btn--ghost pick" for="scan-file">选一张 jpg / png</label>
      </div>
      <label class="field bank">
        <span class="field__label">进哪个题库（留空=默认）</span>
        <input v-model="bankName" class="input" maxlength="64" placeholder="比如「第三单元 口算」" />
      </label>
      <button class="btn btn--primary" type="button" :disabled="!ready" @click="scan">
        <span v-if="busy" class="spinner" aria-hidden="true"></span>
        {{ busy ? '识别中…' : '开始识别' }}
      </button>
    </div>

    <p v-if="fail" class="alert alert--error msg" role="alert">
      <span aria-hidden="true">✕</span><span>{{ fail }}</span>
    </p>
    <p v-else-if="reply?.engineMessage" class="alert alert--info msg" role="status">
      <span aria-hidden="true">ℹ</span><span>{{ reply.engineMessage }}</span>
    </p>
    <ul v-if="reply?.errors.length" class="errs" role="alert">
      <li v-for="(err, i) in reply.errors" :key="i" class="muted">{{ err }}</li>
    </ul>

    <div v-if="rows.length" class="results">
      <h3 class="t-card sub">识别出 {{ rows.length }} 道</h3>
      <article v-for="q in rows" :key="q.questionId" class="item">
        <div class="item__head">
          <span class="badge" :class="verdictOf(q.verdict).tone">{{ verdictOf(q.verdict).label }}</span>
          <span v-if="q.verified" class="badge badge--ok">已核对</span>
          <span v-else class="badge badge--warn">待你核对</span>
          <span class="badge badge--idle">{{ subjectNames[q.draft.subject] ?? '未分类' }}</span>
          <span class="mono tiny">id {{ q.questionId }}</span>
        </div>
        <p class="stem">{{ q.draft.stem }}</p>
        <ol class="opts">
          <li v-for="(opt, i) in q.draft.options" :key="i" :class="{ 'opts__right': i === q.draft.correctIndex }">
            {{ opt }}<span v-if="i === q.draft.correctIndex" class="mono">（模型选的答案）</span>
          </li>
        </ol>
        <p v-if="q.checkNote" class="note muted">{{ q.checkNote }}</p>
        <div class="row--tight acts">
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            :disabled="q.verified || rowBusy !== ''"
            @click="verify(q.questionId, true)"
          >
            <span v-if="rowBusy === q.questionId" class="spinner" aria-hidden="true"></span>
            核对通过
          </button>
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            :disabled="!q.verified || rowBusy !== ''"
            @click="verify(q.questionId, false)"
          >
            <span v-if="rowBusy === q.questionId" class="spinner" aria-hidden="true"></span>
            驳回
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.head .muted {
  margin-top: var(--sp-1);
}
.drop {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--sp-4);
  margin-top: var(--sp-4);
  padding: var(--sp-4);
  border: 1px dashed hsl(var(--line-strong));
  border-radius: var(--r-md);
  background: hsl(var(--surface-sunken));
}
/* 真输入框藏起来，点按钮走 label，键盘 Tab 仍然能聚焦到它本身。 */
.file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.picked {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.thumb {
  width: 96px;
  height: 72px;
  object-fit: cover;
  border-radius: var(--r-sm);
  border: 1px solid hsl(var(--line));
}
.bank {
  min-width: 180px;
  flex: 1;
}
.msg,
.errs {
  margin-top: var(--sp-4);
}
.errs {
  margin: var(--sp-4) 0 0;
  padding-left: var(--sp-5);
  font-size: var(--text-sm);
}
.results {
  margin-top: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.item {
  padding: var(--sp-4);
  border: 1px solid hsl(var(--line));
  border-radius: var(--r-md);
  background: hsl(var(--surface));
}
.item__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}
.stem {
  margin: var(--sp-3) 0 0;
  font-weight: 600;
}
.opts {
  margin: var(--sp-2) 0 0;
  padding-left: var(--sp-4);
  font-size: var(--text-sm);
}
.opts__right {
  color: hsl(var(--amber-700));
  font-weight: 600;
}
.note {
  margin: var(--sp-2) 0 0;
  font-size: var(--text-sm);
}
.acts {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-3);
}
.btn--sm {
  height: var(--ctl-h-sm);
  padding: 0 var(--sp-3);
  font-size: var(--text-sm);
}
.two {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tiny {
  font-size: var(--text-xs);
  color: hsl(var(--muted));
}
.sub {
  margin: 0;
}
@media (max-width: 720px) {
  /* 这块是「选图 → 填题库名 → 点识别」三件并排：手机上并排的话按钮只剩半个字宽，
     所以按钮自己占一行、拉满，家长拇指落下去就是它。 */
  .drop > .btn {
    flex: 1 1 100%;
  }
  .bank,
  .picked,
  .picked .two {
    min-width: 0;
  }
  /* 相机出来的文件名长得没边（IMG_20261105_143022.jpg），不折就会把整块撑出屏幕。 */
  .picked strong {
    overflow-wrap: anywhere;
  }
}
</style>
