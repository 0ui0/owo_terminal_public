/**
 * AnimeRig 角色矢量零件组装模块
 * 本模块使用 SVG 标准规范：在根 <defs> 中注入 parts/*.svg 矢量零件，
 * 骨骼节点统一使用 <use href="#part_xxx"/> 进行渲染，完美解决 Mithril 60fps DOM Diffing 报错！
 */

const partSvgCache = new Map();

export const loadPartSvg = async (partName) => {
  if (partSvgCache.has(partName)) return partSvgCache.get(partName);
  try {
    const res = await fetch(`/api/apps/animeRig/parts/${partName}.svg`);
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
      const innerContent = match ? match[1] : text;
      partSvgCache.set(partName, innerContent);
      return innerContent;
    }
  } catch (err) {
    console.warn(`[animeRig] 无法加载 parts/${partName}.svg`, err);
  }
  return "";
};

export const preloadAllParts = async () => {
  const parts = [
    "head", "torso", "neck", "arm_upper", "arm_lower", "hand",
    "leg_upper", "leg_lower", "foot", "ahoge", "hair_front", "hair_back"
  ];
  await Promise.all(parts.map(p => loadPartSvg(p)));
};

// 渲染根 SVG <defs>，注入所有零部件定义
export const renderSvgDefs = (m) => {
  const defElements = [];
  partSvgCache.forEach((content, partName) => {
    if (content) {
      defElements.push(m.trust(`<g id="part_${partName}">${content}</g>`));
    }
  });
  return m("defs", defElements);
};

// 头发物理与动力学组件（120 根发丝，含惯性飘动与骨骼控制节点可视化）
export const generateHair = (m, S, currentPose, isFront, showBones, time = performance.now()) => {
  const strands = [];
  const num = isFront ? 70 : 50;
  const hcx = currentPose.headAngle * -0.5;
  const swayBase = Math.sin(time / 300) * 1.5;

  for (let i = 0; i <= num; i++) {
    const t = i / num;
    let ex, ey, controlX, controlY;
    let isBlue = false;
    
    // 微小发丝惯性相差与风浪
    const strandSway = Math.sin(time / 250 + i * 0.15) * 1.2;

    if (!isFront) {
      const angle = t * Math.PI; 
      ex = Math.cos(angle) * 32 + strandSway * 0.5;
      ey = -30 + Math.sin(angle) * 15; 
    } else {
      const angle = t * Math.PI; 
      ex = Math.cos(angle) * 30 + strandSway * 0.5;
      ey = -32; 
      
      if ((i > 20 && i < 28) || (i > 44 && i < 52)) isBlue = true;

      const distToCenter = Math.abs(ex);
      const isSideOuterBlack = (i >= 14 && i <= 20) || (i >= 52 && i <= 58);
      if (isBlue || isSideOuterBlack) {
        ey = -25;
      } else if (distToCenter < 7) {
        const centerFactor = 1 - (distToCenter / 7);
        ey = -32 + centerFactor * 12; 
      }
      ey += (Math.sin(i * 123) * 0.5 + 0.5) * 2; 
    }

    controlX = hcx + ex * 1.05 + swayBase;
    controlY = -60; 

    // 绘制二次贝塞尔曲线发丝
    strands.push(m("path", {
      d: `M 0 -65 Q ${controlX} ${controlY} ${ex} ${ey}`,
      fill: "none", 
      stroke: isBlue ? S.hairStreak : S.hairBase, 
      strokeWidth: isFront ? 2.5 : 4, 
      strokeLinecap: "round"
    }));

    // 开启“显示骨骼”时，可视化绘制发丝的控制节点与顶点
    if (showBones && (i % 8 === 0)) {
      strands.push(m("g", { style: { pointerEvents: "none" } }, [
        m("circle", { cx: controlX, cy: controlY, r: 1.5, fill: "#ff00ff" }),
        m("circle", { cx: ex, cy: ey, r: 1.5, fill: "#00ffcc" })
      ]));
    }
  }
  return strands;
};

