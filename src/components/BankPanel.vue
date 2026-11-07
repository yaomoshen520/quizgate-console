<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { rpc } from '../api/rpc'
import ScanPanel from './ScanPanel.vue'
import {
  DeleteQuestionReplySchema,
  DeleteQuestionRequestSchema,
  ListBankReplySchema,
  ListBankRequestSchema,
  Subject,
  UploadBankReplySchema,
  UploadBankRequestSchema,
  VerifyQuestionReplySchema,
  VerifyQuestionRequestSchema,
} from '../gen/quizgate_pb'
import type { BankQuestion } from '../gen/quizgate_pb'
import { session } from '../store/session'

const props = defineProps<{ childId: string; grade: number }>()

const questions = ref<BankQuestion[]>([])
const loading = ref(false)
const listError = ref('')

const subjectNames: Record<number, string> = {
  [Subject.MATH]: '数学',
  [Subject.CHINESE]: '语文',
  [Subject.ENGLISH]: '英语',
}

async function load() {
  loading.value = true
  listError.value = ''
  try {
    const reply = await rpc(
      '/parent/list-bank',
      ListBankRequestSchema,
      ListBankReplySchema,
      { childId: props.childId },
      session.parentToken,
    )
    questions.value = [...reply.questions]
  } catch (e) {
    listError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

const bankName = ref('')
const subject = ref<Subject>(Subject.MATH)
const followChildGrade = ref(true)
const gradeOverride = ref(props.grade)
const knowledge = ref('')
const stem = ref('')
const options = ref<string[]>(['', '', '', ''])
const correctIndex = ref(0)
const explanation = ref('')

const busy = ref(false)
const uploadError = ref('')
const uploaded = ref('')

/** 服务端认 blank 与越界下标，这里提前拦一次，省一次注定失败的往返和一句看不懂的中文报错。 */
const canSubmit = computed(() => {
  const filled = options.value.map((o) => o.trim()).filter((o) => o !== '')
  return (
    !busy.value &&
    stem.value.trim() !== '' &&
    knowledge.value.trim() !== '' &&
    filled.length >= 2 &&
    correctIndex.value < options.value.length &&
    options.value[correctIndex.value].trim() !== ''
  )
})

function addOption() {
  if (options.value.length < 6) options.value.push('')
}

function removeOption(index: number) {
  if (options.value.length <= 2) return
  options.value.splice(index, 1)
  if (correctIndex.value >= options.value.length) correctIndex.value = options.value.length - 1
  else if (index < correctIndex.value) correctIndex.value--
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  uploadError.value = ''
  uploaded.value = ''
  try {
    const reply = await rpc(
      '/parent/upload-bank',
      UploadBankRequestSchema,
      UploadBankReplySchema,
      {
        childId: props.childId,
        bankName: bankName.value.trim(),
        // 选项不能带空串：孩子屏幕上会出现一个空白选项，而它还可能被选成答案。
        drafts: [
          {
            subject: subject.value,
            grade: followChildGrade.value ? 0 : gradeOverride.value,
            knowledgePoint: knowledge.value.trim(),
            stem: stem.value.trim(),
            options: options.value.map((o) => o.trim()).filter((o) => o !== ''),
            correctIndex: renumberedIndex(),
            explanation: explanation.value.trim(),
          },
        ],
      },
      session.parentToken,
    )
    if (reply.errors.length > 0) uploadError.value = reply.errors.join('；')
    if (reply.accepted > 0) {
      uploaded.value = `已入库 ${reply.accepted} 题。`
      stem.value = ''
      knowledge.value = ''
      options.value = ['', '', '', '']
      correctIndex.value = 0
      explanation.value = ''
      await load()
    }
  } catch (e) {
    uploadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

/** 删过空选项后，"第 3 项是答案"可能已经不是同一项了——按过滤后的数组重算。 */
function renumberedIndex(): number {
  let seen = 0
  for (let i = 0; i < options.value.length; i++) {
    if (options.value[i].trim() === '') continue
    if (i === correctIndex.value) return seen
    seen++
  }
  return 0
}

/* ── 核对与删除 ─────────────────────────────────────────── */

const rowBusy = ref('')
const actionError = ref('')
const actionNotice = ref('')

/**
 * 点的是库里的 verified，不是页面上的一个标记：闸门抽题只抽已核对的那些。
 * 所以改完必须重新读一次列表，否则家长看到的是一个已经不存在的状态。
 */
async function setVerified(questionId: string, verified: boolean) {
  if (rowBusy.value) return
  rowBusy.value = questionId
  actionError.value = ''
  actionNotice.value = ''
  try {
    const reply = await rpc(
      '/parent/verify-question',
      VerifyQuestionRequestSchema,
      VerifyQuestionReplySchema,
      { questionId, verified },
      session.parentToken,
    )
    await load()
    actionNotice.value = reply.message
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e)
  } finally {
    rowBusy.value = ''
  }
}

async function remove(questionId: string) {
  if (rowBusy.value) return
  if (!window.confirm('删掉这道题？孩子那边正在做的这一道也会一起作废。')) return
  rowBusy.value = questionId
  actionError.value = ''
  actionNotice.value = ''
  try {
    await rpc(
      '/parent/delete-question',
      DeleteQuestionRequestSchema,
      DeleteQuestionReplySchema,
      { questionId },
      session.parentToken,
    )
    await load()
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e)
  } finally {
    rowBusy.value = ''
  }
}
</script>

<template>
  <div class="stack">
    <ScanPanel :child-id="props.childId" @scanned="load" />

    <section class="card">
      <div class="spread head">
        <div>
          <h2 class="t-card">出题</h2>
          <p class="muted">这道题会进「{{ bankName.trim() || '默认题库' }}」，孩子下次触发闸门就可能抽到。</p>
        </div>
      </div>

      <div class="grid">
        <label class="field">
          <span class="field__label">题库名（留空=默认）</span>
          <input v-model="bankName" class="input" maxlength="64" placeholder="比如「第三单元 乘法」" />
        </label>
        <label class="field">
          <span class="field__label">学科</span>
          <select v-model="subject" class="input">
            <option :value="Subject.MATH">数学</option>
            <option :value="Subject.CHINESE">语文</option>
            <option :value="Subject.ENGLISH">英语</option>
          </select>
        </label>
        <div class="field">
          <span class="field__label">年级</span>
          <label class="check">
            <input v-model="followChildGrade" type="checkbox" />
            跟着孩子（{{ props.grade }} 年级）
          </label>
          <input
            v-if="!followChildGrade"
            v-model.number="gradeOverride"
            class="input"
            type="number"
            min="1"
            max="9"
          />
        </div>
        <label class="field">
          <span class="field__label">知识点（必填）</span>
          <input v-model="knowledge" class="input" maxlength="64" placeholder="比如「两位数乘一位数」" />
        </label>
      </div>

      <label class="field stem">
        <span class="field__label">题干</span>
        <textarea v-model="stem" class="input input--area" rows="2" placeholder="3 × 4 + 5 = ？"></textarea>
      </label>

      <div class="field">
        <span class="field__label">选项与答案（点单选圈标出正确项）</span>
        <div v-for="(option, index) in options" :key="index" class="option">
          <input
            v-model.number="correctIndex"
            class="option__pick"
            type="radio"
            name="correct-index"
            :value="index"
            :aria-label="`把第 ${index + 1} 项设为正确答案`"
          />
          <input
            v-model="options[index]"
            class="input option__text"
            :placeholder="`选项 ${index + 1}`"
            maxlength="120"
          />
          <button class="btn btn--ghost option__del" type="button" :disabled="options.length <= 2" @click="removeOption(index)">
            删
          </button>
        </div>
        <div class="row--tight add-row">
          <button class="btn btn--ghost" type="button" :disabled="options.length >= 6" @click="addOption">
            ＋ 加一个选项
          </button>
        </div>
      </div>

      <label class="field">
        <span class="field__label">答完给孩子看的讲解（可留空）</span>
        <textarea v-model="explanation" class="input input--area" rows="2" placeholder="先算乘法 3×4=12，再加 5。"></textarea>
      </label>

      <p v-if="uploadError" class="alert alert--error" role="alert">
        <span aria-hidden="true">✕</span>
        <span>{{ uploadError }}</span>
      </p>
      <p v-if="uploaded" class="alert alert--ok" role="status">
        <span aria-hidden="true">✓</span>
        <span>{{ uploaded }}</span>
      </p>

      <div class="row--tight foot">
        <button class="btn btn--primary" :disabled="!canSubmit" @click="submit">
          <span v-if="busy" class="spinner" aria-hidden="true"></span>
          {{ busy ? '上传中…' : '上传这一题' }}
        </button>
        <span v-if="!canSubmit && !busy" class="muted fine">题干、知识点至少两个非空选项都要填，且正确项要落在填了的选项上。</span>
      </div>
    </section>

    <section class="card card--flush">
      <div class="card__head">
        <h2 class="t-card">这个孩子的题库（{{ questions.length }}）</h2>
        <button class="btn btn--ghost" :disabled="loading" @click="load">{{ loading ? '读取中…' : '刷新' }}</button>
      </div>
      <p v-if="listError || actionError" class="alert alert--error list-msg" role="alert">
        <span aria-hidden="true">✕</span>
        <span>{{ listError || actionError }}</span>
      </p>
      <p v-if="actionNotice" class="alert alert--ok list-msg" role="status">
        <span aria-hidden="true">✓</span>
        <span>{{ actionNotice }}</span>
      </p>
      <table v-if="!listError && !actionError && questions.length > 0" class="table table--stack" role="table">
        <thead>
          <tr>
            <th scope="col">学科</th>
            <th scope="col">题干</th>
            <th scope="col">选项</th>
            <th scope="col">知识点</th>
            <th scope="col">能不能抽到</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr v-for="q in questions" :key="q.questionId" role="row">
            <td role="cell" data-label="学科">
              <div class="two">
                <span class="badge badge--idle">{{ subjectNames[q.subject] ?? '未分类' }}</span>
                <span class="mono tiny">{{ q.grade }} 年级</span>
              </div>
            </td>
            <td role="cell" data-label="题干">
              <div class="two">
                <strong>{{ q.stem }}</strong>
                <span v-if="q.explanation" class="muted tiny">{{ q.explanation }}</span>
              </div>
            </td>
            <td role="cell" data-label="选项">
              <ol class="opts">
                <li v-for="(opt, i) in q.options" :key="i" :class="{ 'opts__right': i === q.correctIndex }">
                  {{ opt }}
                  <span v-if="i === q.correctIndex" class="mono">（答案）</span>
                </li>
              </ol>
            </td>
            <td role="cell" data-label="知识点">
              <div class="two">
                <span>{{ q.knowledgePoint }}</span>
                <span class="mono tiny">id {{ q.questionId }}</span>
              </div>
            </td>
            <td role="cell" data-label="能不能抽到">
              <span v-if="q.verified" class="badge badge--ok">
                <span class="badge__dot" aria-hidden="true"></span>孩子抽得到
              </span>
              <span v-else class="badge badge--warn">
                <span class="badge__dot" aria-hidden="true"></span>等你核对
              </span>
            </td>
            <td role="cell" data-label="操作">
              <div class="acts">
                <button
                  v-if="!q.verified"
                  class="btn btn--primary btn--sm"
                  type="button"
                  :disabled="rowBusy !== ''"
                  @click="setVerified(q.questionId, true)"
                >
                  核对通过
                </button>
                <button
                  v-else
                  class="btn btn--ghost btn--sm"
                  type="button"
                  :disabled="rowBusy !== ''"
                  @click="setVerified(q.questionId, false)"
                >
                  驳回
                </button>
                <button
                  class="btn btn--ghost btn--sm"
                  type="button"
                  :disabled="rowBusy !== ''"
                  @click="remove(q.questionId)"
                >
                  删除
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!listError && !actionError" class="muted table-empty">还没传过题。手打一道，或者拍一张卷子——未核对的题要先在这里点「核对通过」，孩子才抽得到。</p>
    </section>
  </div>
</template>

<style scoped>
.head {
  align-items: flex-start;
}
.head .muted {
  margin-top: var(--sp-1);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--sp-4);
  margin-top: var(--sp-5);
}
.stem {
  margin-top: var(--sp-4);
}
.option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-3);
  margin-top: var(--sp-2);
}
.option__pick {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: hsl(var(--brand-500));
}
.option__text {
  width: 100%;
}
.option__del {
  height: var(--ctl-h-sm);
  padding: 0 var(--sp-3);
}
.add-row {
  display: flex;
  margin-top: var(--sp-3);
}
.foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-3);
  margin-top: var(--sp-5);
}
.fine {
  font-size: var(--text-xs);
}
.list-msg,
.table-empty {
  margin: var(--sp-4) var(--sp-5);
}
/* 操作列：一行最多两个按钮，窄屏上换行也不能挤掉题干。 */
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
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
  line-height: 1.35;
}
.two strong {
  font-weight: 600;
}
.tiny {
  font-size: var(--text-xs);
  color: hsl(var(--muted));
}
/* 选项列表：正确项用琥珀底标出来，这是家长自己出的题，答案给他看是应该的。 */
.opts {
  margin: 0;
  padding-left: var(--sp-4);
  font-size: var(--text-sm);
}
.opts__right {
  color: hsl(var(--amber-700));
  font-weight: 600;
}
@media (max-width: 720px) {
  /* 这颗单选圈是「哪一项是答案」的唯一入口，16px 的原生圈在手机上就是碰运气。
     它没有可点的文字陪着（选项内容在右边的输入框里），所以只能把它自己放大。 */
  .option__pick {
    width: 26px;
    height: 26px;
  }
  .option {
    gap: var(--sp-2);
  }
}
</style>
