<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    icon: 'child' | 'device' | 'gate' | 'clock'
    tone?: 'brand' | 'ok' | 'warn' | 'idle'
  }>(),
  { tone: 'brand' },
)

/** 只有这四个图形，画在 24 的网格里，描边统一 1.7，不引图标库。 */
const paths: Record<string, string> = {
  child: 'M9 8.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6 19c.7-3 2.9-4.5 6-4.5S17.3 16 18 19',
  device: 'M8 4.5h8a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 18V6A1.5 1.5 0 0 1 8 4.5ZM11 17h2',
  gate: 'M4.5 18.5h15M7 18.5V8.5a5 5 0 0 1 10 0v10M12 12.5v6',
  clock: 'M12 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11ZM12 9.5V12l2 1.5',
}

const toneVar: Record<string, string> = {
  brand: 'var(--brand-50)',
  ok: 'var(--success-100)',
  warn: 'var(--amber-100)',
  idle: 'var(--slate-100)',
}
const inkVar: Record<string, string> = {
  brand: 'var(--brand-600)',
  ok: 'var(--success-700)',
  warn: 'var(--amber-700)',
  idle: 'var(--slate-600)',
}
</script>

<template>
  <article class="kpi">
    <span
      class="kpi__icon"
      :style="{ background: `hsl(${toneVar[props.tone]})`, color: `hsl(${inkVar[props.tone]})` }"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
        <path :d="paths[props.icon]" />
      </svg>
    </span>
    <div class="kpi__text">
      <span class="t-label">{{ props.label }}</span>
      <strong class="t-num">{{ props.value }}</strong>
      <span v-if="props.hint" class="kpi__hint">{{ props.hint }}</span>
    </div>
  </article>
</template>

<style scoped>
.kpi {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-5);
  background: hsl(var(--surface));
  border: 1px solid hsl(var(--line));
  border-radius: var(--r-lg);
  box-shadow: var(--sh-1);
  transition: box-shadow var(--t) var(--ease), transform var(--t) var(--ease);
}
@media (hover: hover) {
  .kpi:hover {
    box-shadow: var(--sh-2);
    transform: translateY(-1px);
  }
}
.kpi__icon {
  width: 40px;
  height: 40px;
  border-radius: var(--r-md);
  display: grid;
  place-items: center;
  flex: none;
}
.kpi__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.kpi__hint {
  font-size: var(--text-xs);
  color: hsl(var(--muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 手机上这一张卡是整幅一条（.grid-kpi 收成单列），所以只收内边距、放开说明文字的换行。 */
@media (max-width: 720px) {
  .kpi {
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
  }
  .kpi__hint {
    white-space: normal;
  }
}
</style>
