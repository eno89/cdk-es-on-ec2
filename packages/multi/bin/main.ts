import * as cdk from "aws-cdk-lib";
import { EsMultiStack } from "../lib/stack/es-multi-stack";
import { devParam } from "../lib/param/parameter";
import * as nag from "cdk-nag";

const app = new cdk.App();
// cdk.Aspects.of(app).add(new nag.AwsSolutionsChecks({ verbose: true }));

const isQuiet = (app.node.tryGetContext("isQuiet") || "false") === "true";
if (isQuiet) {
  console.log = console.info = () => {};
}

const _esMultiStack = new EsMultiStack(app, "Multi", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  stackName: `${devParam.getPrefixPascal()}Main`,
  description: "Single ES",
  tags: {
    Project: devParam.projectName,
    Environment: devParam.envName,
  },
  param: devParam,
});
