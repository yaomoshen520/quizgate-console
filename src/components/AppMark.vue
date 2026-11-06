<script setup lang="ts">
import { useId } from 'vue'

const props = withDefaults(defineProps<{ size?: number }>(), { size: 26 })
// 同一页可能出现两个标记，渐变 id 必须每个实例唯一，否则后者引用到前者的定义。
const gradientId = useId()
</script>

<template>
  <svg :width="props.size" :height="props.size" viewBox="0 0 32 32" aria-hidden="true">
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#4a72e8" />
        <stop offset="1" stop-color="#2748b8" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="8" :fill="`url(#${gradientId})`" />
    <path
      d="M16 6.5 23 9v7.2c0 4.4-2.9 7.6-7 9.3-4.1-1.7-7-4.9-7-9.3V9l7-2.5Z"
      fill="#fff"
      fill-opacity=".16"
      stroke="#fff"
      stroke-width="1.8"
      stroke-linejoin="round"
    />
    <path
      d="M12.6 16.2l2.5 2.5 4.5-5"
      fill="none"
      stroke="#ffd68a"
      stroke-width="2.1"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