// 动态呆毛组件（双股发丝，随风实时物理飘动）
export const generateDynamicAhoge = (m, S, currentPose, showBones, time = performance.now()) => {
  const strands = [];
  const hcx = currentPose.headAngle * -0.5;
  const num = 2; // 两根飘动的短呆毛

  for (let i = 0; i < num; i++) {
    // 基础风浪飘动 + 头部旋转引起的惯性
    const sway = Math.sin(time / 200 + i * 0.8) * 3; 
    
    const sx = 0;
    const sy = -65;
    
    // 控制点大幅度下压，贴近头皮
    const controlX = hcx + (i === 0 ? 8 : -6) + sway * 1.0;
    const controlY = (i === 0 ? -78 : -75); 

    // 发尾往下落并收拢
    const ex = hcx + (i === 0 ? 12 : -10) + sway;
    const ey = (i === 0 ? -58 : -62) + Math.abs(sway) * 0.3;

    strands.push(m("path", {
      d: `M ${sx} ${sy} Q ${controlX} ${controlY} ${ex} ${ey}`,
      fill: "none",
      stroke: S.hairBase,
      strokeWidth: i === 0 ? 3.5 : 2, // 一根粗，一根细
      strokeLinecap: "round"
    }));

    if (showBones) {
      strands.push(m("g", { style: { pointerEvents: "none" } }, [
        m("circle", { cx: controlX, cy: controlY, r: 1.5, fill: "#ff00ff" }),
        m("circle", { cx: ex, cy: ey, r: 1.5, fill: "#00ffcc" })
      ]));
    }
  }
  return strands;
};

// 头部组件（使用 parts/head.svg，结合 120 根前发发丝与动态面部表情）
export const renderFrontHead = (m, S, currentPose, showBones, bone) => {
  const hcx = currentPose.headAngle * -0.5;
  const hcy = -40;

  const px = currentPose.pupilX || 0;
  const py = currentPose.pupilY || 0;
  const pSize = currentPose.pupilSize || 1.0;
  const eyeType = currentPose.eyeType || "normal";

  const mouthY = -11.5;
  const rawCurve = currentPose.smileCurve || 3;
  const clampedCurve = Math.max(-5, Math.min(5, rawCurve));
  const mouthType = currentPose.mouthType || (currentPose.smileCurve < -2 ? "pout" : (currentPose.smileCurve > 10 ? "open" : "smile"));
  const mouthW = 5;

  const renderMouth = () => {
    switch (mouthType) {
      case "open":
        return m("g", [
          m("path", { d: `M -${mouthW} ${mouthY} Q 0 ${mouthY + 7} ${mouthW} ${mouthY} Z`, fill: "#ff6666", stroke: S.outline, strokeWidth: 1.5 }),
          m("path", { d: `M -${mouthW * 0.6} ${mouthY + 4} Q 0 ${mouthY + 2} ${mouthW * 0.6} ${mouthY + 4} Q 0 ${mouthY + 7} -${mouthW * 0.6} ${mouthY + 4} Z`, fill: "#ff9999" })
        ]);
      case "surprise":
        return m("ellipse", { cx: 0, cy: mouthY + 1, rx: 3, ry: 4, fill: "#ff7777", stroke: S.outline, strokeWidth: 1.5 });
      case "cat":
        return m("path", { d: `M -${mouthW} ${mouthY} Q -${mouthW / 2} ${mouthY + 3} 0 ${mouthY} Q ${mouthW / 2} ${mouthY + 3} ${mouthW} ${mouthY}`, fill: "none", stroke: S.outline, strokeWidth: 1.8, strokeLinecap: "round" });
      case "pout":
        return m("path", { d: `M -${mouthW} ${mouthY + 2} Q 0 ${mouthY - 2} ${mouthW} ${mouthY + 2}`, fill: "none", stroke: S.outline, strokeWidth: 2, strokeLinecap: "round" });
      case "calm":
        const calmW = mouthW * 0.65;
        return m("path", { d: `M -${calmW} ${mouthY} Q 0 ${mouthY + clampedCurve * 0.3} ${calmW} ${mouthY}`, fill: "none", stroke: S.outline, strokeWidth: 2, strokeLinecap: "round" });
      case "smile":
      default:
        return m("path", { d: `M -${mouthW} ${mouthY} Q 0 ${mouthY + clampedCurve} ${mouthW} ${mouthY}`, fill: "none", stroke: S.outline, strokeWidth: 2, strokeLinecap: "round" });
    }
  };

  const renderPupil = () => {
    if (eyeType === "star") {
      return m("g", { transform: `translate(${px}, ${py}) scale(${pSize})` }, [
        m("circle", { cx: 0, cy: 0, r: 5, fill: "#222222" }),
        m("path", { d: "M 0 -4 L 1 -1 L 4 0 L 1 1 L 0 4 L -1 1 L -4 0 L -1 -1 Z", fill: "#ffea00" }),
        m("circle", { cx: -2, cy: -2, r: 1.5, fill: "white" })
      ]);
    }
    return m("g", { transform: `translate(${px}, ${py}) scale(${pSize})` }, [
      m("ellipse", { cx: 0, cy: 0, rx: 4, ry: 5.5, fill: S.eyeGold }),
      m("ellipse", { cx: 0, cy: -1.5, rx: 2, ry: 3, fill: "#333333" }),
      m("circle", { cx: -2, cy: -2, r: 2, fill: "white" }),
      m("circle", { cx: 2, cy: 2, r: 1, fill: "white" })
    ]);
  };

  return [
    m("use", { href: "#part_head" }),
    
    // 动态腮红
    m("ellipse", { cx: -15, cy: -17.5, rx: 7, ry: 3, fill: "#ff9999", opacity: currentPose.blushOpacity }),
    m("ellipse", { cx: 15, cy: -17.5, rx: 7, ry: 3, fill: "#ff9999", opacity: currentPose.blushOpacity }),

    // 动态左眼
    m("g", { transform: `translate(-11, -22.5) scale(1, ${currentPose.eyeL_ScaleY})` }, [
      m("ellipse", { cx: 0, cy: 0, rx: 6, ry: 7.5, fill: "white", stroke: S.outline, strokeWidth: 1.5 }),
      renderPupil(),
      m("path", { d: "M -8 -5 Q 0 -8 8 -4", stroke: S.outline, strokeWidth: 3, fill: "none", strokeLinecap: "round" }), 
      m("path", { d: "M -9 -12 Q -4 -14 4 -12", stroke: S.outline, strokeWidth: 2, fill: "none", strokeLinecap: "round" }), 
      showBones && m("circle", { cx: px, cy: py, r: 2, fill: "#00ffcc" })
    ]),
    
    // 动态右眼
    m("g", { transform: `translate(11, -22.5) scale(1, ${currentPose.eyeR_ScaleY})` }, [
      m("ellipse", { cx: 0, cy: 0, rx: 6, ry: 7.5, fill: "white", stroke: S.outline, strokeWidth: 1.5 }),
      renderPupil(),
      m("path", { d: "M -8 -4 Q 0 -8 8 -5", stroke: S.outline, strokeWidth: 3, fill: "none", strokeLinecap: "round" }), 
      m("path", { d: "M -4 -12 Q 4 -14 9 -12", stroke: S.outline, strokeWidth: 2, fill: "none", strokeLinecap: "round" }), 
      showBones && m("circle", { cx: px, cy: py, r: 2, fill: "#00ffcc" })
    ]),
    
    // 动态嘴巴
    renderMouth(),
    showBones && m("circle", { cx: 0, cy: mouthY + clampedCurve, r: 3, fill: "#00ffcc" }),

    // 前发（120 根发丝与蓝黑双色挑染）
    ...generateHair(m, S, currentPose, true, showBones),

    // 动态飘动双股呆毛
    ...generateDynamicAhoge(m, S, currentPose, showBones),

    bone(-30)
  ];
};

