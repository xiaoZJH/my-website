/* ============================================================
 * Landing 右上角 3D 图标球装饰
 * 来源：icon-cloud-sphere.html（纯前端，无外部依赖）
 * 渲染：斐波那契球面采样均匀分布 64 张卡，绕 Y 轴自转 + 鼠标视差
 * ============================================================ */
(function () {
  "use strict";
  var reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var cloud = document.getElementById("wlIconCloud");
  var wrap  = document.getElementById("wlSphere");
  var ring  = cloud ? cloud.querySelector(".ring") : null;

  // 克隆基础图标卡到目标数量（取 10 个原始图标，重复填充到 64）
  var TARGET = 64;
  if (ring) {
    var base = Array.prototype.slice.call(ring.children);
    for (var i = base.length; i < TARGET; i++) {
      ring.appendChild(base[i % base.length].cloneNode(true));
    }
  }
  var cards = ring ? Array.prototype.slice.call(ring.querySelectorAll(".icon-card")) : [];
  var N = cards.length;
  var R = 168; // 球体半径（容器 460，留边距避免溢出）

  // 斐波那契球面采样：均匀分布不扎堆
  var PI2 = Math.PI * 2;
  var golden = (1 + Math.sqrt(5)) / 2; // 黄金比例 φ
  var sph = cards.map(function (_, i) {
    var y = 1 - (i / (N - 1)) * 2;            // -1（北极）~ +1（南极）
    var radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    var theta = PI2 * i / golden;             // 黄金角步进
    return {
      x: Math.cos(theta) * radiusAtY,
      y: y,
      z: Math.sin(theta) * radiusAtY
    };
  });

  // 鼠标视差：以球体中心为基准的轻微倾斜
  var tx = 0, ty = 0, cx = 0, cy = 0;
  if (!reduce && wrap) {
    window.addEventListener("pointermove", function (e) {
      var r = wrap.getBoundingClientRect();
      var ox = r.left + r.width / 2;
      var oy = r.top + r.height / 2;
      tx = (e.clientX - ox) / window.innerWidth * 18;   // 左右倾斜
      ty = (e.clientY - oy) / window.innerHeight * -18; // 上下倾斜
    }, { passive: true });
  }

  if (N) {
    function render(tsec) {
      // 整体视差缓动
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      cloud.style.transform = "rotateX(" + cy.toFixed(2) + "deg) rotateY(" + cx.toFixed(2) + "deg)";

      var angle = tsec * 0.13;            // 绕 Y 轴转速（约 48s 一圈）
      var cosA = Math.cos(angle), sinA = Math.sin(angle);
      for (var i = 0; i < N; i++) {
        var p = sph[i];
        // 绕 Y 轴旋转
        var rx = p.x * cosA - p.z * sinA;
        var rz = p.x * sinA + p.z * cosA;
        var ry = p.y;
        var sx = rx * R;
        var sy = -ry * R;                // Y 翻转（CSS Y 向下）
        var wz = rz * R;
        var d = rz;                       // -1(后) ~ +1(前)
        var scale = 0.5 + (d + 1) / 2 * 0.6;     // 0.5 ~ 1.1
        var opacity = 0.22 + (d + 1) / 2 * 0.78; // 0.22 ~ 1.0
        var blur = Math.max(0, -d) * 1.6;        // 后方模糊
        var card = cards[i];
        card.style.transform =
          "translate3d(" + sx.toFixed(1) + "px," + sy.toFixed(1) + "px," + wz.toFixed(1) + "px) scale(" + scale.toFixed(3) + ")";
        card.style.opacity = opacity.toFixed(3);
        card.style.filter = blur > 0.1 ? "blur(" + blur.toFixed(2) + "px)" : "none";
        card.style.zIndex = String(Math.round((d + 1) * 100)); // 前盖后
      }
    }
    if (reduce) {
      render(0);
    } else {
      var t0 = performance.now();
      (function frame(now) {
        render((now - t0) / 1000);
        requestAnimationFrame(frame);
      })(performance.now());
    }
  }
})();
