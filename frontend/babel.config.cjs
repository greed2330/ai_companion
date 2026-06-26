module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    ["@babel/preset-react", { runtime: "automatic" }]
  ],
  plugins: [
    // Jest는 import.meta를 해석 못함 → DEV=false로 고정
    function replaceImportMeta() {
      return {
        visitor: {
          MetaProperty(path) {
            if (path.node.meta.name === "import" && path.node.property.name === "meta") {
              path.replaceWithSourceString('({ env: { DEV: false } })');
            }
          }
        }
      };
    }
  ]
};