// 上肢左臂组件（包含独立锁骨与手腕）
export const renderArmL = (m, S, currentPose, bone) => {
  return m("g", { transform: `translate(-18, -60) rotate(${currentPose.clavicleL_Angle || 0})` }, [
    m("g", { transform: `rotate(${currentPose.armL_upperAngle})` }, [
      m("use", { href: "#part_arm_upper" }),
      m("g", { transform: `translate(0, 36) rotate(${currentPose.armL_lowerAngle})` }, [
        m("use", { href: "#part_arm_lower" }),
        m("g", { transform: `translate(0, 40) rotate(${currentPose.wristL_Angle || 0})` }, [
          m("use", { href: "#part_hand" }),
          bone(10)
        ]),
        bone(40)
      ]),
      bone(36)
    ])
  ]);
};

// 上肢右臂组件（包含独立锁骨与手腕）
export const renderArmR = (m, S, currentPose, bone) => {
  return m("g", { transform: `translate(18, -60) rotate(${currentPose.clavicleR_Angle || 0})` }, [
    m("g", { transform: `rotate(${currentPose.armR_upperAngle})` }, [
      m("use", { href: "#part_arm_upper" }),
      m("g", { transform: `translate(0, 36) rotate(${currentPose.armR_lowerAngle})` }, [
        m("use", { href: "#part_arm_lower" }),
        m("g", { transform: `translate(0, 40) rotate(${currentPose.wristR_Angle || 0})` }, [
          m("use", { href: "#part_hand" }),
          bone(10)
        ]),
        bone(40)
      ]),
      bone(36)
    ])
  ]);
};

