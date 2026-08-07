import comData from '../../comData/comData.js'
import getColor from "../common/getColor.js"

export default () => {
  return {
    view({ attrs }) {
      const { chat } = attrs;

      const petFace = chat.ask?.content?.placeFace || "smile";


      return m("div", {
        style: {
          width: window.Mob ? "3rem" : "6rem",
          height: window.Mob ? "3rem" : "6rem",
          borderRadius: "50%",
          backgroundImage: chat.group !== "user" ? `url('./statics/petPkgs/${comData.data.get()?.defaultPet || "default"}/pet/${petFace}.png')` : null,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundColor: chat.group === "user" ? getColor('我方气泡背景色') : getColor('对方气泡背景色'),
          border: `0.15rem solid ${chat.group === "user" ? getColor('我方气泡高亮边框色') : getColor('对方气泡高亮边框色')}`,
          boxShadow: "0.1rem 0.1rem 0.6rem rgba(0,0,0,0.2)",
          margin: chat.group === "user" ? "1rem 1rem 1rem 0" : "1rem 0 1rem 1rem",
          flexShrink: 0,
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }
      }, [
        /*         chat.group === "user"
                  ? m("", {
                    style: {
                      fontSize: "1.5rem",
                      fontWeight: "bolder",
                      color: getColor("grey").front
                    }
                  }, "你")
                  : null */
      ]);

    }
  };
};
