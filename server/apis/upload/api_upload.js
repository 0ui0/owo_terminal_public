import pathLib from "path"

export default async () => {
    return {
        method: "GET",
        path: "/attachment/{param*}",
        handler: {
            directory: {
                path: pathLib.resolve("./attachment"),
                redirectToSlash: true
            }
        }
    };
};