// 下肢左腿组件（包含独立脚踝）
export const renderLegL = (m, S, currentPose, bone) => {
  return m("g", { transform: `translate(-10, 0) rotate(${currentPose.legL_upperAngle})` }, [
    m("use", { href: "#part_leg_upper" }),
    m("g", { transform: `translate(0, 45) rotate(${currentPose.legL_lowerAngle})` }, [
      m("use", { href: "#part_leg_lower" }),
      m("g", { transform: `translate(0, 50) rotate(${currentPose.ankleL_Angle || 0})` }, [
        m("use", { href: "#part_foot" }),
        bone(8)
      ]),
      bone(50)
    ]),
    bone(45)
  ]);
};

// 下肢右腿组件（包含独立脚踝）
export const renderLegR = (m, S, currentPose, bone) => {
  return m("g", { transform: `translate(10, 0) rotate(${currentPose.legR_upperAngle})` }, [
    m("use", { href: "#part_leg_upper" }),
    m("g", { transform: `translate(0, 45) rotate(${currentPose.legR_lowerAngle})` }, [
      m("use", { href: "#part_leg_lower" }),
      m("g", { transform: `translate(0, 50) rotate(${currentPose.ankleR_Angle || 0})` }, [
        m("use", { href: "#part_foot" }),
        bone(8)
      ]),
      bone(50)
    ]),
    bone(45)
  ]);
};

// 动态物理线条衣服组件（高密度贝塞尔线，根据双臂运动角度产生力学拉伸，贴合手臂，无风吹效果）
export const generateThreadShirt = (m, S, currentPose, showBones) => {
  const strands = [];
  const num = 45; // 45根线条
  const chestAngle = currentPose.chestAngle || 0;
  const aL = ((currentPose.armL_upperAngle || 0) + chestAngle) * Math.PI / 180;
  const aR = ((currentPose.armR_upperAngle || 0) + chestAngle) * Math.PI / 180;

  for (let i = 0; i <= num; i++) {
    const t = i / num;
    
    // 肩膀宽度从 -21 到 21 (加宽版型)
    const sx = -21 + t * 42;
    
    // 肩部与领口弧度顶端坐标 (提升到原版 torso 的 -70 高度)
    const distToCenter = Math.abs(sx);
    let sy = -70;
    if (distToCenter < 10) {
      // 领口下凹
      const cFactor = 1 - (distToCenter / 10);
      sy = -70 + cFactor * 8; // V-neck center at -62
    } else {
      // 肩膀斜下坡
      const sFactor = (distToCenter - 10) / 10;
      sy = -70 - sFactor * 3;
    }

    // 默认下摆终点坐标 (下摆加宽，-24 到 24)
    let ex = -24 + t * 48;
    let ey = 0;
    if (distToCenter < 24) {
      const hFactor = 1 - (distToCenter / 24);
      ey = 0 + hFactor * 3;
    }

    // 计算局部的左右手臂运动偏移量 (仅影响边缘 40% 的线条，拉伸限制在更自然的 -6 到 6 之间)
    let dx = 0;
    let dy = 0;
    if (t < 0.4) {
      // 左侧受左手臂影响
      const leftFactor = Math.pow((0.4 - t) / 0.4, 2);
      dx = -Math.sin(aL) * 6 * leftFactor;
      dy = (Math.cos(aL) - 1) * 3 * leftFactor;
    } else if (t > 0.6) {
      // 右侧受右手臂影响
      const rightFactor = Math.pow((t - 0.6) / 0.4, 2);
      dx = -Math.sin(aR) * 6 * rightFactor;
      dy = (Math.cos(aR) - 1) * 3 * rightFactor;
    }

    // 最终应用手臂偏移量
    ex += dx;
    ey += dy;

    // 确定贝塞尔控制点 cx，使其在腰部收缩 (-14 到 14)，从而形成弧形无袖袖口
    const cx = (-14 + t * 28) + dx * 0.6;
    const cy = (sy + ey) / 2;

    // 左右两侧最外边缘线画为白色袖边，其余为渐变天蓝色线条
    let strokeColor = "#87CEEB"; 
    let strokeWidth = 2.2;
    let opacity = 0.95;

    if (i === 0 || i === num) {
      strokeColor = "#ffffff";
      strokeWidth = 3.5;
      opacity = 1.0;
    } else {
      if (i % 3 === 0) strokeColor = "#59c2f3"; 
      if (i % 3 === 1) strokeColor = "#b8e8ff"; 
    }
    
    strands.push(m("path", {
      d: `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`,
      fill: "none",
      stroke: strokeColor,
      strokeWidth: strokeWidth,
      strokeLinecap: "round",
      opacity: opacity
    }));
  }

  // 4. 绘制白色领口饰边
  strands.push(m("path", {
    d: "M -10 -70 Q 0 -62 10 -70",
    fill: "none",
    stroke: "#ffffff",
    strokeWidth: 3.5,
    strokeLinecap: "round"
  }));

  return strands;
};

