import data from "./svgEditor/svgEditor_data.js"
import Paper from "./svgEditor/svgEditor_paper.js"
import ToolBar from "./svgEditor/svgEditor_toolBar.js"
import TopBar from "./svgEditor/svgEditor_topBar.js"
import tools from "./tools.js"

// 导入 AI 几何解析类与工具依赖
import svgElement from "./svgEditor/svgEditor_element.js"
import Rect from "./svgEditor/svgEditor_rect.js"
import Ellipse from "./svgEditor/svgEditor_ellipse.js"
import BucketTool from "./svgEditor/class/bucketTool.js"
import splitBezier from "./svgEditor/tools/splitBezier/main.js"
import svgText from "./svgEditor/svgEditor_text.js"
import svgGroup from "./svgEditor/svgEditor_group.js"
import svgParser from "./svgEditor/tools/svgEditor_svgParser.js"
import SvgSerializer from "./svgEditor/svgEditor_serialize.js"

export default ({ appId, m, Notice, Box, Tag, getColor, Tip, Menu, commonData, trs, settingData, uuid, format }) => {

  Object.assign(tools, { appId, m, Notice, Box, Tag, getColor, Tip, Menu, commonData, trs, settingData, uuid, format });

  data.initRightMenu(Menu);

  const instanceInterface = {
    onDispatch(msg, callback) {
      const trackerId = msg.trackerId;
      const done = async (res) => {
        if (trackerId) {
          try {
            await tools.settingData.fnCall("browserDispatchResponse", [trackerId, res]);
          } catch (err) {
            console.error("【svgEditor】回传 Tracker 结果失败:", err);
          }
        }
        if (typeof callback === 'function') callback(res);
      };

      try {
        if (msg.action === "screenshot") {
          let gridGroup = null
          let svgDom = null
          try {
            svgDom = document.getElementById("svg-paper")
            if (!svgDom) {
              done({ ok: false, msg: "未找到画板 svg 节点" })
              return
            }

            if (msg.args && msg.args.useGrid) {
              gridGroup = document.createElementNS("http://www.w3.org/2000/svg", "g")
              gridGroup.setAttribute("id", "ai-screenshot-grid")

              const step = 50
              const w = svgDom.clientWidth || 800
              const h = svgDom.clientHeight || 600

              for (let x = step; x < w; x += step) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
                line.setAttribute("x1", x)
                line.setAttribute("y1", 0)
                line.setAttribute("x2", x)
                line.setAttribute("y2", h)
                line.setAttribute("stroke", "rgba(180, 180, 180, 0.3)")
                line.setAttribute("stroke-width", "1")
                gridGroup.appendChild(line)

                const text = document.createElementNS("http://www.w3.org/2000/svg", "text")
                text.setAttribute("x", x + 3)
                text.setAttribute("y", 12)
                text.setAttribute("fill", "rgba(80, 80, 80, 0.7)")
                text.setAttribute("font-size", "12")
                text.setAttribute("font-family", "monospace")
                text.textContent = x.toString()
                gridGroup.appendChild(text)
              }

              for (let y = step; y < h; y += step) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
                line.setAttribute("x1", 0)
                line.setAttribute("y1", y)
                line.setAttribute("x2", w)
                line.setAttribute("y2", y)
                line.setAttribute("stroke", "rgba(180, 180, 180, 0.3)")
                line.setAttribute("stroke-width", "1")
                gridGroup.appendChild(line)

                const text = document.createElementNS("http://www.w3.org/2000/svg", "text")
                text.setAttribute("x", 3)
                text.setAttribute("y", y - 3)
                text.setAttribute("fill", "rgba(80, 80, 80, 0.7)")
                text.setAttribute("font-size", "12")
                text.setAttribute("font-family", "monospace")
                text.textContent = y.toString()
                gridGroup.appendChild(text)
              }

              const axis = document.createElementNS("http://www.w3.org/2000/svg", "path")
              axis.setAttribute("d", `M 0 0 L ${w} 0 M 0 0 L 0 ${h}`)
              axis.setAttribute("stroke", "rgba(255, 0, 0, 0.5)")
              axis.setAttribute("stroke-width", "2")
              gridGroup.appendChild(axis)

              svgDom.appendChild(gridGroup)
            }

            const svgString = new XMLSerializer().serializeToString(svgDom)

            done({
              ok: true,
              msg: "获取 SVG 源码成功",
              svg: svgString,
              width: svgDom.clientWidth || 800,
              height: svgDom.clientHeight || 600
            })
          } catch (err) {
            console.error("【svgEditor】获取 SVG 异常:", err)
            done({ ok: false, msg: "导出序列化失败: " + err.message })
          }
          if (gridGroup && svgDom) {
            try { svgDom.removeChild(gridGroup) } catch (e) { }
          }
        } else if (msg.action === "getSvg") {
          try {
            const svgDom = document.getElementById("svg-paper");
            if (!svgDom) {
              done({ ok: false, msg: "未找到 svg-paper 节点" });
              return;
            }
            done({
              ok: true,
              msg: "获取 SVG 源码成功",
              data: svgDom.outerHTML
            });
          } catch (err) {
            console.error("【svgEditor】获取 SVG 源码异常:", err);
            done({ ok: false, msg: "获取 SVG 源码失败: " + err.message });
          }
        } else if (msg.action === "getElements") {
          try {
            const { elementId, groupId, recursive } = msg.args || {};

            // ── 模式一：按 elementId 精确查询单个图元（完整序列化，含控制点） ──
            if (elementId) {
              const el = data.elPaper.elements.find(e => e.id === elementId);
              if (!el) {
                done({ ok: false, msg: `找不到 id 为 "${elementId}" 的图元` });
                return;
              }
              const serialized = SvgSerializer.serializeElements([el]);
              done({ ok: true, msg: "获取图元详情成功", data: serialized });
              return;
            }

            // ── 模式二/三：列举当前层（顶层或指定组的直接子元素） ──
            let parentGroupEl = null;
            if (groupId) {
              parentGroupEl = data.elPaper.elements.find(e => e.id === groupId && e.type === "group");
              if (!parentGroupEl) {
                done({ ok: false, msg: `找不到 id 为 "${groupId}" 的组` });
                return;
              }
            }

            // 按画布全局数组顺序过滤，排除 fillGroup（内部辅助类型，非业务图元）
            // 排序规则与 svgEditor_paper.coffee 渲染逻辑一致：
            //   非 group 先渲染（底层，layerIndex 小），group 后渲染（顶层，layerIndex 大）
            //   同分类内保持全局数组原始相对顺序（V8 sort 稳定性保证）
            const layerEls = data.elPaper.elements
              .filter(el => {
                if (el.type === "fillGroup") return false;
                if (groupId) return el.prop?.parentGroup === parentGroupEl;
                return !el.prop?.parentGroup;
              })
              .sort((a, b) => {
                const aIsGroup = a.type === "group" ? 1 : 0;
                const bIsGroup = b.type === "group" ? 1 : 0;
                return aIsGroup - bIsGroup;
              });

            // recursive=true：交给 SvgSerializer 完整展开（递归展开子组，含控制点）
            if (recursive) {
              const serialized = SvgSerializer.serializeElements(layerEls);
              done({ ok: true, msg: "获取图元列表成功（递归展开）", data: serialized });
              return;
            }

            // 浅层脱水：prop 中的对象/数组深拷贝，关系引用字段只转为 ID，不展开内部
            const SKIP_KEYS = new Set(["fillGroups", "fillGroupInners", "parentGroup", "elements", "childRegions", "pureFill"]);

            const result = layerEls.map((el, idx) => {
              const node = {
                layerIndex: idx,
                id: el.id,
                type: el.type,
                isClosed: el.isClosed ?? null,
                isActive: el.isActive ?? null,
                prop: {}
              };

              for (const [k, v] of Object.entries(el.prop || {})) {
                if (SKIP_KEYS.has(k)) continue;
                if (Array.isArray(v) || (typeof v === "object" && v !== null)) {
                  node.prop[k] = JSON.parse(JSON.stringify(v));
                } else {
                  node.prop[k] = v;
                }
              }

              if (el.prop?.parentGroup)      node.prop.parentGroup      = el.prop.parentGroup.id;
              if (el.prop?.elements)         node.prop.elements         = el.prop.elements.map(c => c.id);
              if (el.prop?.fillGroups)       node.prop.fillGroups       = el.prop.fillGroups.map(fg => fg.id);
              if (el.prop?.fillGroupInners)  node.prop.fillGroupInners  = el.prop.fillGroupInners.map(fg => fg.id);
              if (el.prop?.pureFill)         node.prop.pureFill         = el.prop.pureFill.id;
              if (el.prop?.childRegions)     node.prop.childRegions     = el.prop.childRegions.map(r => r.map(c => c.id));

              return node;
            });

            done({ ok: true, msg: "获取图元列表成功", data: result });
          } catch (err) {
            console.error("【svgEditor】获取图元列表失败:", err);
            done({ ok: false, msg: "获取图元列表失败: " + err.message });
          }
        } else if (msg.action === "draw") {
          try {
            const elements = msg.args.elements || [];
            const newElements = [];

            elements.forEach(el => {
              if (el.type === "line") {
                const newEl = new svgElement({
                  type: "line",
                  prop: {
                    name: el.name || "",
                    points: el.points || [],
                    fillGroups: [],
                    fillGroupInners: [],
                    parentGroup: data.presentGroup || null
                  }
                });
                data.elPaper.add(newEl);
                newElements.push(newEl);
              } else if (el.type === "rect") {
                const rectInstance = new Rect({
                  name: el.name || "",
                  x: el.x || 0,
                  y: el.y || 0,
                  w: el.w || 0,
                  h: el.h || 0
                });
                rectInstance.getElements().forEach(subEl => {
                  data.elPaper.add(subEl);
                  newElements.push(subEl);
                });
              } else if (el.type === "ellipse") {
                const ellipseInstance = new Ellipse({
                  name: el.name || "",
                  x: el.x || 0,
                  y: el.y || 0,
                  rx: el.rx || 0,
                  ry: el.ry || 0
                });
                ellipseInstance.getElements().forEach(subEl => {
                  data.elPaper.add(subEl);
                  newElements.push(subEl);
                });
              }
            });

            data.elPaper.elements.forEach(el => { el.isChoised = newElements.includes(el); });
            m.redraw();
            done({
              ok: true,
              msg: `成功批量绘制了 ${elements.length} 个几何图形`,
              elementIds: newElements.map(el => el.id)
            });
          } catch (err) {
            console.error("【svgEditor】批量绘制失败:", err);
            done({ ok: false, msg: "批量绘制失败: " + err.message });
          }
        } else if (msg.action === "drawText") {
          try {
            const texts = msg.args.texts || [];
            const newElements = [];

            texts.forEach(item => {
              const textGroup = new svgGroup({
                prop: {
                  name: item.name || "",
                  parentGroup: data.presentGroup || null,
                  elements: []
                }
              });
              data.elPaper.add(textGroup);

              const newEl = new svgText({
                prop: {
                  name: item.name || "",
                  text: item.text || "",
                  x: item.x || 0,
                  y: item.y || 0,
                  fontSize: item.fontSize || 24,
                  color: item.color || "#000000",
                  mode: item.mode || "svg",
                  parentGroup: textGroup
                }
              });
              data.elPaper.add(newEl);
              newElements.push(textGroup);
            });

            data.elPaper.elements.forEach(el => { el.isChoised = newElements.includes(el); });
            m.redraw();
            done({
              ok: true,
              msg: `成功添加了 ${texts.length} 个文本`,
              elementIds: newElements.map(el => el.id)
            });
          } catch (err) {
            console.error("【svgEditor】添加文本失败:", err);
            done({ ok: false, msg: "添加文本失败: " + err.message });
          }
        } else if (msg.action === "drawSvg") {
          try {
            const svgString = msg.args.svgString;
            if (!svgString) throw new Error("缺少 svgString 参数");

            // 先清空之前的选中状态
            data.elPaper.elements.forEach(el => { el.isChoised = false; });
            // 调用解析器，它会自动把新产生的根 Group 设为 isChoised
            svgParser.parse(svgString, data.presentGroup);

            m.redraw();
            done({ ok: true, msg: "成功解析并导入 SVG" });
          } catch (err) {
            console.error("【svgEditor】导入 SVG 失败:", err);
            done({ ok: false, msg: "导入 SVG 失败: " + err.message });
          }
        } else if (msg.action === "group") {
          try {
            if (msg.args.elementIds && Array.isArray(msg.args.elementIds) && msg.args.elementIds.length > 0) {
              data.elPaper.elements.forEach(el => {
                el.isChoised = msg.args.elementIds.includes(el.id);
              });
            }
            if (data.elPaper.getChoisedElements().length > 0) {
              data.elPaper.becomeGroup(msg.args.name || "");
              m.redraw();
              done({ ok: true, msg: "成功将选中元素编组" });
            } else {
              done({ ok: false, msg: "编组失败：没有选中任何可以编组的元素" });
            }
          } catch (err) {
            console.error("【svgEditor】编组失败:", err);
            done({ ok: false, msg: "编组失败: " + err.message });
          }
        } else if (msg.action === "ungroup") {
          try {
            if (msg.args.elementIds && Array.isArray(msg.args.elementIds) && msg.args.elementIds.length > 0) {
              data.elPaper.elements.forEach(el => {
                el.isChoised = msg.args.elementIds.includes(el.id);
              });
            }
            if (data.elPaper.getChoisedElements().some(el => el.type === "group")) {
              data.elPaper.exitGroup();
              m.redraw();
              done({ ok: true, msg: "成功打散选中群组" });
            } else {
              done({ ok: false, msg: "打散失败：未选中任何群组对象" });
            }
          } catch (err) {
            console.error("【svgEditor】打散失败:", err);
            done({ ok: false, msg: "打散失败: " + err.message });
          }
        } else if (msg.action === "layer") {
          try {
            const { id, action, index } = msg.args || {};
            const targetEl = data.elPaper.elements.find(el => el.id === id);
            if (!targetEl) {
              done({ ok: false, msg: `调整层级失败：未找到 ID 为 "${id}" 的元素` });
              return;
            }

            if (targetEl.type !== "group") {
              done({ ok: false, msg: `调整组层级失败：目标对象 (ID: ${id}) 不是编组 Group。画布层级规则永远是 组 > 普通元素，且只有组支持调整层级，请先调用 svgEditorGroup 对其进行编组！` });
              return;
            }

            data.elPaper.elements.forEach(el => { el.isChoised = (el === targetEl); });

            if (action === "up") {
              data.elPaper.layerUpChoisedElements();
            } else if (action === "down") {
              data.elPaper.layerDownChoisedElements();
            } else if (action === "set" || typeof index === "number") {
              const targetIndex = typeof index === "number" ? index : 0;
              const parentGroup = targetEl.prop?.parentGroup;
              
              const siblings = data.elPaper.elements.filter(el => 
                el.type === targetEl.type && (el.prop?.parentGroup === parentGroup)
              );

              const currentSiblingIndex = siblings.indexOf(targetEl);
              if (currentSiblingIndex !== -1) {
                const clampedIndex = Math.max(0, Math.min(targetIndex, siblings.length - 1));
                const destSibling = siblings[clampedIndex];
                if (destSibling && destSibling !== targetEl) {
                  const oldGlobalIdx = data.elPaper.elements.indexOf(targetEl);
                  data.elPaper.elements.splice(oldGlobalIdx, 1);
                  const newGlobalIdx = data.elPaper.elements.indexOf(destSibling);
                  data.elPaper.elements.splice(newGlobalIdx, 0, targetEl);
                }
              }
            }

            data.record("调整层级");
            m.redraw();

            const layers = data.elPaper.elements
              .filter(el => !el.prop?.parentGroup)
              .map((el, idx) => ({
                index: idx,
                id: el.id,
                name: el.prop?.name || "",
                type: el.type,
                isTarget: el.id === targetEl.id
              }));

            const finalSiblingIdx = data.elPaper.elements
              .filter(el => el.type === targetEl.type && el.prop?.parentGroup === targetEl.prop?.parentGroup)
              .indexOf(targetEl);

            done({
              ok: true,
              msg: `成功调整图层层级，当前目标在同级中的位置 index 为 ${finalSiblingIdx}`,
              data: {
                targetId: targetEl.id,
                siblingIndex: finalSiblingIdx,
                topLevelLayers: layers
              }
            });
          } catch (err) {
            console.error("【svgEditor】调整图层层级失败:", err);
            done({ ok: false, msg: "调整图层层级失败: " + err.message });
          }
        } else if (msg.action === "split") {
          try {
            splitBezier.splitPaper();
            m.redraw();
            done({
              ok: true,
              msg: "成功对画板中相交的线段进行了交叉切割（分割为独立图元）"
            });
          } catch (err) {
            console.error("【svgEditor】交叉切割失败:", err);
            done({ ok: false, msg: "交叉切割失败: " + err.message });
          }
        } else if (msg.action === "fill") {
          try {
            const { x, y, color, gapTolerance } = msg.args;
            const bucket = data.bucketTool || new BucketTool();
            if (gapTolerance !== undefined && gapTolerance !== null) {
              bucket.gapTolerance = gapTolerance;
            }
            bucket.findRegions(data.elPaper.getLines(), { x, y });
            if (bucket.presentRegions.length === 0) {
              done({ ok: false, msg: "未找到闭合多边形区域，请确保填充点位于封闭空间内。" });
              return;
            }
            bucket.fill(null, color);
            splitBezier.splitPaper();
            m.redraw();
            const region = bucket.presentRegions[0];
            done({
              ok: true,
              msg: `区域填充成功：颜色${color}，边界${region.elements.length}条线` +
                (region.children && region.children.length ? `，含${region.children.length}个子区域` : "")
            });
          } catch (err) {
            console.error("【svgEditor】区域填充失败:", err);
            done({ ok: false, msg: "填充失败: " + err.message });
          }
        } else if (msg.action === "edit") {
          try {
            const { id } = msg.args;
            const el = data.elPaper.elements.find(e => e.id === id);
            if (!el) {
              done({ ok: false, msg: "未找到目标图元对象" });
              return;
            }

            if (msg.args.name !== undefined) {
              el.prop.name = msg.args.name;
            }

            if (msg.args.points) {
              el.prop.points = msg.args.points;
            }

            if (msg.args.fill) {
              el.prop.fill = msg.args.fill;
              if (el.prop.pureFill) {
                el.prop.pureFill.prop.fill = msg.args.fill;
              }
            }

            if (msg.args.delete) {
              if (el.prop && el.prop.fillGroups) {
                el.prop.fillGroups.forEach(fg => {
                  if (fg.prop && fg.prop.pureFill) {
                    data.elPaper.remove(fg.prop.pureFill);
                  }
                  if (typeof fg.break === "function") {
                    fg.break();
                  }
                  data.elPaper.remove(fg);
                });
              } else if (typeof el.break === "function") {
                if (el.prop && el.prop.pureFill) {
                  data.elPaper.remove(el.prop.pureFill);
                }
                el.break();
              }
              data.elPaper.remove(el);
            }

            if (msg.args.points || msg.args.delete) {
              data.elPaper.elements.forEach(el => { el.isChoised = false })
              splitBezier.splitPaper();
            }

            m.redraw();
            done({
              ok: true,
              msg: "对象修改编辑成功"
            });
          } catch (err) {
            console.error("【svgEditor】单体图元编辑失败:", err);
            done({ ok: false, msg: "编辑失败: " + err.message });
          }
        } else {
          done({ ok: false, msg: "未知的 AI 操控指令" });
        }
      } catch (globalErr) {
        console.error("【svgEditor】onDispatch 发生致命错误:", globalErr);
        done({ ok: false, msg: "系统内部错误: " + globalErr.message });
      }
    }
  };

  data.instances = data.instances || new Map();
  data.registerInstances = data.registerInstances || function (id, inst) {
    this.instances.set(id, inst);
  };
  data.unregisterInstances = data.unregisterInstances || function (id, comm) {
    this.instances.delete(id);
    if (comm?.unregisterApp) comm.unregisterApp(id);
  };
  data.onDispatch = data.onDispatch || function (msg, callback) {
    const instance = this.instances.get(msg.appId);
    if (instance && instance.onDispatch) {
      instance.onDispatch(msg, callback);
    } else {
      if (callback) callback({ ok: false, msg: "未找到运行中的 App 实例" });
    }
  };

  data.registerInstances(appId, instanceInterface);
  if (commonData.registerApp) {
    commonData.registerApp(appId, data);
  }

  return {
    onremove() {
      data.unregisterInstances(appId, commonData);
    },
    view() {
      try {
        const result = m("",
          {
            style: {
              width: "100%",
              height: "100%",
              position: "relative",
              overflow: "hidden"
            },
          },
          [
            m(Paper, { Box, Tag }),
            m(TopBar, { Box, Tag }),
            m(ToolBar, { Box, Tip }),

            data.RightMenu ? m(data.RightMenu,
              {
                atcreate: (dom) => {
                  data.RightMenu.dom = dom
                },
                show: false,
                style: {
                  position: "absolute",
                  top: data.rightMenuTop - 20 + "px",
                  left: data.rightMenuLeft - 20 + "px",
                  zIndex: 99999,
                  transition: "all 0.5s ease"
                }
              },
              [
                (data.RightMenu.data && data.RightMenu.data.items) ? data.RightMenu.data.items.map((item) =>
                  m(Box,
                    {
                      isBtn: true,
                      ext: {
                        onclick: (e) => {
                          item.click(e)
                          m.redraw()
                        }
                      }
                    },
                    item.name
                  )
                ) : []
              ]
            ) : null
          ]
        );

        return result;
      } catch (err) {
        console.error("【DEBUG - svgEditor】view() 渲染时发生致命错误:", err);
        throw err;
      }
    }
  }
}
