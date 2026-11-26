/* PulseView.js - 社交脉冲参数设置页（纯前端自包含，严格内嵌 trs 国际化） */

import { GroupCard, InputRow } from "./FormWidgets.js";

/* 折叠状态（仅 UI 展示用） */
let showDoc = false;

/* 脉冲参数配置分组及说明（完全自包含于前端组件，不依赖后端下发元数据） */
const PULSE_SECTIONS = [
  {
    key: "limit",
    title: { cn: "限流", en: "Rate Limit" },
    items: [
      {
        key: "dailyGroupLimit",
        defaultVal: 160,
        label: { cn: "群组每日消息上限", en: "Daily Group Limit" },
        desc: { cn: "单个群每天最多回复多少条。达到上限后，当天即使被 @ 也不再回复（跨日自动重置）。", en: "Max replies per group per day. Once reached, the bot stays silent until next day." }
      },
      {
        key: "dailyUserLimit",
        defaultVal: 20,
        label: { cn: "个人每日消息上限", en: "Daily User Limit" },
        desc: { cn: "同一个用户每天最多能触发多少次回复。超出后 @ 它只会收到一句拒绝提示，不会真正调用模型。", en: "Max replies triggered by a single user per day." }
      },
      {
        key: "cooldownMs",
        defaultVal: 20000,
        label: { cn: "回复冷却时间(毫秒)", en: "Reply Cooldown (ms)" },
        desc: { cn: "两次回复之间至少要间隔多久（毫秒）。防止连续刷屏。", en: "Minimum gap between two replies, in milliseconds." }
      }
    ]
  },
  {
    key: "energy",
    title: { cn: "能量", en: "Energy" },
    items: [
      {
        key: "energyCost",
        defaultVal: 10,
        label: { cn: "回复消耗能量", en: "Reply Energy Cost" },
        desc: { cn: "每回复一次消耗多少能量。能量是它说话的主要成本。", en: "Energy consumed per reply." }
      },
      {
        key: "energyThreshold",
        defaultVal: 10,
        label: { cn: "回复能量门槛", en: "Energy Threshold" },
        desc: { cn: "能量低于这个值时就不再回复，相当于“省电模式”。", en: "Below this energy level, the bot stops replying." }
      },
      {
        key: "maxEnergy",
        defaultVal: 100,
        label: { cn: "能量槽上限", en: "Max Energy" },
        desc: { cn: "能量槽的天花板。无论是自然恢复还是聊天充能，都不会超过它。", en: "Maximum energy capacity." }
      },
      {
        key: "energyRegenPerHour",
        defaultVal: 20,
        label: { cn: "每小时自然恢复能量", en: "Energy Regen / Hour" },
        desc: { cn: "不管群里有没有人说话，能量都随时间自动回升，这里填每小时恢复多少。", en: "Passive energy regeneration per hour." }
      }
    ]
  },
  {
    key: "attention",
    title: { cn: "注意力", en: "Attention" },
    items: [
      {
        key: "activeWindowMs",
        defaultVal: 300000,
        label: { cn: "活跃窗口时长(毫秒)", en: "Active Window (ms)" },
        desc: { cn: "被 @ 或喊到名字后，接下来这段时间内它会主动参与群聊（不需要每次再 @）。单位毫秒。", en: "After being mentioned, the bot stays in an active window for this long (ms)." }
      },
      {
        key: "excitementAdd",
        defaultVal: 0.05,
        label: { cn: "每条消息增加兴奋度", en: "Excitement Per Message" },
        desc: { cn: "群里每来一条消息，兴奋度就涨一点（上限 1.0）。聊得越热闹，它越想插嘴。兴奋度会随时间自动衰减。", en: "Excitement gained per group message, capped at 1.0, decays over time." }
      },
      {
        key: "passiveProbMax",
        defaultVal: 0.05,
        label: { cn: "最大插嘴概率", en: "Max Interject Probability" },
        desc: { cn: "没被 @ 时主动插嘴的概率上限。实际概率 = 兴奋度 × 该值，所以只有群里聊得很热闹时才会偶尔插一句话。", en: "Upper bound of interjection probability when not mentioned (excitement x this value)." }
      }
    ]
  },
  {
    key: "charge",
    title: { cn: "充能", en: "Charge" },
    items: [
      {
        key: "chargePerMsg",
        defaultVal: 0.5,
        label: { cn: "单条消息充能", en: "Charge Per Message" },
        desc: { cn: "群里每来一条消息，给机器人补充多少能量（社交充电）。", en: "Energy gained per incoming group message." }
      },
      {
        key: "chargeUserDailyMax",
        defaultVal: 5,
        label: { cn: "单人每日充能上限", en: "User Daily Charge Max" },
        desc: { cn: "同一个用户每天最多能贡献多少充能，防止一个人刷屏把电池充满。", en: "Daily charge cap contributed by a single user." }
      },
      {
        key: "chargeGroupDailyMax",
        defaultVal: 50,
        label: { cn: "全群每日充能总上限", en: "Group Daily Charge Max" },
        desc: { cn: "整个群每天通过聊天能补充的能量总量上限。", en: "Daily total charge cap for the whole group." }
      }
    ]
  }
];

