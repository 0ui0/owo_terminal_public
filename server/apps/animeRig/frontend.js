import animeRigData from "./animeRigData.js"
import { generateHair, renderFrontHead, renderArmL, renderArmR, renderLegL, renderLegR, preloadAllParts, renderSvgDefs, generateThreadShirt } from "./characterParts.js"

export default ({ appId, m, Notice, ioSocket, commonData, iconPark, getColor, Box }) => {
  let currentPose = {
    rootX: 0, rootY: 0, rootAngle: 0,
    spineAngle: 0, chestAngle: 0, neckAngle: 0,
    torsoAngle: 0, headAngle: 0,
    clavicleL_Angle: 0, clavicleR_Angle: 0,
    legL_upperAngle: 10, legL_lowerAngle: 0, ankleL_Angle: 0,
    legR_upperAngle: -10, legR_lowerAngle: 0, ankleR_Angle: 0,
    armL_upperAngle: 20, armL_lowerAngle: 0, wristL_Angle: 0, fingerL_Curl: 0.2,
    armR_upperAngle: -20, armR_lowerAngle: 0, wristR_Angle: 0, fingerR_Curl: 0.2,
    eyeL_ScaleY: 0.85, eyeR_ScaleY: 0.85, smileCurve: 3, blushOpacity: 0,
    pupilX: 0, pupilY: 0, pupilSize: 1.0, eyeType: "normal", mouthType: "calm"
  };
  let targetPose = { ...currentPose };
  let startPose = { ...currentPose };
  let animationStartTime = 0;
  let animationDuration = 400;
  let isAnimating = false;
  let showBones = false;
  let currentAction = "idle";
  let currentExpression = "normal";
  let revertTimer = null;
  let physicsLoopId = null;

  const physicsLoop = () => {
    // 持续触发视图重绘，维持基于时间 (performance.now()) 的物理算法运转
    m.redraw();
    physicsLoopId = requestAnimationFrame(physicsLoop);
  };

  const bone = (length) => showBones ? m("g", { style: { pointerEvents: "none" } }, [
    m("line", { x1: 0, y1: 0, x2: 0, y2: length, stroke: "#ff0044", strokeWidth: 3 }),
    m("circle", { cx: 0, cy: 0, r: 5, fill: "#00ffcc" }),
    m("circle", { cx: 0, cy: length, r: 5, fill: "#00ffcc" })
  ]) : null;

  // 1. 肢体动作库 (Body Actions)
  const defaultBodyProps = {
    rootX: 0, rootY: 0, rootAngle: 0,
    spineAngle: 0, chestAngle: 0, neckAngle: 0,
    torsoAngle: 0, headAngle: 0,
    clavicleL_Angle: 0, clavicleR_Angle: 0,
    legL_upperAngle: 10, legL_lowerAngle: 0, ankleL_Angle: 0,
    legR_upperAngle: -10, legR_lowerAngle: 0, ankleR_Angle: 0,
    armL_upperAngle: 20, armL_lowerAngle: 0, wristL_Angle: 0, fingerL_Curl: 0.2,
    armR_upperAngle: -20, armR_lowerAngle: 0, wristR_Angle: 0, fingerR_Curl: 0.2
  };

  const bodyActions = {
    idle: { ...defaultBodyProps },
    wave: {
      spineAngle: -2, chestAngle: -3, headAngle: -10,
      clavicleR_Angle: -20,
      legL_upperAngle: 10, legR_upperAngle: -10,
      armL_upperAngle: 20,
      armR_upperAngle: -140, armR_lowerAngle: -40, wristR_Angle: 30, fingerR_Curl: 0.0
    },
    walk: {
      spineAngle: 8, chestAngle: -5, neckAngle: -3, headAngle: -10, 
      legL_upperAngle: 30, legL_lowerAngle: 10, ankleL_Angle: -15,
      legR_upperAngle: -30, legR_lowerAngle: 10, ankleR_Angle: 15,
      armL_upperAngle: -30, armL_lowerAngle: -10, wristL_Angle: 15, fingerL_Curl: 0.6,
      armR_upperAngle: 30, armR_lowerAngle: -10, wristR_Angle: -15, fingerR_Curl: 0.6
    },
    run: {
      rootY: -15, spineAngle: 18, chestAngle: 5, neckAngle: -10, headAngle: -12,
      legL_upperAngle: 45, legL_lowerAngle: 30, ankleL_Angle: -20,
      legR_upperAngle: -45, legR_lowerAngle: 15, ankleR_Angle: 20,
      armL_upperAngle: -60, armL_lowerAngle: -40, fingerL_Curl: 0.8,
      armR_upperAngle: 60, armR_lowerAngle: -20, fingerR_Curl: 0.8
    },
    raiseHands: {
      rootY: -20, spineAngle: -5, chestAngle: -10, headAngle: -10,
      clavicleL_Angle: -15, clavicleR_Angle: -15,
      legL_upperAngle: 15, legR_upperAngle: -15,
      armL_upperAngle: -130, armL_lowerAngle: -30, wristL_Angle: -20, fingerL_Curl: 0.0,
      armR_upperAngle: -130, armR_lowerAngle: -30, wristR_Angle: 20, fingerR_Curl: 0.0
    },
    nod: {
      spineAngle: 5, chestAngle: 5, neckAngle: 10, headAngle: 12,
      legL_upperAngle: 10, legR_upperAngle: -10,
      armL_upperAngle: 20, armR_upperAngle: -20
    }
  };

  const actionLabels = {
    idle: "站立", wave: "挥手", walk: "走路", run: "奔跑", raiseHands: "举手", nod: "点头"
  };

  // 2. 面部表情库 (Facial Expressions)
  const defaultFacialProps = {
    eyeL_ScaleY: 1, eyeR_ScaleY: 1, smileCurve: 3, blushOpacity: 0,
    pupilX: 0, pupilY: 0, pupilSize: 1.0, eyeType: "normal", mouthType: "smile"
  };

  const facialExpressions = {
    normal: { ...defaultFacialProps, eyeL_ScaleY: 0.85, eyeR_ScaleY: 0.85, mouthType: "calm" },
    smile: {
      ...defaultFacialProps, eyeL_ScaleY: 1.0, eyeR_ScaleY: 1.0, smileCurve: 5, mouthType: "smile", blushOpacity: 0.3
    },
    happy: {
      eyeL_ScaleY: 0.1, eyeR_ScaleY: 0.1, smileCurve: 5, mouthType: "open", blushOpacity: 0.7
    },
    star: {
      eyeType: "star", pupilSize: 1.3, mouthType: "cat", blushOpacity: 0.9
    },
    angry: {
      pupilX: -2, pupilY: -1, pupilSize: 0.8, mouthType: "pout", blushOpacity: 0.4
    },
    shock: {
      pupilX: 0, pupilY: -1.5, pupilSize: 0.5, mouthType: "surprise", blushOpacity: 0
    },
    sad: {
      pupilX: 0, pupilY: 1.5, pupilSize: 1.1, mouthType: "pout", blushOpacity: 0.3
    },
    wink: {
      eyeL_ScaleY: 0.1, eyeR_ScaleY: 1.0, pupilX: 1.5, pupilY: 0, mouthType: "cat", blushOpacity: 0.8
    }
  };

  const expressionLabels = {
    normal: "平静🙂", smile: "微笑😊", happy: "大笑😄", star: "卖萌🌟", angry: "生气😠",
    shock: "震惊😮", sad: "委屈🥺", wink: "眨眼😉"
  };

  const updateAnimation = (time) => {
    let progress = (time - animationStartTime) / animationDuration;
    if (progress >= 1) {
      currentPose = { ...targetPose };
      isAnimating = false;
      m.redraw();

      // 仅针对单次触发的瞬态动作（如挥手、点头）延迟还原站立，且安全管理 revertTimer
      if (currentAction === "wave" || currentAction === "nod") {
        revertTimer = setTimeout(() => {
          playAction("idle");
        }, 1200);
      }
      return;
    }
    let eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
    for (let key in targetPose) {
      const startVal = startPose[key];
      const targetVal = targetPose[key];
      if (typeof targetVal === "number" && typeof startVal === "number") {
        currentPose[key] = startVal + (targetVal - startVal) * eased;
      } else {
        currentPose[key] = targetVal;
      }
    }
    m.redraw();
    requestAnimationFrame(updateAnimation);
  };

  // 核心封装：合成 targetPose 并启动动画（身体域与面部域正交，单参保持原行为，双参一次到位）
  const applyPose = (actionName, exprName) => {
    if (revertTimer) {
      clearTimeout(revertTimer);
      revertTimer = null;
    }
    const hasAction = actionName && bodyActions[actionName];
    const hasExpr = exprName && facialExpressions[exprName];
    if (!hasAction && !hasExpr) return false;

    if (hasAction) currentAction = actionName;
    if (hasExpr) currentExpression = exprName;

    startPose = { ...currentPose };
    targetPose = {
      ...currentPose,
      ...(hasAction ? { ...defaultBodyProps, ...bodyActions[actionName] } : {}),
      ...(hasExpr ? { ...defaultFacialProps, ...facialExpressions[exprName] } : {})
    };
    animationStartTime = performance.now();
    if (!isAnimating) {
      isAnimating = true;
      requestAnimationFrame(updateAnimation);
    }
    return true;
  };

  const playAction = (actionName) => {
    applyPose(actionName, undefined);
  };

  const playExpression = (exprName) => {
    applyPose(undefined, exprName);
  };

  const instanceInterface = {
    onDispatch: (msg, callback) => {
      if (msg.action === "playAction") {
        const args = msg.args || {}
        const name = args.actionName
        const exprName = args.expressionName
        // 双参数模式：一次调用同时设置动作+表情（复用 applyPose 合成，一次动画到位）
        if (exprName) {
          if (bodyActions[name] && facialExpressions[exprName]) {
            applyPose(name, exprName)
            if (callback) callback({ ok: true, msg: `动作+表情已执行: ${name} + ${exprName}` })
          } else {
            if (callback) callback({ ok: false, msg: `参数无效: actionName=${name} 需为肢体动作, expressionName=${exprName} 需为面部表情` })
          }
        } else if (bodyActions[name]) {
          playAction(name)
          if (callback) callback({ ok: true, msg: `动作已执行: ${name}` })
        } else if (facialExpressions[name]) {
          playExpression(name)
          if (callback) callback({ ok: true, msg: `表情已执行: ${name}` })
        } else {
          if (callback) callback({ ok: false, msg: `未知的动作或表情: ${name}` })
        }
      } else {
        if (callback) callback({ ok: false, msg: `不支持的操作: ${msg.action}` })
      }
    }
  }

  const init = () => {
    animeRigData.addTool("commonData", commonData)
    animeRigData.registerInstances(appId, instanceInterface)
    if (commonData.registerApp) commonData.registerApp(appId, animeRigData)
    preloadAllParts().then(() => {
      m.redraw();
      if (!physicsLoopId) physicsLoopId = requestAnimationFrame(physicsLoop);
    })
  }
  init()

  // Style constants for simple anime geometric styling
  const getStyles = () => {
    const alpha = showBones ? "77" : "FF"; // 50% opacity when bones are shown
    return {
      skin: "#FFDFC4" + alpha,
      clothes: "#87CEEB" + alpha,
      pants: "#333333" + alpha,
      outline: "#2c3e50" + alpha,
      hairBase: "#222222" + alpha,
      hairStreak: "#55b4e6" + alpha,
      eyeGold: "#d29d38" + alpha
    }
  }

  const buildSkeleton = () => {
    const S = getStyles();

    return m("svg", {
      width: "100%", height: "100%",
      style: { position: "absolute", top: 0, left: 0, pointerEvents: "none" }
    }, [
      renderSvgDefs(m),
      m("g", { style: { transform: `translate(50%, 50%) scale(1.5)` } }, [
        m("g", { transform: `translate(${currentPose.rootX}, ${currentPose.rootY}) rotate(${currentPose.rootAngle})` }, [
        
        // Leg L (Back)
        renderLegL(m, S, currentPose, bone),
        
        // Torso and FK Hierarchy (Split Neck and Arms to resolve layering conflicts)
        m("g", { transform: `rotate(${currentPose.spineAngle || 0})` }, [
          
          // 1. 颈部与头部组 (颈部在衣服后绘制)
          m("g", { transform: `translate(0, -30) rotate(${currentPose.chestAngle || 0}) translate(0, 30)` }, [
            m("g", { transform: `translate(0, -50) rotate(${currentPose.neckAngle || 0}) translate(0, 50)` }, [
              m("use", { href: "#part_neck" }),
              
              // 头部 (Head)
              m("g", { transform: `translate(0, -70) rotate(${currentPose.headAngle || 0}) translate(0, 70)` }, [
                m("g", { transform: `translate(0, -70)` }, [ ...generateHair(m, S, currentPose, false) ]),
                m("g", { transform: `translate(0, -70)` }, [ ...renderFrontHead(m, S, currentPose, showBones, bone) ])
              ])
            ])
          ]),

          // 2. 衣服组
          m("g", { transform: `rotate(${currentPose.torsoAngle || 0})` }, [
            ...generateThreadShirt(m, S, currentPose, showBones)
          ]),

          // 3. 手臂与锁骨组 (手臂在衣服前绘制)
          m("g", { transform: `translate(0, -30) rotate(${currentPose.chestAngle || 0}) translate(0, 30)` }, [
            // 锁骨 (Clavicles)
            showBones && m("line", { x1: 0, y1: -55, x2: -18, y2: -60, stroke: "#ff0044", strokeWidth: 3 }),
            showBones && m("line", { x1: 0, y1: -55, x2: 18, y2: -60, stroke: "#ff0044", strokeWidth: 3 }),

            // Arm L & Arm R
            renderArmL(m, S, currentPose, bone),
            renderArmR(m, S, currentPose, bone)
          ]),
          
          showBones && m("line", { x1: 0, y1: 0, x2: 0, y2: -30, stroke: "#ff0044", strokeWidth: 3 }),
          showBones && m("circle", { cx: 0, cy: -30, r: 5, fill: "#00ffcc" }),
          showBones && m("line", { x1: 0, y1: -30, x2: 0, y2: -50, stroke: "#ff0044", strokeWidth: 3 }),
          showBones && m("circle", { cx: 0, cy: -50, r: 5, fill: "#00ffcc" }),
          showBones && m("line", { x1: 0, y1: -50, x2: 0, y2: -70, stroke: "#ff0044", strokeWidth: 3 }),
          showBones && m("circle", { cx: 0, cy: -70, r: 5, fill: "#00ffcc" })
        ]),

        // Leg R (Front)
        renderLegR(m, S, currentPose, bone),

        bone(0)
      ])
      ])
    ])
  }

  return {
    onremove() { 
      animeRigData.unregisterInstances(appId, commonData);
      if (physicsLoopId) cancelAnimationFrame(physicsLoopId);
    },
    view(vnode) {
      return m("",
        {
          style: {
            width: "100%", height: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: getColor("gray_4").back,
            color: getColor("gray_4").front,
            overflow: "hidden"
          }
        },
        [
          m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                padding: "15px 15px 10px 15px",
                background: getColor("gray_3").back,
                boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
                zIndex: 10
              }
            },
            [
              m("",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }
                },
                [
                  m("",
                    {
                      style: {
                        fontWeight: "bold",
                        fontSize: "1.1rem"
                      }
                    },
                    "动作测试"
                  ),
                  m(Box,
                    {
                      color: showBones ? "pink_1" : "gray_5",
                      isBtn: true,
                      style: {
                        margin: 0,
                        padding: "0.4rem 0.8rem",
                        borderRadius: "1rem",
                        fontSize: "0.85rem"
                      },
                      ext: {
                        onclick: () => showBones = !showBones
                      }
                    },
                    showBones ? "隐藏骨骼" : "显示骨骼"
                  )
                ]
              ),
              // 动作与表情导航组
              m("",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  }
                },
                [
                  // 1. 动作控制行 (Motion Controls)
                  m("",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: "10px"
                      }
                    },
                    [
                      m("span", { style: { fontSize: "0.85rem", opacity: 0.7, flexShrink: 0, fontWeight: "bold" } }, "肢体动作:"),
                      m("",
                        {
                          style: {
                            display: "flex",
                            overflowX: "auto",
                            gap: "8px",
                            scrollbarWidth: "none",
                            msOverflowStyle: "none",
                            WebkitOverflowScrolling: "touch"
                          }
                        },
                        Object.keys(bodyActions).map(action => 
                          m(Box,
                            {
                              color: currentAction === action ? "main" : "gray_3",
                              isBtn: true,
                              style: {
                                margin: 0,
                                padding: "0.35rem 0.8rem",
                                borderRadius: "0.8rem",
                                fontSize: "0.85rem",
                                whiteSpace: "nowrap",
                                flexShrink: 0
                              },
                              ext: {
                                onclick: () => playAction(action)
                              }
                            },
                            actionLabels[action] || action
                          )
                        )
                      )
                    ]
                  ),

                  // 2. 表情控制行 (Facial Expressions Controls)
                  m("",
                    {
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: "10px"
                      }
                    },
                    [
                      m("span", { style: { fontSize: "0.85rem", opacity: 0.7, flexShrink: 0, fontWeight: "bold" } }, "面部表情:"),
                      m("",
                        {
                          style: {
                            display: "flex",
                            overflowX: "auto",
                            gap: "8px",
                            scrollbarWidth: "none",
                            msOverflowStyle: "none",
                            WebkitOverflowScrolling: "touch"
                          }
                        },
                        Object.keys(facialExpressions).map(expr => 
                          m(Box,
                            {
                              color: currentExpression === expr ? "pink_1" : "gray_3",
                              isBtn: true,
                              style: {
                                margin: 0,
                                padding: "0.35rem 0.8rem",
                                borderRadius: "0.8rem",
                                fontSize: "0.85rem",
                                whiteSpace: "nowrap",
                                flexShrink: 0
                              },
                              ext: {
                                onclick: () => playExpression(expr)
                              }
                            },
                            expressionLabels[expr] || expr
                          )
                        )
                      )
                    ]
                  )
                ]
              )
            ]
          ),
          m("",
            {
              style: {
                flex: 1,
                position: "relative"
              }
            },
            [
              buildSkeleton()
            ]
          )
        ]
      )
    }
  }
}
