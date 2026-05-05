import ConflictDialog from "./ConflictDialog.js";

export default {
  // 核心还原流程封装
  async run({ 
    items, 
    targetFolder, 
    currentPath, 
    appId, 
    m, 
    Notice, 
    Box, 
    settingData, 
    askConfirm 
  }) {
    let commonAction = null;
    let results = { success: [], fail: [] };

    for (const data of items) {
      const finalFolder = targetFolder || currentPath;
      
      const targetPath = finalFolder + '/' + data.name;
      const resCheck = await settingData.fnCall("appDispatch", [appId, "tmCheckConflicts", { hash: data.hash, relPath: data.relPath, name: data.name, targetPath, repoRoot: data.repoRoot }]);
      
      if (!resCheck.ok) { 
        results.fail.push(`${data.name} (冲突检测失败)`); 
        continue; 
      }
      
      const conflicts = resCheck.data?.data?.conflicts || [];
      const decisions = {};

      const executeRestore = async () => {
        const resExec = await settingData.fnCall("appDispatch", [appId, "tmExecuteRestore", { hash: data.hash, relPath: data.relPath, name: data.name, targetPath, decisions, repoRoot: data.repoRoot }]);
        if (resExec.ok) results.success.push(data.name);
        else results.fail.push(`${data.name}: ${resExec.data?.error || resExec.msg}`);
      };

      if (conflicts.length === 0 || (commonAction && conflicts.every(f => { decisions[f] = commonAction; return true; }))) {
        await executeRestore();
      } else {
        await new Promise((resolve) => {
          const askNext = (index) => {
            if (index >= conflicts.length) { executeRestore().then(resolve); return; }
            const fileName = conflicts[index];
            if (commonAction) { decisions[fileName] = commonAction; return askNext(index + 1); }
            
            const sign = "tm_conflict_" + Date.now() + "_" + index;
            Notice.launch({
              sign, width: 450,
              content: {
                view: (v) => m(ConflictDialog, {
                  m, Box,
                  title: "还原冲突",
                  fileName,
                  onDecision: (d) => { v.attrs.delete(); decisions[fileName] = d; askNext(index + 1); },
                  onGlobalDecision: (d) => { v.attrs.delete(); commonAction = d; decisions[fileName] = d; askNext(index + 1); },
                  onCancel: () => { v.attrs.delete(); resolve(); }
                })
              }
            });
          };
          askNext(0);
        });
      }
    }
    
    // 汇总报告
    if (results.success.length > 0 || results.fail.length > 0) {
      if (results.fail.length === 0) {
        Notice.launch({ msg: results.success.length === 1 ? `"${results.success[0]}" 还原成功喵！🕒` : `成功还原了 ${results.success.length} 个项目喵！🕒`, type: "success" });
      } else {
        Notice.launch({ 
          msg: `还原任务完成，但有 ${results.fail.length} 个失败。`, 
          type: "error",
          content: m("", {style:{maxHeight:"200px", overflowY:"auto", padding:"10px", background:"rgba(0,0,0,0.1)", borderRadius:"8px", fontSize:"0.8rem"}}, [
            m("div", {style:{fontWeight:"bold", marginBottom:"5px"}}, "失败详情:"),
            results.fail.map(f => m("div", {style:{color:"#ff4d4f"}}, `• ${f}`))
          ])
        });
      }
    }
  }
}
