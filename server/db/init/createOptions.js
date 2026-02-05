var hasProp = {}.hasOwnProperty;

import defaultOptions from "./defaultOptions.js";

export default async function(db) {
  /*
  await db.icat_options.sync 
    force:true
  */
  let fnToStr = function(fn) {
    let str = String(fn);
    return str;
  }

  for (let key in defaultOptions) {
    if (!hasProp.call(defaultOptions, key)) continue;
    let option = defaultOptions[key];

    let option2;
    option2 = {...option};
    //joi:fnToStr option.joi
    await db.models.tb_options.findOrCreate({
      where: {
        key: option2.key
      },
      defaults: option2
    })
  }

}
