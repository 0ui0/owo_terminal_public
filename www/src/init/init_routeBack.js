

export default function() {
  //路由历史
  return window.ROUTE = {
    lastRoute: "",
    routeHistory: [],
    scrollTopTable: {},
    set: function(path, ...args) {
      var doc;
      doc = document.body;
      //前往之前先存储当前
      this.lastRoute = m.route.get(); //记录当前路由
      this.routeHistory.push(this.lastRoute); //写入历史记录表
      this.scrollTopTable[this.lastRoute] = doc.scrollTop;
      //如果表里有即将前往的路由的滚动条高度
      if (this.scrollTopTable[path] >= 0) {
        m.route.set(path, ...args);
        //定位滚动条
        return setTimeout(() => {
          //doc.scrollTop = @scrollTopTable[path]
          doc.scrollTo({
            top: this.scrollTopTable[path],
            behavior: "smooth"
          });

          return m.redraw();
        }, 50);
      } else {
        m.route.set(path, ...args);
        doc.scrollTo({
          top: 0
        });

        return m.redraw();
      }
    },
    back: function() {
      if (this.routeHistory.length > 0) {
        
        //如果当前路由和历史记录最后一条相同，那么不再set
        this.set(this.routeHistory[this.routeHistory.length - 1]);
        this.routeHistory.splice(-1);
        return this.routeHistory.splice(-1); //删除最后2位，因为重复添加了一次
      } else {

      }
    }
  };
};
