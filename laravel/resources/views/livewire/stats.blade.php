@php
    // 导航栏中的实时访客计数芯片（由 styles.css 的 .visitor-chip 提供样式）
@endphp
<span class="visitor-chip" title="累计访问量">
    <span class="visitor-chip__dot" aria-hidden="true"></span>
    <span>{{ number_format($total) }}</span>
</span>
