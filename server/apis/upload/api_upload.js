import tempPath from "../../tools/tempPath.js"

export default async () => {
    return {
        method: "GET",
        path: "/attachment/{param*}",
        handler: {
            directory: {
                path: tempPath.get("attachment"),
                redirectToSlash: true
            }
        }
    };
};
