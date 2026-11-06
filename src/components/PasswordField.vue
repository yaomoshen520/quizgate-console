<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * 口令框共用一个"显示/隐藏"开关：手机上敲完看不见自己敲了啥，是最常见的一次登录失败。
 * 这里只管可见性，长度/字节数/两次是否一致这些规则一律留在页面里，免得同一份逻辑有两处。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    autocomplete?: string
    placeholder?: string
    required?: boolean
  }>(),
  { autocomplete: 'current-password', placeholder: '', required: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const shown = ref(false)
const type = computed(() => (shown.value ? 'text' : 'password'))
</script>

<template>
  <label class="field">
    <span class="field__label">{{ props.label }}</span>
    <span class="pw">
      <input
        class="pw__input input input--wide"
        :type="type"
        :value="props.modelValue"
        :autocomplete="props.autocomplete"
        :placeholder="props.placeholder"
        :required="props.required"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <!-- 按钮嵌在 label 里面，不拦一下的话点它会顺带触发 label、把焦点甩回输入框。 -->
      <button
        class="pw__toggle"
        type="button"
        :aria-pressed="shown"
        :aria-label="shown ? '隐藏口令' : '显示口令'"
        @click.prevent="shown = !shown"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.6 12S6.2 5.9 12 5.9s9.4 6.1 9.4 6.1-3.6 6.1-9.4 6.1-9.4-6.1-9.4-6.1Z" />
          <circle cx="12" cy="12" r="2.8" />
          <path v-if="shown" d="M4.6 4.6 19.4 19.4" />
        </svg>
      </button>
    </span>
    <slot />
  </label>
</template>

<style scoped>
.pw {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
/* 撑满靠 flex 而不是靠调用方传 input--wide：管理员页那个口令框在网格里，
   少传一次修饰类就会缩成输入框默认宽度。留白按 44 算，手指点在右端也要能命中开关。 */
.pw__input {
  flex: 1 1 auto;
  min-width: 0;
  padding-right: 44px;
}
.pw__toggle {
  position: absolute;
  right: 0;
  top: 0;
  display: grid;
  place-items: center;
  width: 44px;
  height: 100%;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  color: hsl(var(--muted));
  cursor: pointer;
  transition: color var(--t-fast) var(--ease), background-color var(--t-fast) var(--ease);
}
@media (hover: hover) {
  .pw__toggle:hover {
    color: hsl(var(--ink-soft));
    background: hsl(var(--surface-sunken));
  }
}
.pw__toggle:focus-visible {
  outline: none;
  box-shadow: var(--ring);
}
.pw__toggle svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
