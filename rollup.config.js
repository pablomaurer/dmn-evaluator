import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from "rollup-plugin-typescript2";
import pkg from "./package.json";

const input = "src/index.ts";

const plugins = [
  nodeResolve(),
  typescript({
    typescript: require("typescript"),
  }),
];

export default [
  {
    external: ['feelin', 'dmn-moddle'],
    input,
    output: {
      file: pkg.module,
      format: "esm",
      sourcemap: true,
    },
    plugins,
  },
  {
    input,
    output: {
      file: pkg.main,
      format: "cjs",
      sourcemap: true,
    },
    plugins,
  },
];
