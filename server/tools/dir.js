import pathLib from "path"
import fs from "fs/promises"
export default class Dir {
  constructor(rootStr){
    this.root = pathLib.resolve(rootStr)
  }
  cd(path){
    this.root = pathLib.resolve(this.root,path)
  }
  async ls(path){
    try{
      if(path){
        this.cd(path)
      }
      return await fs.readdir(this.root)
    }
    catch(err){
      throw err
    }

  }
  pwd(){
    return this.root
  }
  async stat(path){
    try{
      return await fs.stat(pathLib.resolve(this.root,path))
    }
    catch(err){
      console.log(err)
      return false
    }
  }
}
