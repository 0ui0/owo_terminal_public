
export default function () {
  var _bakPush;
  // 定义全局检测设备类型变量
  window.DEV = null;
  window.Mob = false;
  window.resizeFns = [];
  _bakPush = window.resizeFns.push;
  window.resizeFns.push = function (newItem) {
    var oldItem;
    if ((oldItem = window.resizeFns.find((item) => {
      return String(item) === String(newItem) && item !== newItem;
    })) !== -1) {
      window.resizeFns.splice(window.resizeFns.indexOf(oldItem), 1);
    }
    return _bakPush.bind(this)(newItem);
  };

  const fn = function () {
    var root;
    root = document.documentElement; //html元素 用于获取根元素的font-size
    window.pageWidth = window.innerWidth;
    window.DEV = pageWidth <= 700 ? "mobile" : ((700 < pageWidth && pageWidth <= 1024)) ? "tablet" : ((1024 < pageWidth && pageWidth <= 1215)) ? "desktop" : ((1215 < pageWidth && pageWidth <= 1500)) ? "wideScreen" : pageWidth > 1500 ? "fullHD" : void 0; //768
    if (window.DEV === "mobile") {
      window.Mob = true;
    } else {
      window.Mob = false;
    }
    switch (window.DEV) {
      case "mobile":
        return root.style["font-size"] = Math.ceil(root.clientWidth / (455 / 10)) + "px";
      case "wideScreen":
        return root.style["font-size"] = 11 + "px";
      case "fullHD":
        return root.style["font-size"] = 10 + "px";
      default:
        return root.style["font-size"] = 10 + "px";
    }
  };

  fn();

  window.addEventListener("resize", function () {
    fn();
    window.resizeFns.forEach((fn) => {
      if (fn) {
        return fn();
      }
    });
    return m.redraw();
  });
};