export default {
  view: (vnode) => {
    const { m, Box, Tag, getColor, trs, draft, editKey, onChange, onResetPulse } = vnode.attrs;

    /* 写入草稿：只收集被修改过的键，未修改的保持缺席以跟随默认值 */
    const setPulse = (key, raw) => {
      const num = Number(raw);
      draft.pulseConfig = { ...(draft.pulseConfig || {}), [key]: Number.isFinite(num) ? num : 0 };
      onChange();
    };

    /* 当前值：存档优先，缺失回落默认 */
    const pulseValue = (item) => {
      const saved = draft.pulseConfig || {};
      if (saved[item.key] !== undefined && saved[item.key] !== null && saved[item.key] !== "") {
        return saved[item.key];
      }
      return item.defaultVal;
    };

    /* 参数说明文档面板 */
    const docPanel = [
      m(Box,
        {
          isBtn: true,
          color: showDoc ? "main" : "gray_4",
          style: {
            textAlign: "center",
            margin: "0.5rem",
            padding: "0.8rem",
            fontSize: "1.3rem"
          },
          onclick: () => {
            showDoc = !showDoc;
            m.redraw();
          }
        },
        showDoc
          ? trs("QQBot/脉冲/收起说明", { cn: "收起参数说明", en: "Hide Parameter Guide" })
          : trs("QQBot/脉冲/展开说明", { cn: "展开参数说明（这些值到底是干什么用的）", en: "Show Parameter Guide" })
      ),
      showDoc ? m(Box,
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
            margin: "0.5rem",
            padding: "1.2rem",
            borderRadius: "1.5rem"
          }
        },
        [
          m("div",
            {
              style: {
                fontSize: "1.2rem",
                opacity: "0.7",
                lineHeight: "2rem"
              }
            },
            trs("QQBot/脉冲/说明导语", {
              cn: "这 13 个参数共同决定：机器人什么时候愿意说话、能说多少、以及它的“社交电量”怎么攒、怎么花。下面按分组逐一解释。",
              en: "These 13 parameters decide when the bot speaks, how much it speaks, and how its social energy is earned and spent."
            })
          ),

          ...PULSE_SECTIONS.map(section => m("",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
                marginTop: "0.6rem"
              }
            },
            [
              m("div",
                {
                  style: {
                    fontSize: "1.4rem"
                  }
                },
                trs(`QQBot/脉冲分组/${section.key}`, section.title)
              ),
              ...section.items.map(item => m("div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.2rem",
                    paddingLeft: "1.2rem"
                  }
                },
                [
                  m("div",
                    {
                      style: {
                        fontSize: "1.3rem"
                      }
                    },
                    trs(`QQBot/脉冲项/${item.key}`, {
                      cn: `${item.label.cn}（默认 ${item.defaultVal}）`,
                      en: `${item.label.en} (default ${item.defaultVal})`
                    })
                  ),
                  m("div",
                    {
                      style: {
                        fontSize: "1.2rem",
                        opacity: "0.7",
                        lineHeight: "1.8rem"
                      }
                    },
                    trs(`QQBot/脉冲说明/${item.key}`, item.desc)
                  )
                ]
              ))
            ]
          )),

          m("div",
            {
              style: {
                fontSize: "1.4rem",
                marginTop: "0.8rem"
              }
            },
            trs("QQBot/脉冲/判定顺序标题", { cn: "每次收到消息，它会依次判断：", en: "On every message, the bot checks in order:" })
          ),
          m("div",
            {
              style: {
                fontSize: "1.2rem",
                opacity: "0.7",
                lineHeight: "1.8rem",
                paddingLeft: "1.2rem"
              }
            },
            trs("QQBot/脉冲/判定顺序内容", {
              cn: "① 是否正在思考（思考中直接跳过） ② 本群今日额度是否用完 ③ 该用户今日额度是否用完 ④ 是否还在冷却期 ⑤ 能量是否达到门槛 ⑥ 最终：被 @ → 一定回复；在活跃窗口内 → 回复；否则按「兴奋度 × 最大插嘴概率」掷骰子决定要不要插话。\n以上所有「每日」计数都会在跨日时自动归零。",
              en: "(1) still thinking? skip. (2) group daily quota reached? (3) user daily quota reached? (4) cooldown active? (5) energy below threshold? (6) Finally: mentioned -> always reply; inside active window -> reply; otherwise roll dice with excitement x interjection probability.\nAll daily counters reset automatically on a new day."
            })
          )
        ]
      ) : null
    ];

    return m("",
      {
        style: {
          display: "flex",
          flexDirection: "column"
        }
      },
      [
        ...docPanel,

        ...PULSE_SECTIONS.map(section => m(GroupCard,
          {
            m,
            Box,
            getColor,
            trs,
            title: trs(`QQBot/脉冲分组/${section.key}`, section.title)
          },
          section.items.map(item => m(InputRow,
            {
              key: item.key,
              m,
              Box,
              trs,
              editKey,
              label: trs(`QQBot/脉冲项/${item.key}`, item.label),
              value: pulseValue(item),
              onInput: (text) => setPulse(item.key, text)
            }
          ))
        )),

        m(Box,
          {
            isBtn: true,
            color: "gray_4",
            style: {
              textAlign: "center",
              margin: "0.5rem",
              padding: "0.8rem"
            },
            onclick: () => onResetPulse()
          },
          trs("QQBot/脉冲/恢复默认", { cn: "恢复默认参数", en: "Restore Defaults" })
        )
      ]
    );
  }
};
