#!/usr/bin/env node
// 指定脚本的执行程序

// @ts-check
const fs = require("fs");
const path = require("path");
// Avoids autoconversion to number of the project name by defining that the args
// non associated with an option ( _ ) needs to be parsed as a string. See #4606
const argv = require("minimist")(process.argv.slice(2), {
  string: ["_"],
});
const prompts = require("prompts");
const {
  yellow,
  green,
  cyan,
  blue,
  magenta,
  lightRed,
  red,
  reset,
} = require("kolorist");
const { execSync } = require("child_process");
const cwd = process.cwd();

const commonDependencies = {
  "@commitlint/cli": "^17.4.4",
  "@geektech/commitlint-config": "^0.0.2",
  "@geektech/eslint-plugin": "^1.0.3",
  "eslint": "^8.36.0",
  husky: "^8.0.3",
};
const frontendDependencied = {
  "stylelint": "^15.3.0",
  "@geektech/stylelint-config": "^0.0.6",
}
const commonScripts = {
  "lint:es": "eslint ./src --ext .ts,.vue --fix",
  "prepare": "husky install"
}
const frontendScripts = {
  "lint:style": "stylelint src/**/*.{css,less,scss,jsx} --fix",
}

const FRAMEWORKS = [
  {
    name: "vue",
    color: green,
    devDependencies: {
      ...frontendDependencied
    },
    scripts: {
      ...frontendScripts
    },
    variants: [
      {
        name: "vue-ts",
        display: "TypeScript",
        color: magenta,
      },
    ],
  },
  {
    name: "react",
    color: cyan,
    variants: [
      {
        name: "react-ts",
        display: "TypeScript",
        color: magenta,
      },
    ],
  },
];

const TEMPLATES = FRAMEWORKS.map(
  (f) => (f.variants && f.variants.map((v) => v.name)) || [f.name]
).reduce((a, b) => a.concat(b), []);

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

function isValidPackageName(projectName) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    projectName
  );
}

function toValidPackageName(projectName) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]/, "")
    .replace(/[^a-z0-9-~]+/g, "-");
}

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, {
    recursive: true,
  });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);
    copy(srcFile, destFile);
  }
}

function isEmpty(path) {
  return fs.readdirSync(path).length === 0;
}

function emptyDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const file of fs.readdirSync(dir)) {
    const abs = path.resolve(dir, file);
    // baseline is Node 12 so can't use rmSync :(
    if (fs.lstatSync(abs).isDirectory()) {
      emptyDir(abs);
      fs.rmdirSync(abs);
    } else {
      fs.unlinkSync(abs);
    }
  }
}

/**
 * @param {string | undefined} userAgent process.env.npm_config_user_agent
 * @returns object | undefined
 */
function pkgFromUserAgent(userAgent) {
  if (!userAgent) return undefined;
  const pkgSpec = userAgent.split(" ")[0];
  const pkgSpecArr = pkgSpec.split("/");
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  };
}

async function init() {
  let targetDir = argv._[0];
  let template = argv.template || argv.t;
  const defaultProjectName = targetDir || "project-starter";
  let result = {};
  try {
    result = await prompts(
      [
        {
          type: targetDir ? null : "text",
          name: "projectName",
          message: reset("Project name:"),
          initial: defaultProjectName,
          onState: (state) =>
            (targetDir = state.value.trim() || defaultProjectName),
        },
        {
          type: () =>
            !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : "confirm",
          name: "overwrite",
          message: () =>
            (targetDir === "."
              ? "Current directory"
              : `Target directory "${targetDir}"`) +
            ` is not empty. Remove existing files and continue?`,
        },
        {
          type: (_, answers) => {
            if (answers?.overwrite === false) {
              throw new Error(red("✖") + " Operation cancelled");
            }
            return null;
          },
          name: "overwriteChecker",
          message: red("✖") + " Operation cancelled",
        },
        {
          type: () => (isValidPackageName(targetDir) ? null : "text"),
          name: "packageName",
          message: reset("Package name:"),
          initial: () => toValidPackageName(targetDir),
          validate: (dir) =>
            isValidPackageName(dir) || "Invalid package.json name",
        },
        {
          type: template && TEMPLATES.includes(template) ? null : "select",
          name: "framework",
          message:
            typeof template === "string" && !TEMPLATES.includes(template)
              ? reset(
                  `"${template}" isn't a valid template. Please choose from below: `
                )
              : reset("Select a framework:"),
          initial: 0,
          choices: FRAMEWORKS.map((framework) => {
            const frameworkColor = framework.color;
            return {
              title: frameworkColor(framework.name),
              value: framework,
            };
          }),
        },
        {
          type: (framework) =>
            framework && framework.variants ? "select" : null,
          name: "variant",
          message: reset("Select a variant:"),
          // @ts-ignore
          choices: (framework) =>
            framework.variants.map((variant) => {
              const variantColor = variant.color;
              return {
                title: variantColor(variant.name),
                value: variant.name,
              };
            }),
        },
      ],
      {
        onCancel: () => {
          throw new Error(red("✖") + " Operation cancelled");
        },
      }
    );
  } catch (cancelled) {
    console.log(cancelled.message);
    return;
  }
  // user choice associated with prompts
  const { framework, overwrite, packageName, projectName, variant } = result;
  // console.log(result);
  const root = path.join(cwd, targetDir);

  if (overwrite) {
    emptyDir(root);
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root);
  }

  // determine template
  template = variant || framework || template;
  console.log(`\nScaffolding project in ${root}...`);
  execSync(`npm create vite ${projectName} -- --template ${template}`);

  copy(path.join(__dirname, "standard/common"), root);
  const templateSpecialDir = path.join(__dirname, `standard/${template}`);
  if (fs.existsSync(templateSpecialDir)) {
    copy(templateSpecialDir, root);
  }

  const targetPackagePath = path.join(root, `package.json`);
  const packageJson = require(targetPackagePath);
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    ...commonDependencies,
    ...(framework.devDependencies || {}),
  };
  packageJson.scripts = {
    ...packageJson.scripts,
    ...commonScripts,
    ...(framework.scripts || {}),
  };
  fs.writeFileSync(targetPackagePath, JSON.stringify(packageJson, null, 2));

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const pkgManager = pkgInfo ? pkgInfo.name : "npm";

  console.log(`\nDone. Now run:\n`);
  if (root !== cwd) {
    console.log(`  cd ${path.relative(cwd, root)}`);
  }
  switch (pkgManager) {
    case "yarn":
      console.log(`  ${pkgManager}`);
      console.log(`  ${pkgManager} dev`);
      break;
    case "pnpm":
      console.log(`  ${pkgManager} i`);
      console.log(`  ${pkgManager} dev`);
      break;
    default:
      console.log(`  ${pkgManager} install`);
      console.log(`  ${pkgManager} run dev`);
      break;
  }
  console.log('Then to use husky, please run:');
  console.log('npm run prepare');
}

init().catch((e) => {
  console.error(e);
});
