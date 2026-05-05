export default {
  formatDate: (ms) => {
    if (!ms) return "-";
    const d = new Date(ms);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  },

  formatSize: (b, item) => {
    if (item?.isDirectory || b === undefined || isNaN(b)) return "-";
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  },

  renderHighlightedText: (m, text, matches) => {
    if (!matches?.length) return text;
    let res = [], last = 0;
    matches.forEach(mIdx => { 
      res.push(text.slice(last, mIdx.start)); 
      res.push(m("span", { style: { background: "#ffd700", color: "#000" } }, text.slice(mIdx.start, mIdx.end))); 
      last = mIdx.end; 
    });
    res.push(text.slice(last)); 
    return res;
  }
}
